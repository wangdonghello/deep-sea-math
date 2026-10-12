import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DB_NAME, resolveStorage } from '../../src/data/db'
import type { StorageFacade } from '../../src/data/db'
import { deleteDatabase, installFakeIndexedDb } from './fakeIndexedDb'
import { PROFILE_A, makeProfile, makeSettings } from './fixtures'

/**
 * `resolveStorage` 的行为契约（spec `offline-event-log` §存储降级与家长提示、
 * design §5 异常处理：「IndexedDB 不可用 → 切 memoryFallback，家长区常驻警示条」）。
 *
 * 锁四件事：
 * 1. **正常环境**：探测通过时返回 IndexedDB 态门面，`degraded` 为 false，
 *    四个仓储齐备且数据跨调用保持（第二次 `resolveStorage` 仍读得到）；
 * 2. **`indexedDB.open` 同步抛错**（隐私模式的典型表现）：降级为内存态门面，
 *    `degraded` 置真并给出原因——家长区警示条据此渲染，MUST NOT 静默降级；
 * 3. **open 异步失败**（error 事件，存储超限/用户拒绝）：同样降级；
 * 4. **退出隐私模式后恢复**：`resolveStorage` 是每次调用重新探测，环境恢复后
 *    再次解析即回到 IndexedDB 态（spec §退出隐私模式后恢复）。
 *
 * 内存态门面必须**完全可用**（写后能读回）——降级只降存储介质，不降功能。
 */

/** 把全局 `indexedDB` 换成一个"打开即同步抛错"的假实现。 */
function installThrowingIndexedDb(message: string): void {  const scope = globalThis as unknown as Record<string, unknown>
  scope.indexedDB = {
    open: () => {
      throw new Error(message)
    },
  }
}

/**
 * 把全局 `indexedDB` 换成一个"打开后触发 error 事件"的假实现。
 *
 * 两个必须做对的点：
 * 1. 打开请求必须是 `IDBRequest` 的实例——`idb` 的 `wrap()` 只对
 *    `instanceof IDBRequest` 的请求做 Promise 包装，否则会把假请求原样返回，
 *    随后的 `.then` 直接炸掉，测到的就不是降级而是类型错误；
 * 2. `readyState` 置为 done——`request.error` 取值器在 pending 状态会抛
 *    InvalidStateError（真实请求在 error 事件前就已进入 done）。
 *
 * `dispatchEvent` 只做"按 type 回调已注册的监听器"这一件事：fake-indexeddb
 * 的 dispatchEvent 要求事件对象带它自己的内部字段，DOM 的 `Event` 不带，
 * 拿它去派发会先抛 InvalidStateError——那测的是事件形状，不是降级行为。
 */
function installFailingOpenIndexedDb(message: string): void {
  class FailingOpenRequest extends globalThis.IDBRequest {
    constructor() {
      super()
      // 运行时可写，TS 的 DOM 类型把它标成 readonly；这里按测试需要改写。
      const writable = this as { readyState: string; error: unknown }
      writable.readyState = 'done'
      writable.error = new Error(message)
    }

    dispatchEvent(event: { type: string }): boolean {
      // `listeners` 是 fake-indexeddb 的内部字段，DOM 类型里没有。
      const listeners = (this as unknown as {
        listeners: { type: string; callback: (event: unknown) => void }[]
      }).listeners
      for (const listener of listeners) {
        if (listener.type === event.type) {
          listener.callback.call(this, event)
        }
      }
      return true
    }
  }

  const scope = globalThis as unknown as Record<string, unknown>
  scope.indexedDB = {
    open: () => {
      const request = new FailingOpenRequest()
      queueMicrotask(() => request.dispatchEvent({ type: 'error' }))
      return request
    },
  }
}

/** 本文件创建过的全部门面，`afterEach` 统一关闭（否则删库会被 blocked 挂住）。 */
const facades: StorageFacade[] = []

/** 登记门面，返回原 promise。 */
function track(opening: Promise<StorageFacade>): Promise<StorageFacade> {
  void opening.then((storage) => facades.push(storage))
  return opening
}

describe('data/db: resolveStorage — 正常环境', () => {
  let restore: () => void

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
  })

  afterEach(async () => {
    for (const storage of facades.splice(0)) {
      await storage.close()
    }
    restore()
  })

  it('返回 IndexedDB 态门面：degraded 为 false，五个仓储齐备', async () => {
    const storage = await track(resolveStorage())

    expect(storage.kind).toBe('indexeddb')
    expect(storage.degraded).toBe(false)
    expect(storage.degradedReason).toBeNull()
    expect(storage.profiles).toBeDefined()
    expect(storage.events).toBeDefined()
    expect(storage.settings).toBeDefined()
    expect(storage.bestiary).toBeDefined()
    expect(storage.guard).toBeDefined()
  })

  it('同一份数据跨两次 resolveStorage 仍可读（IndexedDB 持久在库中）', async () => {
    const first = await track(resolveStorage())
    await first.profiles.save(makeProfile(PROFILE_A))
    await first.close()

    const second = await track(resolveStorage())
    expect(await second.profiles.get(PROFILE_A)).toEqual(makeProfile(PROFILE_A))
  })
})

describe('data/db: resolveStorage — 降级路径', () => {
  let restore: () => void

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
  })

  afterEach(async () => {
    for (const storage of facades.splice(0)) {
      await storage.close()
    }
    restore()
  })

  it('indexedDB.open 同步抛错 → 内存态门面，degraded 置真且给出原因', async () => {
    installThrowingIndexedDb('indexedDB 在隐私模式下不可用')

    const storage = await track(resolveStorage())

    expect(storage.kind).toBe('memory')
    expect(storage.degraded).toBe(true)
    expect(storage.degradedReason).toContain('indexedDB 在隐私模式下不可用')
    await storage.close()
  })

  it('indexedDB.open 异步失败（error 事件）→ 同样降级为内存态', async () => {
    installFailingOpenIndexedDb('存储超限')

    const storage = await track(resolveStorage())

    expect(storage.kind).toBe('memory')
    expect(storage.degraded).toBe(true)
    expect(storage.degradedReason).toContain('存储超限')
    await storage.close()
  })

  it('全局完全没有 indexedDB 时也降级，而不是抛异常', async () => {    const scope = globalThis as unknown as Record<string, unknown>
    scope.indexedDB = undefined

    const storage = await track(resolveStorage())

    expect(storage.kind).toBe('memory')
    expect(storage.degraded).toBe(true)
    await storage.close()
  })

  it('降级后数据不静默丢弃：内存态门面写后仍能读回', async () => {
    installThrowingIndexedDb('隐私模式')

    const storage = await track(resolveStorage())
    await storage.profiles.save(makeProfile(PROFILE_A))
    await storage.settings.save(PROFILE_A, makeSettings())
    await storage.bestiary.save({ profileId: PROFILE_A, unlockedCreatureIds: ['johnsons-anglerfish'] })
    await storage.guard.save({ id: 'parent', pinHash: 'a'.repeat(64), salt: 'b'.repeat(16) })

    expect(await storage.profiles.get(PROFILE_A)).toEqual(makeProfile(PROFILE_A))
    expect(await storage.settings.get(PROFILE_A)).toEqual(makeSettings())
    expect(await storage.bestiary.load(PROFILE_A)).toEqual({
      profileId: PROFILE_A,
      unlockedCreatureIds: ['johnsons-anglerfish'],
    })
    // 家长 PIN 在降级态同样可用：门禁不因隐私模式而失效。
    expect(await storage.guard.load()).toEqual({ id: 'parent', pinHash: 'a'.repeat(64), salt: 'b'.repeat(16) })
    await storage.close()
  })

  it('降级原因兜底：空消息与非 Error 抛出也不会给界面一个空原因', async () => {
    installThrowingIndexedDb('')
    const emptyMessage = await track(resolveStorage())
    expect(emptyMessage.kind).toBe('memory')
    expect(emptyMessage.degradedReason).toBe('IndexedDB 打开失败')

    const scope = globalThis as unknown as Record<string, unknown>
    scope.indexedDB = {
      open: () => {
        throw '隐私模式'
      },
    }
    const nonError = await track(resolveStorage())
    expect(nonError.kind).toBe('memory')
    expect(nonError.degradedReason).toBe('隐私模式')
  })

  it('退出隐私模式后再次解析恢复 IndexedDB 态（探测不缓存结论）', async () => {
    installThrowingIndexedDb('隐私模式')
    const degraded = await track(resolveStorage())
    expect(degraded.kind).toBe('memory')
    await degraded.close()

    // 还原真实（fake）IndexedDB：重新安装全局实现，模拟退出隐私模式。
    const restoreRecovered = await installFakeIndexedDb()

    const recovered = await track(resolveStorage())
    expect(recovered.kind).toBe('indexeddb')
    expect(recovered.degraded).toBe(false)
    await recovered.close()

    restoreRecovered()
  })
})
