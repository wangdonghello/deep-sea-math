import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ManualClock, syncSha256 } from '../profileSelect/manualClock'
import ParentGateView from '../../../src/views/ParentGateView.vue'
import type { ParentGuardRecord, ParentGuardStore } from '../../../src/features/parentPanel/types'
import { hashPin } from '../../../src/domain/crypto/hashPin'

/**
 * `ParentGateView` 的装配契约。
 *
 * 只锁"装配"：门禁页有没有正确地把 `useParentGate` 的状态接上 PinPad、有没有在
 * 放行时 emit。业务规则（设置几步、几次锁定）归 `useParentGate` 的单测。
 */

const SALT = 'ab'.repeat(16)

/** 造一份家长 PIN 记录（哈希由真 `hashPin` 预计算）。 */
async function record(pin = '1234'): Promise<ParentGuardRecord> {
  return { id: 'parent', pinHash: await hashPin(pin, SALT, syncSha256), salt: SALT }
}

/** 内存态 fake 门禁 store。 */
function makeStore(initial: ParentGuardRecord | null = null): ParentGuardStore {
  let current: ParentGuardRecord | undefined = initial ?? undefined
  return {
    async load() {
      return current === undefined ? undefined : { ...current }
    },
    async save(next) {
      current = { ...next }
    },
  }
}

/** 挂载门禁页（注入假时钟/固定盐/同步摘要），并等 `load()` 落地。 */
async function mountGate(store: ParentGuardStore) {
  setActivePinia(createPinia())
  const view = mount(ParentGateView, {
    props: {
      store,
      clock: new ManualClock(),
      randomBytes: () => new Uint8Array(16).fill(0xab),
      digest: syncSha256,
    },
  })
  await flushPromises()
  return view
}

/** 用数字键盘敲一串数字并提交。 */
async function enter(view: Awaited<ReturnType<typeof mountGate>>, digits: string): Promise<void> {
  for (const digit of digits) {
    await view.get(`[data-testid="pin-key-${digit}"]`).trigger('click')
  }
  await view.get('[data-testid="pin-submit"]').trigger('click')
  await flushPromises()
}

describe('views: ParentGateView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未设过家长 PIN：标题为"设置"、无错误提示、含掩码输入框', async () => {
    const view = await mountGate(makeStore(null))

    expect(view.find('[data-testid="parent-gate"]').exists()).toBe(true)
    expect(view.get('.pin-pad__title').text()).toBe('设置家长密码')
    expect(view.find('[data-testid="parent-gate-hint"]').text()).toContain('设置')
    expect(view.find('[data-testid="parent-gate-panel"]').exists()).toBe(true)
    expect(view.find('[data-testid="pin-input"]').exists()).toBe(true)
    // 档案选择页的那套 testid 原样复用（同一套输入交互）
    expect(view.find('[data-testid="pin-dots"]').exists()).toBe(true)
  })

  it('两次输入一致后 emit unlocked（不自己导航）', async () => {
    const view = await mountGate(makeStore(null))

    await enter(view, '1234')
    expect(view.find('[data-testid="parent-gate-hint"]').text()).toContain('再输一次')
    expect(view.emitted('unlocked')).toBeUndefined()

    await enter(view, '1234')

    expect(view.emitted('unlocked')).toHaveLength(1)
    // 明文不回显：整页文本里不出现 PIN 本身
    expect(view.find('[data-testid="pin-dots"]').attributes('data-filled')).toBe('0')
  })

  it('已设过家长 PIN：错误提示"再试一次"，正确后 emit unlocked', async () => {
    const view = await mountGate(makeStore(await record('1234')))
    expect(view.get('.pin-pad__title').text()).toBe('家长密码')

    await enter(view, '9999')
    expect(view.find('[data-testid="pin-error"]').text()).toBe('再试一次')
    expect(view.emitted('unlocked')).toBeUndefined()

    await enter(view, '1234')
    expect(view.emitted('unlocked')).toHaveLength(1)
  })

  it('家长区说明不含任何个人信息采集口径', async () => {
    const view = await mountGate(makeStore(null))

    const text = view.text()
    expect(text).toContain('家长区')
    expect(text).toContain('不收集')
    expect(text).not.toMatch(/真实姓名|学校|电话|位置/)
  })
})
