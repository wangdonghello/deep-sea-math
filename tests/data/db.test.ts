import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DB_NAME, DB_VERSION, STORE_NAMES, openDb } from '../../src/data/db'
import type { DeepSeaDb } from '../../src/data/db'
import { deleteDatabase, installFakeIndexedDb } from './fakeIndexedDb'
import { PROFILE_A, answerSubmittedEvent, profileCreatedEvent, sessionStartedEvent } from './fixtures'

/**
 * `src/data/db` 的行为契约（design §5「IndexedDB 不可用降级」与 §2 数据模型）。
 *
 * 锁四件事：
 * 1. **schema 形状**：四库 + 写入次序台账与 `events.by_profile` 索引必须一次
 *    建齐——Task 11~16 的仓储全部依赖它们存在；
 * 2. **版本迁移保留数据**：从"只有 `events` 库的旧版构建"升到当前版本时，
 *    既有事件 MUST 原样保留（spec `offline-event-log` §离线可用：升级后历史
 *    进度仍可读取）；
 * 3. **blocked 不无限挂起**：别的标签页攥着旧版本连接时，`open` 必须在等待
 *    上限后失败（失败后由 `resolveStorage` 降级，而不是永远转圈）；
 * 4. **幂等 reopen**：已是当前版本的库重复打开不得重建 schema、更不得清空。
 *
 * 写路径统一走 `idb` 的高层方法（`db.put` / `db.getAll`）：实测在这个环境下
 * （`fake-indexeddb` + `idb` 包装句柄）手开裸 readwrite 事务的请求永远不完成
 * （具体成因未深挖），因此写一律交给 `idb` 自己的方法——它内部自建事务。
 * 旧版库是**裸** `indexedDB.open` 拿到的、没有 `idb` 包装，所以仍用裸事务写。
 * 只读裸事务在包装句柄上可用（本文件的 schema 断言靠它读 `keyPath` /
 * `indexNames`）。
 */

/** 本文件打开过的全部连接，`afterEach` 统一关闭（否则删库会被 blocked 挂住）。 */
const opened: DeepSeaDb[] = []

/** 登记连接，返回原 promise（调用方仍可 `await` 拿句柄）。 */
function track(opening: Promise<DeepSeaDb>): Promise<DeepSeaDb> {
  void opening.then((db) => opened.push(db))
  return opening
}

/** 对象库名（供 `idb` 的高层方法做 StoreNames 形参）。 */
type StoreName = 'events' | 'profiles' | 'settings' | 'projections' | 'eventOrder'

/** 用 `idb` 高层方法写一条记录。 */
function putIn(db: DeepSeaDb, store: StoreName, value: never): Promise<void> {
  return db.put(store, value).then(() => undefined)
}

/** 用 `idb` 高层方法读整个对象库。 */
function getAllFrom(db: DeepSeaDb, store: StoreName): Promise<unknown[]> {
  return db.getAll(store)
}

/** 铺"v0 状态"：只有一个 `events` 库（keyPath `eventId`、无索引）。 */
function openLegacyEventsOnly(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, 1)
    // 在 upgradeneeded 里只能建库（升级事务尚未提交，开不了新事务写数据），
    // 因此这里只建 schema，等 onsuccess（升级事务已提交）再把连接交出去。
    request.onupgradeneeded = () => {
      request.result.createObjectStore('events', { keyPath: 'eventId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 在裸连接上用裸事务写一条记录（旧版库没被 `idb` 包装）。 */
function putInRaw(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value as never)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

describe('data/db: openDb — v1 schema', () => {
  let restore: () => void

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
  })

  afterEach(() => {
    for (const db of opened.splice(0)) {
      db.close()
    }
    restore()
  })

  it('一次建齐 events / profiles / settings / projections / eventOrder 五个对象库', async () => {
    const db = await track(openDb())

    expect([...db.objectStoreNames].sort()).toEqual([
      'eventOrder',
      'events',
      'profiles',
      'projections',
      'settings',
    ])
  })

  it('events 库以 eventId 为主键，并提供 by_profile 索引（按档案隔离查询）', async () => {
    const db = await track(openDb())

    const tx = db.transaction('events', 'readonly')
    expect(tx.store.keyPath).toBe('eventId')
    expect([...tx.store.indexNames]).toContain('by_profile')
  })

  it('profiles / settings / projections 的主键分别是 id / profileId / profileId', async () => {
    const db = await track(openDb())

    expect(db.transaction('profiles', 'readonly').store.keyPath).toBe('id')
    expect(db.transaction('settings', 'readonly').store.keyPath).toBe('profileId')
    expect(db.transaction('projections', 'readonly').store.keyPath).toBe('profileId')
  })

  it('打开后的实际版本与导出的 DB_VERSION 一致（版本号常量不会悄悄漂移）', async () => {
    const db = await track(openDb())

    expect(db.version).toBe(DB_VERSION)
  })
})

describe('data/db: openDb — 版本迁移', () => {
  let restore: () => void

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
  })

  afterEach(() => {
    for (const db of opened.splice(0)) {
      db.close()
    }
    restore()
  })

  it('旧版构建（仅有 events 库）留下的既有事件在升级后原样保留', async () => {
    // "v0 状态"：旧版构建只写了一个 events 库（keyPath eventId、无 by_profile
    // 索引、也没有其余三个库）。它占用的 IDB 数字版本号是 1 —— IndexedDB
    // 规范不允许 version 0，因此"无 schema 的旧状态"只能落在数字 1 上，
    // 当前 v1 schema 因此占用更高的版本号（见 db.ts 的 DB_VERSION 说明）。
    const legacy = await openLegacyEventsOnly()
    await putInRaw(legacy, STORE_NAMES.events, profileCreatedEvent(PROFILE_A))
    await putInRaw(legacy, STORE_NAMES.events, answerSubmittedEvent(PROFILE_A))
    // 必须先断开旧连接：版本升级会被其他打开着的连接阻塞（真实浏览器同样
    // 如此——旧版 app 的页面还开着时，升级事务拿不到）。
    legacy.close()

    const db = await track(openDb())
    const events = (await getAllFrom(db, 'events')) as { eventId: string }[]

    // 裸 `getAll` 按主键（eventId）序返回，与写入顺序无关；这里只断言"两条
    // 事件都还在且内容没被改写"，两边都按 eventId 归一化后比较。
    const byEventId = (list: { eventId: string }[]) =>
      [...list].sort((left, right) => left.eventId.localeCompare(right.eventId))
    expect(byEventId(events)).toEqual(
      byEventId([profileCreatedEvent(PROFILE_A), answerSubmittedEvent(PROFILE_A)]),
    )
    // 迁移同时补齐了其余库、台账与档案索引，否则升级后仓储依然不可用。
    expect([...db.objectStoreNames].sort()).toEqual([
      'eventOrder',
      'events',
      'profiles',
      'projections',
      'settings',
    ])
    expect([...db.transaction('events', 'readonly').store.indexNames]).toContain('by_profile')
  })

  it('升级后新写入的事件也能立刻读回（迁移没把库留在半可用状态）', async () => {
    const legacy = await openLegacyEventsOnly()
    legacy.close()

    const db = await track(openDb())
    await putIn(db, 'events', sessionStartedEvent(PROFILE_A) as never)

    expect(await getAllFrom(db, 'events')).toEqual([sessionStartedEvent(PROFILE_A)])
  })

  it('已是当前版本的库重复打开时保留数据（reopen 幂等，不重建 schema）', async () => {
    const first = await track(openDb())
    await putIn(first, 'events', profileCreatedEvent(PROFILE_A) as never)
    first.close()

    const second = await track(openDb())
    expect(await getAllFrom(second, 'events')).toEqual([profileCreatedEvent(PROFILE_A)])
    expect(second.version).toBe(DB_VERSION)
    second.close()
  })

  it('从"已有四库但缺台账"的中间态升级：补齐台账且事件原样保留', async () => {
    // 铺一个停在旧 schema（尚无 eventOrder）的库，里面已有一条事件。
    const middle = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION - 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('events', { keyPath: 'eventId' }).createIndex('by_profile', 'profileId')
        db.createObjectStore('profiles', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'profileId' })
        db.createObjectStore('projections', { keyPath: 'profileId' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await putInRaw(middle, 'events', profileCreatedEvent(PROFILE_A))
    middle.close()

    const db = await track(openDb())
    expect([...db.objectStoreNames]).toContain('eventOrder')
    expect(await getAllFrom(db, 'events')).toEqual([profileCreatedEvent(PROFILE_A)])
    db.close()
  })
})

/**
 * `blocked` 场景（问题 3）：另一个标签页攥着旧版本连接不放手时，`open` 既不
 * 成功也不失败——无限挂着比明确失败更糟。`openDb` 必须在等待上限后失败，
 * 让 `resolveStorage` 得以降级；同时"别的连接随后自己关了、升级照常完成"
 * 这条正常路径仍要能成功（不能一 blocked 就误判成存储不可用）。
 */
describe('data/db: openDb — blocked 等待上限', () => {
  /** 用例内把等待上限临时改小，避免测试真等 3 秒。 */
  const SHORT = 20

  let restore: () => void

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
  })

  afterEach(() => {
    restore()
  })

  it('旧版本连接一直不关 → 超时后抛错（而不是永远挂起）', async () => {
    const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('events', { keyPath: 'eventId' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    // 上一条连接占着版本 1 不关，本 open 要升到 DB_VERSION，于是被阻塞。
    const opened = openDb(SHORT)
    await expect(opened).rejects.toThrow(/打开被阻塞/)

    blocker.close()
  })

  it('旧版本连接在上限内关闭 → 升级照常完成（blocked 不等于失败）', async () => {
    const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('events', { keyPath: 'eventId' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const opened = openDb(SHORT)
    // 模拟"用户关掉了那个旧标签页"：连接一关，被阻塞的升级就会继续。
    queueMicrotask(() => blocker.close())

    const db = await track(opened)
    expect(db.version).toBe(DB_VERSION)
    expect([...db.objectStoreNames]).toContain('eventOrder')
    db.close()
  })
})
