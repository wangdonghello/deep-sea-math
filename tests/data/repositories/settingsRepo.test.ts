import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DB_NAME, openDb } from '../../../src/data/db'
import type { DeepSeaDb } from '../../../src/data/db'
import { DEFAULT_SETTINGS } from '../../../src/data/repositories/settingsRepo'
import { createSettingsRepo } from '../../../src/data/repositories/settingsRepo'
import { deleteDatabase, installFakeIndexedDb } from '../fakeIndexedDb'
import { PROFILE_A, PROFILE_B, makeSettings } from '../fixtures'

/**
 * `settingsRepo` 的行为契约（spec `daily-math-quest` §默认 5 基础 / 3 应用 /
 * 1 探测，且三类数量可由家长调整；spec `child-profiles` §时长上限）。
 *
 * 锁三件事：
 * 1. **缺省即可用**——从没写过设置的档案取到默认 5/3/1 档，组题（Task 4）
 *    因此不必自己再兜一份默认值；
 * 2. **按档案隔离**——两个档案各自持有设置，互不覆盖；
 * 3. **写后读回一致**——家长改完立刻能读回新值（ParentView 表单回显）。
 */
describe('data/repositories/settingsRepo', () => {
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

  it('未写过的档案取到默认设置 5 基础 / 3 应用 / 1 探测', async () => {
    const repo = createSettingsRepo(db)

    expect(await repo.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({
      basicCount: 5,
      appliedCount: 3,
      probeCount: 1,
      maxMinutes: 15,
    })
  })

  it('save 之后 get 读回同样的值', async () => {
    const repo = createSettingsRepo(db)
    const settings = { ...makeSettings(), basicCount: 4 }

    await repo.save(PROFILE_A, settings)

    expect(await repo.get(PROFILE_A)).toEqual(settings)
  })

  it('设置按档案隔离：B 档案的修改不出现在 A 档案里', async () => {
    const repo = createSettingsRepo(db)

    await repo.save(PROFILE_B, { ...makeSettings(), probeCount: 3 })

    expect(await repo.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)
    expect((await repo.get(PROFILE_B)).probeCount).toBe(3)
  })
})
