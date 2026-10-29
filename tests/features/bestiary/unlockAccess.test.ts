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

  it('保留历史 unlock-granted 的显式图鉴解锁', () => {
    const unlocked = unlockedCreatureIdSetWithProgress({ 'creature:golden-trevally': {} }, 0)
    expect(unlocked.has('golden-trevally')).toBe(true)
  })

  it('区域解锁不再直接发放整片海域的图鉴', () => {
    // v2 的旧口径会把 hadal 区全部物种一起放出来；v3 只按关卡发放。
    const unlocked = unlockedCreatureIdSetWithProgress({ 'zone:hadal': {} }, 0)
    expect(unlocked.has('hadal-amphipod')).toBe(false)
  })

  it('解锁 3 个区（通关 3 关）只解锁 9 条，而不是整片海域的 24 条', () => {
    // 三个区横跨 9 个关卡，但孩子只通关了前 3 关，因此只应拿到 3 × 3 = 9 条。
    const unlocked = unlockedCreatureIdSetWithProgress({}, 3)
    expect(unlocked.size).toBe(9)
  })

  it('通关 6 关解锁 18 条，不提前发放第 7、8 关的图鉴', () => {
    const unlocked = unlockedCreatureIdSetWithProgress({}, 6)
    expect(unlocked.size).toBe(18)
    // 深渊区第 7、8 关的鱼仍应是剪影。
    expect(unlocked.has('vampire-squid')).toBe(false)
    expect(unlocked.has('giant-cusk-eel')).toBe(false)
  })

  it('通关封顶 10 关后解锁全部 30 条图鉴', () => {
    const unlocked = unlockedCreatureIdSetWithProgress({}, 10)
    for (const stage of DEEP_SEA_STAGES) {
      for (const id of stage.creatureIds) expect(unlocked.has(id), id).toBe(true)
    }
  })
})
