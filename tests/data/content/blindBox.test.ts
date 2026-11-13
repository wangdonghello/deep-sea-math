import { describe, expect, it } from 'vitest'

import { ANIMAL_REWARDS, BLIND_BOX_REWARDS, drawBlindBox } from '@/data/content/blindBox'

describe('blind box catalog', () => {
  it('奖励按概率从大到小排列，权重合计 100', () => {
    expect(BLIND_BOX_REWARDS.reduce((sum, reward) => sum + reward.weight, 0)).toBe(100)
    const weights = BLIND_BOX_REWARDS.map((reward) => reward.weight)
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
    expect(BLIND_BOX_REWARDS.slice(0, 3).map((reward) => reward.kind)).toEqual(['xp', 'snack', 'toy'])
  })

  it('十二种动物，四象神兽在最末且概率最低', () => {
    expect(ANIMAL_REWARDS).toHaveLength(12)
    expect(ANIMAL_REWARDS.slice(-7).map((reward) => reward.name)).toEqual(['东海龙王', '应龙', '烛龙', '青龙', '白虎', '朱雀', '玄武'])
  })

  it('第一次开盒只抽动物，保证新档案先拿到宠物', () => {
    const draw = drawBlindBox(() => 0.1, [], true)
    expect(draw.reward.kind).toBe('animal')
  })

  it('后续可以抽到经验、食物、玩具，动物不重复', () => {
    expect(drawBlindBox(() => 0.0, []).reward.kind).toBe('xp')
    expect(drawBlindBox(() => 0.3, []).reward.kind).toBe('snack')
    expect(drawBlindBox(() => 0.45, []).reward.kind).toBe('toy')
    expect(drawBlindBox(() => 0.6, []).reward.id).toBe('companion-dog')
    expect(drawBlindBox(() => 0.7, []).reward.id).toBe('companion-cat')

    const owned = ANIMAL_REWARDS.map((reward) => reward.id)
    const draw = drawBlindBox(() => 0.5, owned)
    expect(draw.reward.kind).not.toBe('animal')
  })
})
