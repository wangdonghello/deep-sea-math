import { describe, expect, it } from 'vitest'

import { resolveDeepSeaProgress, isStageUnlocked, isZoneUnlocked } from '@/features/bestiary/deepSeaProgress'

describe('deep-sea ten-stage progress', () => {
  it('starts at stage 1 with no unlocked stage or zone', () => {
    const progress = resolveDeepSeaProgress(0)
    expect(progress.completedStages).toBe(0)
    expect(progress.currentStage).toBe(1)
    expect(progress.unlockedStages).toEqual([])
    expect(progress.unlockedZoneIds).toEqual([])
    expect(progress.currentZoneId).toBeNull()
  })

  it('maps completed groups 1:1 to stages', () => {
    for (const groups of [1, 2, 3, 5, 6, 9, 10]) {
      const progress = resolveDeepSeaProgress(groups)
      expect(progress.completedStages).toBe(groups)
      expect(progress.unlockedStages.map((stage) => stage.stage)).toEqual(
        Array.from({ length: groups }, (_, index) => index + 1),
      )
    }
  })

  it('unlocks zones at stages 1, 3, 6 and 9', () => {
    expect(resolveDeepSeaProgress(1).unlockedZoneIds).toEqual(['twilight'])
    expect(resolveDeepSeaProgress(2).unlockedZoneIds).toEqual(['twilight'])
    expect(resolveDeepSeaProgress(3).unlockedZoneIds).toEqual(['twilight', 'midnight'])
    expect(resolveDeepSeaProgress(5).unlockedZoneIds).toEqual(['twilight', 'midnight'])
    expect(resolveDeepSeaProgress(6).unlockedZoneIds).toEqual(['twilight', 'midnight', 'abyss'])
    expect(resolveDeepSeaProgress(9).unlockedZoneIds).toEqual(['twilight', 'midnight', 'abyss', 'hadal'])
  })

  it('caps at ten stages and exposes the next stage', () => {
    const progress = resolveDeepSeaProgress(42)
    expect(progress.completedStages).toBe(10)
    expect(progress.nextStage).toBeNull()
    expect(progress.currentStage).toBe(10)
    expect(progress.unlockedStages).toHaveLength(10)
    expect(isStageUnlocked(progress, 10)).toBe(true)
    expect(isZoneUnlocked(progress, 'hadal')).toBe(true)
  })
})
