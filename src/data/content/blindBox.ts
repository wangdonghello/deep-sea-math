/**
 * 盲盒奖励表与抽取规则（v4.3）。
 *
 * 奖励按概率从大到小：经验 21、食物 18、玩具 15、小狗 12、小猫 10、仓鼠 8、
 * 狮子 6、老虎 4.5、东海龙王 2、应龙 1.5、烛龙 1、青龙 0.5、
 * 白虎 0.3、朱雀 0.15、玄武 0.05。
 *
 * - 动物唯一：已拥有的动物不再进入抽取池；食物、玩具、经验可以重复抽到。
 * - 第一只宠物由第一次开盒保证抽出动物，避免新档案抽到食物后没有宠物。
 * - 动物概率按“剩余未拥有动物”重新归一化，因此神龙在后期会更稀有一点，
 *   但不会因为动物集齐就开不了盒。
 */

export type BlindBoxKind = 'snack' | 'xp' | 'toy' | 'animal'

export interface BlindBoxReward {
  readonly id: string
  readonly kind: BlindBoxKind
  readonly name: string
  readonly emoji: string
  /** 权重（百分比）；所有奖励相加必须为 100。 */
  readonly weight: number
  /** 食物/玩具对应的商店物品 id。 */
  readonly itemId?: string
  /** 经验奖励的数值。 */
  readonly xp?: number
}

export const BLIND_BOX_REWARDS: readonly BlindBoxReward[] = [
  { id: 'blind-xp', kind: 'xp', name: '经验 +25', emoji: '✨', weight: 21, xp: 25 },
  { id: 'krill-pudding', kind: 'snack', name: '磷虾布丁', emoji: '🍮', weight: 18, itemId: 'krill-pudding' },
  { id: 'glow-ball', kind: 'toy', name: '发光球', emoji: '🎾', weight: 15, itemId: 'glow-ball' },
  { id: 'companion-dog', kind: 'animal', name: '小狗', emoji: '🐶', weight: 12 },
  { id: 'companion-cat', kind: 'animal', name: '小猫', emoji: '🐱', weight: 10 },
  { id: 'companion-hamster', kind: 'animal', name: '仓鼠', emoji: '🐹', weight: 8 },
  { id: 'companion-lion', kind: 'animal', name: '狮子', emoji: '🦁', weight: 6 },
  { id: 'companion-tiger', kind: 'animal', name: '老虎', emoji: '🐯', weight: 4.5 },
  { id: 'companion-dragon', kind: 'animal', name: '东海龙王', emoji: '🐉', weight: 2 },
  { id: 'companion-yinglong', kind: 'animal', name: '应龙', emoji: '🐲', weight: 1.5 },
  { id: 'companion-zhulong', kind: 'animal', name: '烛龙', emoji: '🔥', weight: 1 },
  { id: 'companion-qinglong', kind: 'animal', name: '青龙', emoji: '🐍', weight: 0.5 },
  { id: 'companion-baihu', kind: 'animal', name: '白虎', emoji: '🐯', weight: 0.3 },
  { id: 'companion-zhuque', kind: 'animal', name: '朱雀', emoji: '🦅', weight: 0.15 },
  { id: 'companion-xuanwu', kind: 'animal', name: '玄武', emoji: '🐢', weight: 0.05 },
]

export const ANIMAL_REWARDS: readonly BlindBoxReward[] = BLIND_BOX_REWARDS.filter(
  (reward) => reward.kind === 'animal',
)

/** 四条神龙：正确率 100% 的券让它们的权重各 ×10。 */
export const DRAGON_REWARD_IDS: readonly string[] = [
  'companion-dragon', 'companion-yinglong', 'companion-zhulong', 'companion-qinglong',
]

export interface BlindBoxDraw {
  readonly reward: BlindBoxReward
  /** 兼容旧日志：历史事件里可能记录过重复动物转换。 */
  readonly convertedFrom?: string
}

/** 按权重从候选里抽一个。 */
function pickWeighted(random: () => number, pool: readonly BlindBoxReward[]): BlindBoxReward {
  const total = pool.reduce((sum, reward) => sum + reward.weight, 0)
  const roll = Math.max(0, Math.min(total - 0.000001, random() * total))
  let cursor = 0
  let picked = pool[pool.length - 1]
  for (const reward of pool) {
    cursor += reward.weight
    if (roll < cursor) {
      picked = reward
      break
    }
  }
  return picked
}

/**
 * 抽一次盲盒。
 *
 * @param random 返回 [0, 1) 的随机源；测试注入固定值。
 * @param ownedAnimalIds 已拥有的动物 id，重复的不进入抽取池。
 * @param firstPet 第一次开盒：只在动物池里抽，保证新档案先拿到宠物。
 * @param dragonBoost 该券来自正确率 100% 的题组：龙的权重 ×10。
 */
export function drawBlindBox(
  random: () => number,
  ownedAnimalIds: readonly string[],
  firstPet = false,
  dragonBoost = false,
): BlindBoxDraw {
  const unownedAnimals = ANIMAL_REWARDS.filter((reward) => !ownedAnimalIds.includes(reward.id))
  const pool = firstPet
    ? unownedAnimals
    : BLIND_BOX_REWARDS.filter((reward) => reward.kind !== 'animal' || !ownedAnimalIds.includes(reward.id))
  if (pool.length === 0) throw new Error('盲盒里暂时没有可抽的奖励')
  if (!dragonBoost) return { reward: pickWeighted(random, pool) }

  // 把「龙的总概率」精确放大到原来的 10 倍，而不是简单把权重 ×10：
  // 权重 ×10 会被总和归一化稀释，实际只提升约 7 倍。
  const total = pool.reduce((sum, reward) => sum + reward.weight, 0)
  const dragonWeight = pool
    .filter((reward) => DRAGON_REWARD_IDS.includes(reward.id))
    .reduce((sum, reward) => sum + reward.weight, 0)
  if (dragonWeight === 0) return { reward: pickWeighted(random, pool) }
  const target = dragonWeight * 10
  if (target >= total) {
    const onlyDragons = pool.map((reward) =>
      DRAGON_REWARD_IDS.includes(reward.id) ? reward : { ...reward, weight: 0 },
    )
    return { reward: pickWeighted(random, onlyDragons) }
  }
  const factor = (10 * (total - dragonWeight)) / (total - 10 * dragonWeight)
  const weighted = pool.map((reward) =>
    DRAGON_REWARD_IDS.includes(reward.id) ? { ...reward, weight: reward.weight * factor } : reward,
  )
  return { reward: pickWeighted(random, weighted) }
}
