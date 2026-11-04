import { describe, expect, it } from 'vitest'

import { FOOD_ITEMS, PET_NAMES, SHOP_ITEMS, petItemById } from '@/data/content/petCatalog'

describe('pet catalog', () => {
  it('食物按价格升序且效果递增', () => {
    expect(FOOD_ITEMS.map((item) => item.price)).toEqual([5, 10, 20])
    expect(FOOD_ITEMS.map((item) => item.xp)).toEqual([8, 12, 18])
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
})
