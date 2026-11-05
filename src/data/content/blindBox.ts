/**
 * 盲盒奖励表与抽取规则。
 *
 * 概率从高到低、总和 100：零食 35、经验 25、小猫 12、小狗 10、仓鼠 8、
 * 狮子 5、老虎 3、龙 2。
 *
 * 动物是**唯一收藏**：同一种动物只会拥有一只；抽到已拥有的动物时由
 * {@link drawBlindBox} 换成零食，并记录 `convertedFrom` 供 UI 说明。
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

/** 零食奖励复用现有食物，抽到即进背包。 */
export const SNACK_REWARD: BlindBoxReward = {
  id: 'seaweed-cookie', kind: 'snack', name: '海藻饼干', emoji: '🍪', weight: 35,
}

export const BLIND_BOX_REWARDS: readonly BlindBoxReward[] = [
  SNACK_REWARD,
  { id: 'xp-bonus', kind: 'xp', name: '经验 +25', emoji: '✨', weight: 25 },
  { id: 'companion-cat', kind: 'animal', name: '小猫', emoji: '🐱', weight: 12 },
  { id: 'companion-dog', kind: 'animal', name: '小狗', emoji: '🐶', weight: 10 },
  { id: 'companion-hamster', kind: 'animal', name: '仓鼠', emoji: '🐹', weight: 8 },
  { id: 'companion-lion', kind: 'animal', name: '狮子', emoji: '🦁', weight: 5 },
  { id: 'companion-tiger', kind: 'animal', name: '老虎', emoji: '🐯', weight: 3 },
  { id: 'companion-dragon', kind: 'animal', name: '龙', emoji: '🐲', weight: 2 },
]

export const ANIMAL_REWARDS: readonly BlindBoxReward[] = BLIND_BOX_REWARDS.filter(
  (reward) => reward.kind === 'animal',
)

export interface BlindBoxDraw {
  readonly reward: BlindBoxReward
  readonly convertedFrom?: string
}

/**
 * 抽一次盲盒。
 *
 * @param random 返回 [0, 1) 的随机源；测试注入固定值。
 * @param ownedAnimalIds 已拥有的动物 id；重复动物改为零食。
 */
export function drawBlindBox(random: () => number, ownedAnimalIds: readonly string[]): BlindBoxDraw {
  const roll = Math.max(0, Math.min(99.999999, random() * 100))
  let cursor = 0
  let picked = BLIND_BOX_REWARDS[BLIND_BOX_REWARDS.length - 1]
  for (const reward of BLIND_BOX_REWARDS) {
    cursor += reward.weight
    if (roll < cursor) {
      picked = reward
      break
    }
  }
  if (picked.kind === 'animal' && ownedAnimalIds.includes(picked.id)) {
    return { reward: SNACK_REWARD, convertedFrom: picked.id }
  }
  return { reward: picked }
}
