import { describe, expect, it } from 'vitest'

import { ANIMAL_REWARDS, BLIND_BOX_REWARDS, drawBlindBox } from '@/data/content/blindBox'

describe('blind box catalog', () => {
  it('只出宠物蛋，权重合计 100 且从高到低', () => {
    expect(BLIND_BOX_REWARDS.every((reward) => reward.kind === 'animal')).toBe(true)
    expect(BLIND_BOX_REWARDS.reduce((sum, reward) => sum + reward.weight, 0)).toBe(100)
    const weights = BLIND_BOX_REWARDS.map((reward) => reward.weight)
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
  })

  it('动物共 6 种，龙权重最低', () => {
    expect(ANIMAL_REWARDS).toHaveLength(6)
    expect(ANIMAL_REWARDS.at(-1)?.name).toBe('龙')
  })

  it('按随机值命中对应蛋', () => {
    expect(drawBlindBox(() => 0.0, []).reward.id).toBe('companion-cat')
    expect(drawBlindBox(() => 0.999, []).reward.name).toBe('龙')
  })

  it('已拥有的动物不进入抽取池，集齐后拒绝', () => {
    expect(drawBlindBox(() => 0.0, ['companion-cat']).reward.id).toBe('companion-dog')
    expect(() => drawBlindBox(() => 0.5, ANIMAL_REWARDS.map((reward) => reward.id))).toThrow('伙伴已经集齐')
  })
})
