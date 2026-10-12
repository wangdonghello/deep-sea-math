import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DB_NAME, openDb } from '../../../src/data/db'
import type { DeepSeaDb, GuardRecord } from '../../../src/data/db'
import { createGuardRepo } from '../../../src/data/repositories/guardRepo'
import { deleteDatabase, installFakeIndexedDb } from '../fakeIndexedDb'

/**
 * `guardRepo` 的行为契约：家长 PIN 是**全场唯一一条**记录，与任何孩子档案
 * 无关（所以不能塞进 keyPath 为 `profileId` 的 `settings`）。
 *
 * 锁四件事：
 * 1. 未设置过返回 `undefined`（不是抛错）——门禁页据此进入"设置家长密码"；
 * 2. `save` 后 `load` 读回一致的哈希与盐（明文 MUST NOT 出现在任何字段里）；
 * 3. 同一记录覆盖写，不累积历史；
 * 4. `clear` 之后回到 `undefined`（家长重置 PIN 用）。
 */
describe('data/repositories/guardRepo', () => {
  let restore: () => void
  let db: DeepSeaDb

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
    db = await openDb()
  })

  afterEach(() => {
    db.close()
    restore()
  })

  /** 一条合法记录；`salt` / `pinHash` 只是形态合法的占位值。 */
  function record(overrides: Partial<GuardRecord> = {}): GuardRecord {
    return { id: 'parent', pinHash: 'a'.repeat(64), salt: 'b'.repeat(16), ...overrides }
  }

  it('未设置过时 load 返回 undefined', async () => {
    const repo = createGuardRepo(db)

    expect(await repo.load()).toBeUndefined()
  })

  it('save 后 load 读回一致的记录，且不含 PIN 明文字段', async () => {
    const repo = createGuardRepo(db)

    await repo.save(record())

    const loaded = await repo.load()
    expect(loaded).toEqual(record())
    // 记录里只有哈希与盐：PIN 明文没有任何容身字段。
    expect(loaded).not.toHaveProperty('pin')
  })

  it('重复 save 只保留最后一份（覆盖写，不是追加）', async () => {
    const repo = createGuardRepo(db)

    await repo.save(record({ pinHash: '1'.repeat(64) }))
    await repo.save(record({ pinHash: '2'.repeat(64) }))

    expect((await repo.load())?.pinHash).toBe('2'.repeat(64))
  })

  it('clear 之后回到 undefined（家长重置 PIN 用）', async () => {
    const repo = createGuardRepo(db)
    await repo.save(record())

    await repo.clear()

    expect(await repo.load()).toBeUndefined()
  })

  it('clear 未设置过的记录幂等，不抛错', async () => {
    const repo = createGuardRepo(db)

    await expect(repo.clear()).resolves.toBeUndefined()
  })

  it('PIN 记录与孩子档案互不影响（guard 是独立对象库）', async () => {
    const repo = createGuardRepo(db)
    await repo.save(record())

    // 直接看 profiles 库：guard 的写入绝不会在档案库里留下任何东西。
    expect(await db.getAll('profiles')).toEqual([])
  })
})
