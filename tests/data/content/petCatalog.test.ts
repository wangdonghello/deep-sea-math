import { describe, expect, it } from 'vitest'

import {
  DECOR_ITEMS,
  FOOD_ITEMS,
  PET_NAMES,
  SHOP_ITEMS,
  TOY_ITEMS,
  petItemById,
} from '@/data/content/petCatalog'

describe('pet catalog', () => {
  it('食物按价格升序且效果递增', () => {
    expect(FOOD_ITEMS.map((item) => item.price)).toEqual([5, 10, 20])
    expect(FOOD_ITEMS.map((item) => item.xp)).toEqual([8, 18, 40])
  })

  it('商品 id 唯一，且能按 id 查到', () => {
    const ids = SHOP_ITEMS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(petItemById('glow-ball')?.kind).toBe('toy')
    expect(petItemById('missing')).toBeUndefined()
  })

  it('名字候选为 5 个且不含空白', () => {
    expect(PET_NAMES).toHaveLength(5)
    for (const name of PET_NAMES) expect(name.trim()).not.toBe('')
  })

  it('食物三档饥饿值为 30/45/60', () => {
    expect(FOOD_ITEMS.map((item) => item.hunger)).toEqual([30, 45, 60])
  })

  it('越贵的食物每分 XP 越高，三档不构成严格支配', () => {
    const xpPerCoin = FOOD_ITEMS.map((item) => item.xp / item.price)
    expect(xpPerCoin).toEqual([1.6, 1.8, 2])
    for (let i = 1; i < xpPerCoin.length; i += 1) {
      expect(xpPerCoin[i]).toBeGreaterThan(xpPerCoin[i - 1])
    }
  })

  it('玩具与装饰价格固定', () => {
    expect(TOY_ITEMS.map((item) => item.price)).toEqual([30, 45, 60])
    expect(DECOR_ITEMS.map((item) => item.price)).toEqual([40, 55, 80])
  })

  it('装饰样式标识与目录顺序一致', () => {
    expect(DECOR_ITEMS.map((item) => item.decor)).toEqual(['nest', 'lamp', 'coral'])
  })

  it('非食物商品没有喂食效果', () => {
    for (const item of [...TOY_ITEMS, ...DECOR_ITEMS]) {
      expect(item.xp).toBe(0)
      expect(item.hunger).toBe(0)
    }
  })

  it('商店共 9 件，且 kind 与所属分类一致', () => {
    expect(SHOP_ITEMS).toHaveLength(9)
    for (const item of FOOD_ITEMS) expect(item.kind).toBe('food')
    for (const item of TOY_ITEMS) expect(item.kind).toBe('toy')
    for (const item of DECOR_ITEMS) expect(item.kind).toBe('decor')
    expect(SHOP_ITEMS.map((item) => item.id)).toEqual(
      [...FOOD_ITEMS, ...TOY_ITEMS, ...DECOR_ITEMS].map((item) => item.id),
    )
  })
})
