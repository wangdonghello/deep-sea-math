import { describe, expect, it } from 'vitest'

import { DEEP_SEA_STAGES } from '@/data/content/deepSeaStages'
import { unlockedCreatureIdSetWithProgress } from '@/features/bestiary/unlockAccess'

/**
 * 回归：通关第 N 关必须让该关的 3 条图鉴“看得见也进得去”。
 *
 * 事故表现：孩子做完今天的题、关卡标签亮起，但那一关的图鉴仍是剪影，
 * 点卡片没有任何反应（观察舱守卫按旧口径把人打回图鉴）。
 */
describe('unlockedCreatureIdSetWithProgress', () => {
  it('完成第 N 关解锁该关 3 条图鉴，但不提前解锁下一关', () => {
    const stage1 = DEEP_SEA_STAGES[0].creatureIds
    const stage2 = DEEP_SEA_STAGES[1].creatureIds
    const unlocked = unlockedCreatureIdSetWithProgress({}, 1)

    for (const id of stage1) expect(unlocked.has(id), id).toBe(true)
    for (const id of stage2) expect(unlocked.has(id), id).toBe(false)
  })

  it('通关 0 关时不白送任何图鉴', () => {
    const unlocked = unlockedCreatureIdSetWithProgress({}, 0)
    for (const stage of DEEP_SEA_STAGES) {
      for (const id of stage.creatureIds) expect(unlocked.has(id), id).toBe(false)
    }
  })

  it('保留历史 unlock-granted 与区域解锁的旧口径', () => {
    const unlocked = unlockedCreatureIdSetWithProgress(
      { 'creature:golden-trevally': {}, 'zone:hadal': {} },
      0,
    )
    expect(unlocked.has('golden-trevally')).toBe(true)
    // 区域解锁会带出该区域全部物种，这是 v2 沿用下来的规则。
    expect(unlocked.has('hadal-amphipod')).toBe(true)
  })

  it('通关封顶 10 关后解锁全部 30 条图鉴', () => {
    const unlocked = unlockedCreatureIdSetWithProgress({}, 10)
    for (const stage of DEEP_SEA_STAGES) {
      for (const id of stage.creatureIds) expect(unlocked.has(id), id).toBe(true)
    }
  })
})
