/**
 * 盲盒奖励表与抽取规则（v4.2：只出宠物蛋）。
 *
 * 概率从高到低、总和 100：小猫 28、小狗 24、仓鼠 18、狮子 12、老虎 10、龙 8。
 *
 * 不再产出零食/经验；抽到的都是一颗宠物蛋，孵化后成为伙伴。动物仍是唯一
 * 收藏：已拥有的动物不进入本次抽取池，因此不会抽到重复伙伴；全部集齐时
 * 调用方应拒绝开盒，把券留给孩子。
 */

export type BlindBoxKind = 'snack' | 'xp' | 'animal'

export interface BlindBoxReward {
  readonly id: string
  readonly kind: BlindBoxKind
  readonly name: string
  readonly emoji: string
  /** 权重（百分比）；所有奖励相加必须为 100。 */
  readonly weight: number
}

export const BLIND_BOX_REWARDS: readonly BlindBoxReward[] = [
  { id: 'companion-cat', kind: 'animal', name: '小猫', emoji: '🐱', weight: 28 },
  { id: 'companion-dog', kind: 'animal', name: '小狗', emoji: '🐶', weight: 24 },
  { id: 'companion-hamster', kind: 'animal', name: '仓鼠', emoji: '🐹', weight: 18 },
  { id: 'companion-lion', kind: 'animal', name: '狮子', emoji: '🦁', weight: 12 },
  { id: 'companion-tiger', kind: 'animal', name: '老虎', emoji: '🐯', weight: 10 },
  { id: 'companion-dragon', kind: 'animal', name: '龙', emoji: '🐲', weight: 8 },
]

export const ANIMAL_REWARDS: readonly BlindBoxReward[] = BLIND_BOX_REWARDS

export interface BlindBoxDraw {
  readonly reward: BlindBoxReward
  /** 兼容旧日志：历史事件里可能记录过重复动物转换。 */
  readonly convertedFrom?: string
}

/**
 * 抽一次盲盒。
 *
 * 只从**尚未拥有**的动物蛋里按权重抽；全部集齐时抛错，由调用方提示。
 *
 * @param random 返回 [0, 1) 的随机源；测试注入固定值。
 * @param ownedAnimalIds 已拥有的动物 id，重复的不进入抽取池。
 */
export function drawBlindBox(random: () => number, ownedAnimalIds: readonly string[]): BlindBoxDraw {
  const available = ANIMAL_REWARDS.filter((reward) => !ownedAnimalIds.includes(reward.id))
  if (available.length === 0) throw new Error('伙伴已经集齐了')
  const total = available.reduce((sum, reward) => sum + reward.weight, 0)
  const roll = Math.max(0, Math.min(total - 0.000001, random() * total))
  let cursor = 0
  let picked = available[available.length - 1]
  for (const reward of available) {
    cursor += reward.weight
    if (roll < cursor) {
      picked = reward
      break
    }
  }
  return { reward: picked }
}
