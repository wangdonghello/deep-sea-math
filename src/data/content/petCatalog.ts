/** 宠物目录：商品、价格、效果与名字候选的唯一真源。 */
export type PetItemKind = 'food' | 'toy' | 'decor'

/** 宠物房间可切换的装饰样式标识（decor 专用）。 */
export type DecorStyleId = 'nest' | 'lamp' | 'coral'

export interface PetItem {
  readonly id: string
  readonly kind: PetItemKind
  readonly name: string
  readonly icon: string
  readonly price: number
  /** 食物：喂食获得的 XP；其他品类为 0。 */
  readonly xp: number
  /** 食物：回复的饥饿值；其他品类为 0。 */
  readonly hunger: number
  /** 宠物房间里的装饰样式标识（decor 专用）。 */
  readonly decor?: DecorStyleId
}

export const PET_NAMES = ['小蓝', '泡泡', '阿潮', '星星', '豆豆'] as const

/**
 * 食物三档：入门 / 进阶 / 高效。
 *
 * 每分 XP 随价格递增（1.6 → 1.8 → 2.0），越贵效率越高；每分饥饿随价格递减
 * （6.0 → 4.5 → 3.0），便宜档更适合补饥饿。因此三档互不严格支配。
 * 饥饿上限 100 的溢出由 UI 提示处理，不在目录里做特殊逻辑。
 */
export const FOOD_ITEMS: readonly PetItem[] = [
  { id: 'seaweed-cookie', kind: 'food', name: '海藻饼干', icon: '🍪', price: 5, xp: 8, hunger: 30 },
  { id: 'krill-pudding', kind: 'food', name: '磷虾布丁', icon: '🍮', price: 10, xp: 18, hunger: 45 },
  { id: 'deep-sea-cake', kind: 'food', name: '深海蛋糕', icon: '🎂', price: 20, xp: 40, hunger: 60 },
]

export const TOY_ITEMS: readonly PetItem[] = [
  { id: 'glow-ball', kind: 'toy', name: '发光球', icon: '🎾', price: 30, xp: 0, hunger: 0 },
  { id: 'coral-rattle', kind: 'toy', name: '珊瑚摇铃', icon: '🔔', price: 45, xp: 0, hunger: 0 },
  { id: 'bubble-maker', kind: 'toy', name: '气泡机', icon: '🫧', price: 60, xp: 0, hunger: 0 },
]

export const DECOR_ITEMS: readonly PetItem[] = [
  { id: 'seaweed-nest', kind: 'decor', name: '海草窝', icon: '🌿', price: 40, xp: 0, hunger: 0, decor: 'nest' },
  { id: 'shell-lamp', kind: 'decor', name: '贝壳灯', icon: '🐚', price: 55, xp: 0, hunger: 0, decor: 'lamp' },
  { id: 'coral-backdrop', kind: 'decor', name: '珊瑚背景', icon: '🪸', price: 80, xp: 0, hunger: 0, decor: 'coral' },
]

export const SHOP_ITEMS: readonly PetItem[] = [...FOOD_ITEMS, ...TOY_ITEMS, ...DECOR_ITEMS]

export function petItemById(id: string): PetItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id)
}
