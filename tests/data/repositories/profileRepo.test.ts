import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DB_NAME, openDb } from '../../../src/data/db'
import type { DeepSeaDb } from '../../../src/data/db'
import { createProfileRepo } from '../../../src/data/repositories/profileRepo'
import { deleteDatabase, installFakeIndexedDb } from '../fakeIndexedDb'
import { PROFILE_A, PROFILE_B, makeProfile } from '../fixtures'

/**
 * `profileRepo` 的行为契约（spec `child-profiles` §档案；Constitution §1
 * 禁止明文 PIN）。
 *
 * 锁四件事：
 * 1. **往返一致**——`Profile` 六个字段（含 `pinHash` / `salt`）经 IndexedDB
 *    结构化克隆后深度相等；
 * 2. **主键幂等**——同一 `id` 重复 `save` 覆盖而非新增（`list` 长度仍为 1）；
 * 3. **不存在返回 undefined**——调用方据此判断"档案选择页要不要显示这张卡"；
 * 4. **删除档案**——Task 16 二次确认后清数据，这里只验证档案记录本身被移除。
 */
describe('data/repositories/profileRepo', () => {
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

  it('save 后 get / list 读回一致的档案', async () => {
    const repo = createProfileRepo(db)
    const profile = makeProfile(PROFILE_A)

    await repo.save(profile)

    expect(await repo.get(PROFILE_A)).toEqual(profile)
    expect(await repo.list()).toEqual([profile])
  })

  it('同一 id 重复 save 只保留一条记录（覆盖写）', async () => {
    const repo = createProfileRepo(db)
    await repo.save(makeProfile(PROFILE_A))
    await repo.save({ ...makeProfile(PROFILE_A), nickname: '小潜' })

    const all = await repo.list()
    expect(all).toHaveLength(1)
    expect(all[0].nickname).toBe('小潜')
  })

  it('get 不存在的档案返回 undefined', async () => {
    const repo = createProfileRepo(db)

    expect(await repo.get('no-such-profile')).toBeUndefined()
  })

  it('多个档案按 id 主键各自存放，list 返回全部', async () => {
    const repo = createProfileRepo(db)
    await repo.save(makeProfile(PROFILE_A))
    await repo.save(makeProfile(PROFILE_B))

    expect(await repo.list()).toHaveLength(2)
    expect(await repo.get(PROFILE_B)).toEqual(makeProfile(PROFILE_B))
  })

  it('remove 之后该档案读不到了', async () => {
    const repo = createProfileRepo(db)
    await repo.save(makeProfile(PROFILE_A))
    await repo.save(makeProfile(PROFILE_B))

    await repo.remove(PROFILE_A)

    expect(await repo.get(PROFILE_A)).toBeUndefined()
    expect(await repo.list()).toEqual([makeProfile(PROFILE_B)])
  })
})
