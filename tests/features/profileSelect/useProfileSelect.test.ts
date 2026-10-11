import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ManualClock } from './manualClock'
import { useProfileSessionStore } from '../../../src/features/profileSelect/profileSessionStore'
import { useProfileSelect } from '../../../src/features/profileSelect/useProfileSelect'
import type { ProfileStore } from '../../../src/features/profileSelect/types'

function makeStore(options: {
  profiles: Array<{ id: string; nickname: string; avatarId: string }>
  correctPin?: string
  verifyCalls?: string[]
}): ProfileStore {
  const verifyCalls = options.verifyCalls ?? []
  return {
    async list() {
      return options.profiles
    },
    async verify(profileId, pin) {
      verifyCalls.push(`${profileId}:${pin}`)
      return pin === (options.correctPin ?? '1234')
    },
  }
}

describe('features/profileSelect: useProfileSelect', () => {
  // 每个用例一份全新 Pinia：会话态（当前档案/投影）必须跨用例隔离，
  // 否则上一个用例的登录结果会污染下一个用例的断言。
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('load() 载入档案列表并默认选中第一个', async () => {
    const store = makeStore({
      profiles: [
        { id: 'p1', nickname: '小深', avatarId: 'angler' },
        { id: 'p2', nickname: '小澜', avatarId: 'jelly' },
      ],
    })
    const select = useProfileSelect({ store, clock: new ManualClock() })

    await select.load()

    expect(select.profiles.value.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(select.selectedId.value).toBe('p1')
    expect(select.status.value).toBe('idle')
  })

  it('成功校验后进入 Home 且 store 载入该档案投影', async () => {
    const session = useProfileSessionStore()
    const store = makeStore({ profiles: [{ id: 'p1', nickname: '小深', avatarId: 'angler' }] })
    const navigated: string[] = []
    const select = useProfileSelect({
      store,
      clock: new ManualClock(),
      navigate: (path) => {
        navigated.push(path)
      },
    })

    await select.load()
    select.pushDigit('1')
    select.pushDigit('2')
    select.pushDigit('3')
    select.pushDigit('4')
    await select.submit()

    expect(navigated).toEqual(['/home'])
    expect(session.activeProfileId).toBe('p1')
    expect(session.projection).toEqual({
      profileId: 'p1',
      nickname: '小深',
      avatarId: 'angler',
    })
    expect(select.status.value).toBe('success')
  })

  it('PIN 错误时错误文案固定为“再试一次”且不含错因', async () => {
    const store = makeStore({ profiles: [{ id: 'p1', nickname: '小深', avatarId: 'angler' }], correctPin: '1234' })
    const select = useProfileSelect({ store, clock: new ManualClock() })

    await select.load()
    for (const digit of ['9', '9', '9', '9']) select.pushDigit(digit)
    await select.submit()

    expect(select.errorMessage.value).toBe('再试一次')
    expect(select.errorMessage.value).not.toContain('错')
    expect(select.errorMessage.value).not.toContain('不')
    expect(select.errorMessage.value).not.toContain('PIN')
    expect(select.pin.value).toBe('')
    expect(select.status.value).toBe('error')
  })

  it('连续 5 次错误后锁定 60 秒，倒计时期间提交被拒绝', async () => {
    const clock = new ManualClock()
    const verifyCalls: string[] = []
    const tracking = makeStore({
      profiles: [{ id: 'p1', nickname: '小深', avatarId: 'angler' }],
      correctPin: '1234',
      verifyCalls,
    })
    const navigated: string[] = []
    const select = useProfileSelect({ store: tracking, clock, navigate: (path) => navigated.push(path) })

    await select.load()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      for (const digit of ['9', '9', '9', '9']) select.pushDigit(digit)
      await select.submit()
    }

    expect(select.locked.value).toBe(true)
    expect(select.remainingSeconds.value).toBe(60)
    // 进入锁定态后错误文案撤下：只留"请等 N 秒"，避免两条指令同时出现
    expect(select.errorMessage.value).toBe('')
    expect(select.status.value).toBe('locked')

    // 锁定期间再提交：不再调用 store.verify
    const before = verifyCalls.length
    for (const digit of ['1', '2', '3', '4']) select.pushDigit(digit)
    await select.submit()
    expect(verifyCalls.length).toBe(before)
    // `pushDigit` 的 locked 守卫是输入侧的第一道闸；这里断言 pin 仍为空，
    // 证明提交被拒不是因为"没输满 4 位"这种偶然，而是锁定期真的挡住了输入。
    expect(select.pin.value).toBe('')
    expect(select.status.value).toBe('locked')

    // 推进 59 秒仍未解锁
    clock.advance(59_000)
    expect(select.locked.value).toBe(true)
    expect(select.remainingSeconds.value).toBe(1)

    // 推进满 60 秒后解锁
    clock.advance(1_000)
    expect(select.locked.value).toBe(false)
    expect(select.remainingSeconds.value).toBe(0)
    expect(select.failureCount.value).toBe(0)

    // 解锁后正确 PIN 可以进入 Home
    for (const digit of ['1', '2', '3', '4']) select.pushDigit(digit)
    await select.submit()
    expect(select.status.value).toBe('success')
    expect(navigated).toEqual(['/home'])
  })

  it('成功一次后错误计数归零（不跨成功累计）', async () => {
    const store = makeStore({ profiles: [{ id: 'p1', nickname: '小深', avatarId: 'angler' }], correctPin: '1234' })
    const select = useProfileSelect({ store, clock: new ManualClock() })

    await select.load()
    for (const digit of ['9', '9', '9', '9']) select.pushDigit(digit)
    await select.submit()
    expect(select.failureCount.value).toBe(1)

    for (const digit of ['1', '2', '3', '4']) select.pushDigit(digit)
    await select.submit()
    expect(select.failureCount.value).toBe(0)

    for (const digit of ['9', '9', '9', '9']) select.pushDigit(digit)
    await select.submit()
    expect(select.failureCount.value).toBe(1)
  })

  it('切换档案时清空输入与错误提示，但不清空累计失败次数', async () => {
    const clock = new ManualClock()
    const store = makeStore({
      profiles: [
        { id: 'p1', nickname: '小深', avatarId: 'angler' },
        { id: 'p2', nickname: '小澜', avatarId: 'jelly' },
      ],
      correctPin: '1234',
    })
    const select = useProfileSelect({ store, clock })

    await select.load()
    for (const digit of ['9', '9', '9', '9']) select.pushDigit(digit)
    await select.submit()
    expect(select.failureCount.value).toBe(1)

    select.selectProfile('p2')

    expect(select.pin.value).toBe('')
    expect(select.errorMessage.value).toBe('')
    // 失败计数保留：锁定策略按输入次数累计，不因切换档案重置（防绕过）
    expect(select.failureCount.value).toBe(1)
  })

  it('PIN 输满 4 位后忽略继续输入', async () => {
    const store = makeStore({ profiles: [{ id: 'p1', nickname: '小深', avatarId: 'angler' }] })
    const select = useProfileSelect({ store, clock: new ManualClock() })

    await select.load()
    for (const digit of ['1', '2', '3', '4', '5', '6']) select.pushDigit(digit)

    expect(select.pin.value).toBe('1234')
  })

  it('非数字输入被忽略：pin 不掺入任何非 0-9 字符', async () => {
    const store = makeStore({ profiles: [{ id: 'p1', nickname: '小深', avatarId: 'angler' }] })
    const select = useProfileSelect({ store, clock: new ManualClock() })

    await select.load()
    select.pushDigit('1')
    select.pushDigit('2')
    select.pushDigit('ab')
    select.pushDigit('')
    select.pushDigit('1a')
    select.pushDigit('3')
    select.pushDigit('-')
    select.pushDigit('４') // 全角数字同样不算
    select.pushDigit('4')

    // 输入合法性的判据在 composable：放行非数字会让 verify 收到畸形 PIN，
    // 把「输入不对」伪装成「密码错了」。
    expect(select.pin.value).toBe('1234')
  })

  it('未选档案时提交无效且不调用 store.verify', async () => {
    const verifyCalls: string[] = []
    const store = makeStore({ profiles: [], verifyCalls })
    const select = useProfileSelect({ store, clock: new ManualClock() })

    await select.load()
    for (const digit of ['1', '2', '3', '4']) select.pushDigit(digit)
    await select.submit()

    expect(verifyCalls).toEqual([])
    expect(select.status.value).toBe('idle')
  })

  it('日志出口经 redact() 脱敏：pin / salt 不会进入日志', async () => {
    const entries: Array<Record<string, unknown>> = []
    const store: ProfileStore = {
      async list() {
        // 模拟底层把上下文对象挂到 Error 上的常见写法（pin/salt 也一起带出来）
        const failure = new Error('读取档案失败')
        Object.assign(failure, { pin: '1234', salt: 'salt-p1', profileId: 'p1' })
        throw failure
      },
      async verify() {
        return false
      },
    }
    const select = useProfileSelect({
      store,
      clock: new ManualClock(),
      logger: (entry) => {
        entries.push(entry)
      },
    })

    await select.load()

    expect(entries).toHaveLength(1)
    expect(entries[0]?.event).toBe('profile-list-failed')
    const serialized = JSON.stringify(entries[0])
    expect(serialized).not.toContain('1234')
    expect(serialized).not.toContain('salt-p1')
    // 非敏感字段仍可用于排查
    expect(serialized).toContain('p1')
  })

  it('verify 抛错时日志同样脱敏，且异常信息不带到 UI', async () => {
    const entries: Array<Record<string, unknown>> = []
    const store: ProfileStore = {
      async list() {
        return [{ id: 'p1', nickname: '小深', avatarId: 'angler' }]
      },
      async verify() {
        const failure = new Error('校验失败')
        Object.assign(failure, { pin: '9999', salt: 'salt-p1' })
        throw failure
      },
    }
    const select = useProfileSelect({
      store,
      clock: new ManualClock(),
      logger: (entry) => {
        entries.push(entry)
      },
    })

    await select.load()
    for (const digit of ['9', '9', '9', '9']) select.pushDigit(digit)
    await select.submit()

    expect(entries).toHaveLength(1)
    const serialized = JSON.stringify(entries[0])
    expect(serialized).not.toContain('9999')
    expect(serialized).not.toContain('salt-p1')
    // UI 侧仍然是唯一那句中性文案
    expect(select.errorMessage.value).toBe('再试一次')
    // 抛错也计入失败次数：否则反复触发存储异常就成了绕过锁定策略的后门
    expect(select.failureCount.value).toBe(1)
  })

  it('不注入时钟时默认走浏览器定时器（生产装配不必手搓时钟）', async () => {
    const store = makeStore({ profiles: [{ id: 'p1', nickname: '小深', avatarId: 'angler' }] })
    // 刻意不传 clock / navigate：默认值必须真的可用，否则每次装配都要重复 wiring。
    const select = useProfileSelect({ store })

    await select.load()
    for (const digit of ['1', '2', '3', '4']) select.pushDigit(digit)
    await select.submit()

    expect(select.status.value).toBe('success')
  })
})

describe('features/profileSelect: profileSessionStore', () => {
  /*
   * 本 describe 也要有自己的 `setActivePinia`。
   *
   * 不能依赖上一个 describe 的 `beforeEach`：Vitest 的钩子只在**同一个
   * describe 作用域**内生效，跨 describe 不共享。少了这一行，用例单独运行
   * （`vitest -t`）或文件后半段时，Pinia 尚未激活即报
   * "getActivePinia() was called but there was no active Pinia"。
   */
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('setActive 写入会话态，clear 清空（登出/切换档案入口）', () => {
    const session = useProfileSessionStore()
    session.setActive({ profileId: 'p1', nickname: '小深', avatarId: 'angler' })

    expect(session.activeProfileId).toBe('p1')
    expect(session.projection).toEqual({ profileId: 'p1', nickname: '小深', avatarId: 'angler' })

    session.clear()

    expect(session.activeProfileId).toBeNull()
    expect(session.projection).toBeNull()
  })
})
