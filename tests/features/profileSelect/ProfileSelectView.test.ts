import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { ManualClock, syncSha256 } from './manualClock'
import ProfileSelectView from '../../../src/views/ProfileSelectView.vue'
import { useProfileSessionStore } from '../../../src/features/profileSelect/profileSessionStore'
import type { ProfileStore } from '../../../src/features/profileSelect/types'
import { hashPin, verifyPin } from '../../../src/domain/crypto/hashPin'

const profiles = [
  { id: 'p1', nickname: '小深', avatarId: 'angler' },
  { id: 'p2', nickname: '小澜', avatarId: 'jelly' },
]

/** 内存态 fake：`verify` 走真 `verifyPin`（哈希由 `hashPin` 预计算）。 */
async function makeVerifiedStore(correctPin: string): Promise<ProfileStore> {
  const rows = await Promise.all(
    profiles.map(async (profile) => ({
      ...profile,
      salt: `salt-${profile.id}`,
      pinHash: await hashPin(correctPin, `salt-${profile.id}`, syncSha256),
    })),
  )
  return {
    async list() {
      return rows.map(({ id, nickname, avatarId }) => ({ id, nickname, avatarId }))
    },
    async verify(profileId, pin) {
      const row = rows.find((item) => item.id === profileId)
      if (row === undefined) return false
      return verifyPin(pin, row.salt, row.pinHash, syncSha256)
    },
  }
}

async function enterPin(view: VueWrapper, digits: string): Promise<void> {
  await view.get<HTMLInputElement>('[data-testid="pin-input"]').setValue(digits)
}

/**
 * 点“确定”并等异步校验落地。
 *
 * `submit()` 内部 `await store.verify(...)`，而 `trigger('click')` 只 flush 到
 * 下一个 microtick；不额外 `flushPromises()` 的话，断言会跑在校验结果写入
 * 之前，看到的是“什么都没发生”。
 */
async function submitPin(view: VueWrapper): Promise<void> {
  await view.get('[data-testid="pin-submit-native"]').trigger('click')
  await flushPromises()
}

/**
 * 挂载视图并等 `onMounted` 里的 `load()` 落地。
 *
 * 必须 flush：`load()` 在 `onMounted` 的 async 回调里 await，挂载返回时它
 * 尚未 resolve，此时断言列表只会看到“正在打开档案…”。
 *
 * 每次都 `setActivePinia(createPinia())`：这是测试隔离的地基——离开了它，
 * 本文件里的用例会互相共享会话态，用 `vitest -t` 单跑后半段用例时直接
 * 报 "no active Pinia"。
 */
async function mountView(options: {
  store: ProfileStore
  clock: ManualClock
  navigate?: (path: string) => void
}) {
  setActivePinia(createPinia())
  const view = mount(ProfileSelectView, {
    props: { store: options.store, clock: options.clock, navigate: options.navigate },
  })
  await flushPromises()
  return view
}

describe('views: ProfileSelectView', () => {
  it('渲染档案列表，选中档案后出现该档案的 PIN 盘', async () => {
    const clock = new ManualClock()
    const store: ProfileStore = {
      async list() {
        return profiles
      },
      async verify() {
        return false
      },
    }
    const view = await mountView({ store, clock })

    expect(view.findAll('[data-testid^="profile-card-"]')).toHaveLength(2)
    expect(view.text()).toContain('小深')
    expect(view.text()).toContain('小澜')
    expect(view.findAll('[data-testid="profile-avatar"] svg')).toHaveLength(2)

    // 载入后默认选中第一个档案，PIN 盘随之出现（少一次点击）
    expect(view.find('[data-testid="pin-pad"]').text()).toContain('小深')
    const pinInput = view.get<HTMLInputElement>('[data-testid="pin-input"]')
    expect(pinInput.attributes('type')).toBe('password')
    expect(pinInput.attributes('inputmode')).toBe('numeric')
    expect(view.find('[data-testid="pin-dots"]').exists()).toBe(false)
    expect(view.find('[data-testid="pin-key-1"]').exists()).toBe(false)
    expect(view.find('[data-testid="pin-submit-native"]').exists()).toBe(true)
    expect(view.get('[data-testid="profile-journey"]').text()).toContain('解锁生物')

    // 切换到另一个档案：PIN 盘跟随选中项，输入被清空
    await enterPin(view, '1234')
    await view.get('[data-testid="profile-card-p2"]').trigger('click')

    expect(view.find('[data-testid="pin-pad"]').text()).toContain('小澜')
    expect(view.find('[data-testid="pin-pad"]').text()).not.toContain('小深')
    expect(view.get<HTMLInputElement>('[data-testid="pin-input"]').element.value).toBe('')
  })

  it('PIN 错误时显示“再试一次”且不含错因', async () => {
    const clock = new ManualClock()
    const store = await makeVerifiedStore('1234')
    const view = await mountView({ store, clock })

    await enterPin(view, '9999')
    await submitPin(view)

    const error = view.find('[data-testid="pin-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('再试一次')
    // 不展示具体错因：不出现“PIN 错误”“不匹配”这类归因措辞
    expect(error.text()).not.toMatch(/错误|不正确|不匹配|哈希|salt/)
    // 失败后输入被清空（不留下疑似正确的 PIN 残影）
    expect(view.get<HTMLInputElement>('[data-testid="pin-input"]').element.value).toBe('')
    // 整个页面任何位置都不回显明文 PIN（spec §不采集敏感信息）
    expect(view.text()).not.toContain('9999')
  })

  it('连续 5 次错误后输入被锁定并显示 60 秒倒计时', async () => {
    const clock = new ManualClock()
    const store = await makeVerifiedStore('1234')
    const view = await mountView({ store, clock })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await enterPin(view, '9999')
      await submitPin(view)
    }

    // 锁定：掩码输入框与提交都禁用，防止继续盲试
    expect(view.get('[data-testid="pin-input"]').attributes('disabled')).toBeDefined()
    expect(view.get('[data-testid="pin-submit-native"]').attributes('disabled')).toBeDefined()
    expect(view.find('[data-testid="pin-lock-countdown"]').text()).toContain('60')
    // 锁定期只出现倒计时文案，"再试一次"必须撤下（否则两条指令同时出现）
    expect(view.find('[data-testid="pin-error"]').exists()).toBe(false)

    // 推进 59 秒：仍锁定，倒计时降到 1
    clock.advance(59_000)
    await flushPromises()
    expect(view.get('[data-testid="pin-input"]').attributes('disabled')).toBeDefined()
    expect(view.find('[data-testid="pin-lock-countdown"]').text()).toContain('1')

    // 推进满 60 秒：解锁，倒计时消失，键盘恢复可用
    clock.advance(1_000)
    await flushPromises()
    expect(view.find('[data-testid="pin-lock-countdown"]').exists()).toBe(false)
    expect(view.get('[data-testid="pin-input"]').attributes('disabled')).toBeUndefined()

    // 解锁后正确 PIN 可再次进入（锁定期真的过去了，而不是只换了文案）
    await enterPin(view, '1234')
    expect(view.get('[data-testid="pin-submit-native"]').attributes('disabled')).toBeUndefined()
    await submitPin(view)
    expect(view.find('[data-testid="pin-error"]').exists()).toBe(false)
  })

  it('PIN 正确后进入 Home 且 store 载入该档案投影', async () => {
    const clock = new ManualClock()
    const store = await makeVerifiedStore('1234')
    const navigated: string[] = []
    const view = await mountView({
      store,
      clock,
      navigate: (path: string) => {
        navigated.push(path)
      },
    })
    // `mountView` 每次都新建 Pinia，此刻取到的会话态属于本用例自己那一份，
    // 不依赖任何其他用例的遗留 —— 否则 `vitest -t` 单跑本用例会直接失败。
    const session = useProfileSessionStore()

    await view.get('[data-testid="profile-card-p2"]').trigger('click')
    await enterPin(view, '1234')
    await submitPin(view)

    expect(session.activeProfileId).toBe('p2')
    expect(session.projection).toEqual({
      profileId: 'p2',
      nickname: '小澜',
      avatarId: 'jelly',
    })
    expect(navigated).toEqual(['/home'])
  })

  it('退格键删除最后一位', async () => {
    const clock = new ManualClock()
    const store: ProfileStore = {
      async list() {
        return profiles
      },
      async verify() {
        return false
      },
    }
    const view = await mountView({ store, clock })

    await enterPin(view, '12')
    const input = view.get<HTMLInputElement>('[data-testid="pin-input"]')
    await input.setValue('1')
    expect(input.element.value).toBe('1')
  })

  it('list() 抛错时显示全局错误段，且不落到“还没有档案”空态', async () => {
    const clock = new ManualClock()
    const store: ProfileStore = {
      async list() {
        throw new Error('indexeddb 打开失败')
      },
      async verify() {
        return false
      },
    }
    const view = await mountView({ store, clock })

    // 列表为空但出错：必须说"打不开"，而不是"请家长去新建"
    const error = view.find('[data-testid="profile-list-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('档案打不开，再试一次')
    // 空态文案绝不出现：那是给"真的没有档案"用的
    expect(view.find('[data-testid="profile-empty"]').exists()).toBe(false)
    // 不出现具体错因（规格 §PIN 错误 / §不采集敏感信息）
    expect(view.text()).not.toContain('indexeddb')
    expect(view.text()).not.toContain('打开失败')
    // 没有档案可选，PIN 盘自然不渲染
    expect(view.find('[data-testid="pin-pad"]').exists()).toBe(false)
  })

  it('本机没有任何档案时展示空态，不出现 PIN 盘', async () => {
    const clock = new ManualClock()
    const verifyCalls: string[] = []
    const store: ProfileStore = {
      async list() {
        return []
      },
      async verify(profileId, pin) {
        verifyCalls.push(`${profileId}:${pin}`)
        return false
      },
    }
    const view = await mountView({ store, clock })

    expect(view.find('[data-testid="profile-empty"]').exists()).toBe(true)
    expect(view.find('[data-testid="profile-empty"]').text()).toContain('家长')
    expect(view.find('[data-testid="profile-empty-card"]').exists()).toBe(true)
    expect(view.find('[data-testid="profile-empty-card"]').text()).toContain('一起下潜')
    expect(view.find('[data-testid="pin-pad"]').exists()).toBe(false)
    expect(verifyCalls).toEqual([])
  })
})

/**
 * 掩码输入框与数字键盘是**同一份输入状态**的两条路，因此这一组用例只在装配
 * 层面断言"两条路读到的位数一致"——过滤规则本身归 `useProfileSelect` 的单测。
 */
describe('views: ProfileSelectView 掩码输入框', () => {
  it('打字同步点数回显，非数字被过滤且不留残影', async () => {
    const clock = new ManualClock()
    const store = await makeVerifiedStore('1234')
    const view = await mountView({ store, clock })
    const input = view.get<HTMLInputElement>('[data-testid="pin-input"]')

    input.element.value = '12'
    await input.trigger('input')
    await flushPromises()
    expect(input.element.value).toBe('12')

    input.element.value = '12a'
    await input.trigger('input')
    await flushPromises()
    // 位数不变（'a' 被 composable 剥掉），框里也被抹回权威值。
    expect(input.element.value).toBe('12')
    expect(input.element.value).toBe('12')
  })

  it('系统数字键盘输入与删除后，受控掩码框保留当前数字', async () => {
    const clock = new ManualClock()
    const store = await makeVerifiedStore('1234')
    const view = await mountView({ store, clock })
    const input = view.get<HTMLInputElement>('[data-testid="pin-input"]')

    await input.setValue('34')
    expect(input.element.value).toBe('34')
    await input.setValue('3')
    expect(input.element.value).toBe('3')
  })

  it('从输入框打字也能完成一次登录（两条路等价）', async () => {
    const clock = new ManualClock()
    const store = await makeVerifiedStore('1234')
    const navigated: string[] = []
    const view = await mountView({
      store,
      clock,
      navigate: (path: string) => {
        navigated.push(path)
      },
    })
    const input = view.get<HTMLInputElement>('[data-testid="pin-input"]')

    input.element.value = '1234'
    await input.trigger('input')
    await submitPin(view)

    expect(navigated).toEqual(['/home'])
    expect(useProfileSessionStore().activeProfileId).toBe('p1')
  })
})
