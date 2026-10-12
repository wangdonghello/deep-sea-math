import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ManualClock, syncSha256 } from '../profileSelect/manualClock'
import { useParentGate } from '../../../src/features/parentPanel/useParentGate'
import { useParentSessionStore } from '../../../src/features/parentPanel/parentSessionStore'
import type { ParentGuardRecord, ParentGuardStore } from '../../../src/features/parentPanel/types'
import { hashPin } from '../../../src/domain/crypto/hashPin'

/**
 * `useParentGate` 的行为契约（家长区门禁）。
 *
 * 门禁与孩子 PIN 用**同一套锁定口径**（连续 5 次错误锁定 60 秒、错误只说
 * "再试一次"），因此这里的用例形状与 `useProfileSelect.test.ts` 对齐：
 *
 * 1. 首次（没设过 PIN）：两次输入一致才落库；不一致给中性文案且不落库；
 * 2. 已设过：比对哈希，成功即解锁；失败走"再试一次"+ 5 次锁定；
 * 3. PIN 明文只活在短生命周期输入里，提交后立刻清空，绝不进日志。
 */

/** 测试用固定盐（16 字节 0xab → 32 个 'ab'）。 */
const FIXED_SALT = 'ab'.repeat(16)

/** 造一份家长 PIN 记录（哈希由真 `hashPin` 预计算）。 */
async function makeRecord(pin = '1234'): Promise<ParentGuardRecord> {
  return { id: 'parent', pinHash: await hashPin(pin, FIXED_SALT, syncSha256), salt: FIXED_SALT }
}

/** 内存态 fake：记录存在变量里，语义与 `GuardRepo` 一致。 */
function makeStore(initial: ParentGuardRecord | null = null): {
  store: ParentGuardStore
  saved: ParentGuardRecord[]
  loadCalls: () => number
} {
  let current: ParentGuardRecord | undefined = initial ?? undefined
  const saved: ParentGuardRecord[] = []
  let loadCalls = 0
  return {
    saved,
    loadCalls: () => loadCalls,
    store: {
      async load() {
        loadCalls += 1
        return current === undefined ? undefined : { ...current }
      },
      async save(record) {
        saved.push({ ...record })
        current = { ...record }
      },
    },
  }
}

/** 造一个门禁实例（注入假时钟、固定盐与同步摘要）。 */
function makeGate(options: {
  store: ParentGuardStore
  clock?: ManualClock
  logger?: (entry: Record<string, unknown>) => void
}) {
  return useParentGate({
    store: options.store,
    clock: options.clock ?? new ManualClock(),
    randomBytes: () => new Uint8Array(16).fill(0xab),
    digest: syncSha256,
    logger: options.logger,
  })
}

/** 用组合式的输入路径敲一串数字。 */
function type(gate: ReturnType<typeof useParentGate>, digits: string): void {
  for (const digit of digits) gate.pushDigit(digit)
}

describe('features/parentPanel: useParentGate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('未设置过家长 PIN 时进入"设置"模式（hasPin=false）', async () => {
    const { store } = makeStore(null)
    const gate = makeGate({ store })

    await gate.load()

    expect(gate.hasPin.value).toBe(false)
    expect(gate.mode.value).toBe('create')
    expect(gate.loading.value).toBe(false)
    expect(gate.unlocked.value).toBe(false)
  })

  it('已设置过家长 PIN 时进入"校验"模式（hasPin=true）', async () => {
    const { store } = makeStore(await makeRecord())
    const gate = makeGate({ store })

    await gate.load()

    expect(gate.hasPin.value).toBe(true)
    expect(gate.mode.value).toBe('verify')
  })

  it('load() 失败时只给中性提示，不抛错也不放行', async () => {
    const gate = makeGate({
      store: {
        async load() {
          throw new Error('indexeddb 打开失败')
        },
        async save() {},
      },
    })

    await gate.load()

    expect(gate.errorMessage.value).toBe('再试一次')
    expect(gate.unlocked.value).toBe(false)
  })

  it('首次设置：满 4 位提交后进入确认步，输入被清空', async () => {
    const { store, saved } = makeStore(null)
    const gate = makeGate({ store })
    await gate.load()

    type(gate, '1234')
    expect(gate.pin.value).toBe('1234')
    await gate.submit()

    expect(gate.mode.value).toBe('confirm')
    expect(gate.pin.value).toBe('')
    // 只走到确认步：还没落库、也没解锁。
    expect(saved).toEqual([])
    expect(gate.unlocked.value).toBe(false)
  })

  it('两次输入不一致：给中性文案、回到设置步、不落库、不解锁', async () => {
    const { store, saved } = makeStore(null)
    const gate = makeGate({ store })
    await gate.load()

    type(gate, '1234')
    await gate.submit()
    type(gate, '5678')
    await gate.submit()

    expect(saved).toEqual([])
    expect(gate.mode.value).toBe('create')
    expect(gate.unlocked.value).toBe(false)
    expect(gate.errorMessage.value).not.toBe('')
    // 不含任何归因措辞（不泄露"是不是 PIN 错"）
    expect(gate.errorMessage.value).not.toMatch(/哈希|salt|明文|正确/)
    expect(gate.pin.value).toBe('')
  })

  it('两次输入一致：落库哈希 + 盐、解锁、清空输入', async () => {
    const { store, saved } = makeStore(null)
    const gate = makeGate({ store })
    await gate.load()

    type(gate, '1234')
    await gate.submit()
    type(gate, '1234')
    await gate.submit()

    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe('parent')
    expect(saved[0].salt).toBe(FIXED_SALT)
    expect(saved[0].pinHash).toBe(await hashPin('1234', FIXED_SALT, syncSha256))
    // 明文 MUST NOT 出现在记录的任何字段里
    expect(JSON.stringify(saved[0])).not.toContain('1234')
    expect(gate.unlocked.value).toBe(true)
    expect(gate.pin.value).toBe('')
    expect(gate.errorMessage.value).toBe('')
  })

  it('已设过：正确 PIN 解锁', async () => {
    const { store } = makeStore(await makeRecord('1234'))
    const gate = makeGate({ store })
    await gate.load()

    type(gate, '1234')
    await gate.submit()

    expect(gate.unlocked.value).toBe(true)
    expect(gate.pin.value).toBe('')
    expect(gate.errorMessage.value).toBe('')
    // 解锁写进的是父会话 store：路由守卫正是读它决定放不放行。
    expect(useParentSessionStore().unlocked).toBe(true)
  })

  it('未解锁前父会话 store 保持 locked（刷新后重新验证）', async () => {
    const session = useParentSessionStore()
    const { store } = makeStore(await makeRecord('1234'))
    const gate = makeGate({ store })
    await gate.load()

    type(gate, '9999')
    await gate.submit()

    expect(session.unlocked).toBe(false)
    session.unlock()
    expect(session.unlocked).toBe(true)
    session.lock()
    expect(session.unlocked).toBe(false)
  })

  it('已设过：错误 PIN 只说"再试一次"，输入被清空且不解锁', async () => {
    const { store } = makeStore(await makeRecord('1234'))
    const gate = makeGate({ store })
    await gate.load()

    type(gate, '9999')
    await gate.submit()

    expect(gate.unlocked.value).toBe(false)
    expect(gate.errorMessage.value).toBe('再试一次')
    expect(gate.pin.value).toBe('')
  })

  it('连续 5 次错误后锁定 60 秒，倒计时结束才恢复', async () => {
    const clock = new ManualClock()
    const { store } = makeStore(await makeRecord('1234'))
    const gate = makeGate({ store, clock })
    await gate.load()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      type(gate, '9999')
      await gate.submit()
    }

    expect(gate.locked.value).toBe(true)
    expect(gate.remainingSeconds.value).toBe(60)
    // 锁定期不再叠加"再试一次"（那条指令此刻不可执行）
    expect(gate.errorMessage.value).toBe('')

    clock.advance(60_000)
    expect(gate.locked.value).toBe(false)
  })

  it('输入过滤：非数字与超长被忽略，退格删一位；setPin 整体赋值同样过滤', async () => {
    const { store } = makeStore(null)
    const gate = makeGate({ store })
    await gate.load()

    gate.pushDigit('a')
    gate.pushDigit('１２') // 全角数字不是 ASCII 数字
    expect(gate.pin.value).toBe('')

    type(gate, '1234')
    gate.pushDigit('5') // 满 4 位后忽略
    expect(gate.pin.value).toBe('1234')

    gate.backspace()
    expect(gate.pin.value).toBe('123')

    gate.setPin('9a8b')
    expect(gate.pin.value).toBe('98')
    gate.setPin('123456')
    expect(gate.pin.value).toBe('1234')
    gate.setPin('')
    expect(gate.pin.value).toBe('')
  })

  it('日志出口只带事件名与错误，绝不主动携带 PIN 明文或盐', async () => {
    const entries: Record<string, unknown>[] = []
    const gate = makeGate({
      store: {
        async load() {
          throw new Error('indexeddb 打开失败')
        },
        async save() {},
      },
      logger: (entry) => entries.push(entry),
    })

    await gate.load()

    expect(entries).toHaveLength(1)
    expect(entries[0].event).toBe('parent-guard-load-failed')
    // 任何一条日志里都不存在 pin / salt 字段（明文只活在输入 ref 里，提交即清）。
    expect(entries.every((entry) => !('pin' in entry) && !('salt' in entry))).toBe(true)
  })
})


