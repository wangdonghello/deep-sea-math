import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DB_NAME, openDb } from '../../../src/data/db'
import type { DeepSeaDb } from '../../../src/data/db'
import { createBestiaryRepo } from '../../../src/data/repositories/bestiaryRepo'
import { deleteDatabase, installFakeIndexedDb } from '../fakeIndexedDb'
import { PROFILE_A, PROFILE_B } from '../fixtures'

/**
 * `bestiaryRepo` 的行为契约（spec `creature-bestiary` + `offline-event-log`
 * §投影可由事件重建）。
 *
 * 它**不是**图鉴的权威状态，而是 `bestiaryUnlock` 投影的可重建缓存：
 * 内容全部由 `replayProjections(events).bestiaryUnlock` 折叠得出，因此
 * `clear` 之后系统仍能从事件日志恢复，绝不丢进度（spec：清空投影缓存但保留
 * 事件日志时，可恢复全部页面状态）。
 *
 * 锁四件事：
 * 1. 未写过返回 `undefined`（不是抛错）——首启图鉴页直接走重建路径；
 * 2. 写后读回一致（含空数组这种"尚未解锁"的合法状态）；
 * 3. 同一 `profileId` 覆盖写，不累积历史记录；
 * 4. 按档案隔离。
 */
describe('data/repositories/bestiaryRepo', () => {
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

  it('未写过的档案 load 返回 undefined', async () => {
    const repo = createBestiaryRepo(db)

    expect(await repo.load(PROFILE_A)).toBeUndefined()
  })

  it('save 后 load 读回一致的缓存', async () => {
    const repo = createBestiaryRepo(db)
    const cache = { profileId: PROFILE_A, unlockedCreatureIds: ['johnsons-anglerfish', 'vampire-squid'] }

    await repo.save(cache)

    expect(await repo.load(PROFILE_A)).toEqual(cache)
  })

  it('"尚未解锁"的空数组也是合法缓存，可原样往返', async () => {
    const repo = createBestiaryRepo(db)
    const empty = { profileId: PROFILE_A, unlockedCreatureIds: [] }

    await repo.save(empty)

    expect(await repo.load(PROFILE_A)).toEqual(empty)
  })

  it('同一档案重复 save 只保留最后一份（缓存不是追加日志）', async () => {
    const repo = createBestiaryRepo(db)

    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })
    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['b'] })

    expect(await repo.load(PROFILE_A)).toEqual({ profileId: PROFILE_A, unlockedCreatureIds: ['b'] })
  })

  it('clear 之后回到 undefined（可由事件重放重新建出）', async () => {
    const repo = createBestiaryRepo(db)
    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })

    await repo.clear(PROFILE_A)

    expect(await repo.load(PROFILE_A)).toBeUndefined()
  })

  it('按档案隔离：一个档案的解锁缓存不出现在另一个档案里', async () => {
    const repo = createBestiaryRepo(db)

    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })
    await repo.save({ profileId: PROFILE_B, unlockedCreatureIds: ['b'] })

    expect(await repo.load(PROFILE_A)).toEqual({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })
    expect(await repo.load(PROFILE_B)).toEqual({ profileId: PROFILE_B, unlockedCreatureIds: ['b'] })
  })
})
