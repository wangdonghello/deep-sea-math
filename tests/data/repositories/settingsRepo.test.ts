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
 * 1. **缺省即可用**——从没写过设置的档案取到默认 4/4/1 档，组题（Task 4）
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
      basicCount: 4,
      appliedCount: 4,
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

  it('remove 之后 get 回落默认值，且库里不残留该档案的行', async () => {
    const repo = createSettingsRepo(db)

    await repo.save(PROFILE_A, { ...makeSettings(), basicCount: 7 })

    await repo.remove(PROFILE_A)

    // 读侧与"从没写过"不可区分，家长看不到删档残留。
    expect(await repo.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)
    // 但写侧是真删除：直接查库应为空，而不是一行被改回默认值的孤儿记录
    // （那会让 spec child-profiles §删除档案 的"清干净关联数据"只做了一半）。
    const stored = await db.get('settings', PROFILE_A)
    expect(stored).toBeUndefined()
  })

  it('remove 不碰其他档案的设置', async () => {
    const repo = createSettingsRepo(db)

    await repo.save(PROFILE_A, { ...makeSettings(), basicCount: 7 })
    await repo.save(PROFILE_B, { ...makeSettings(), basicCount: 6 })

    await repo.remove(PROFILE_A)

    expect((await repo.get(PROFILE_B)).basicCount).toBe(6)
  })

  it('remove 一个从未写过的档案是无操作，不抛错', async () => {
    const repo = createSettingsRepo(db)

    await expect(repo.remove(PROFILE_A)).resolves.toBeUndefined()
    expect(await repo.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)
  })
})
