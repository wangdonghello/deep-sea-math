import { describe, expect, it } from 'vitest'

import { ANIMAL_REWARDS, BLIND_BOX_REWARDS, drawBlindBox } from '@/data/content/blindBox'

describe('blind box catalog', () => {
  it('权重合计 100，且按从高到低排列', () => {
    expect(BLIND_BOX_REWARDS.reduce((sum, reward) => sum + reward.weight, 0)).toBe(100)
    const weights = BLIND_BOX_REWARDS.map((reward) => reward.weight)
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
  })

  it('动物共 6 种，龙权重最低', () => {
    expect(ANIMAL_REWARDS).toHaveLength(6)
    expect(ANIMAL_REWARDS.at(-1)?.name).toBe('龙')
  })

  it('按随机值命中对应奖励', () => {
    expect(drawBlindBox(() => 0.0, []).reward.id).toBe('seaweed-cookie')
    expect(drawBlindBox(() => 0.65, []).reward.kind).toBe('animal')
    expect(drawBlindBox(() => 0.999, []).reward.name).toBe('龙')
  })

  it('已有动物转为零食并记录来源', () => {
    const draw = drawBlindBox(() => 0.65, ['companion-cat'])
    expect(draw.reward.id).toBe('seaweed-cookie')
    expect(draw.convertedFrom).toBe('companion-cat')
  })
})
