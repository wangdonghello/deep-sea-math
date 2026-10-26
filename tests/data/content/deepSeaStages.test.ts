import { describe, expect, it } from 'vitest'

import {
  DEEP_SEA_STAGES,
  DEEP_SEA_ZONES,
  deepSeaStageById,
  deepSeaStageForCreature,
  deepSeaStagesByZone,
} from '@/data/content/deepSeaStages'

describe('deep-sea ten-stage config', () => {
  it('has ten stages, three unique creatures each, and thirty total', () => {
    expect(DEEP_SEA_STAGES.map((stage) => stage.stage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const stage of DEEP_SEA_STAGES) expect(stage.creatureIds).toHaveLength(3)
    const ids = DEEP_SEA_STAGES.flatMap((stage) => stage.creatureIds)
    expect(ids).toHaveLength(30)
    expect(new Set(ids).size).toBe(30)
  })

  it('groups stages into the four depth zones', () => {
    expect(deepSeaStagesByZone('twilight').map((stage) => stage.stage)).toEqual([1, 2])
    expect(deepSeaStagesByZone('midnight').map((stage) => stage.stage)).toEqual([3, 4, 5])
    expect(deepSeaStagesByZone('abyss').map((stage) => stage.stage)).toEqual([6, 7, 8])
    expect(deepSeaStagesByZone('hadal').map((stage) => stage.stage)).toEqual([9, 10])
    expect(DEEP_SEA_ZONES.map((zone) => zone.unlockAtStage)).toEqual([1, 3, 6, 9])
  })

  it('looks up a stage and a creature stage', () => {
    expect(deepSeaStageById(5)?.name).toBe('黑暗猎场')
    expect(deepSeaStageById(11)).toBeUndefined()
    expect(deepSeaStageForCreature('great-white-shark')?.stage).toBe(4)
  })
})
