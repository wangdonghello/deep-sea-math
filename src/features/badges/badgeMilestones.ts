/**
 * 徽章收藏里程碑：累计到一定数量就给一个称号，作为“积攒徽章”的长线回报。
 *
 * 只做**称号 + 视觉主题**，不再叠加货币：低年级孩子同时记金币/星星/宝石
 * 只会稀释学习本身；里程碑的意义是“被看见”，不是通胀式奖励。
 */
export interface BadgeMilestone {
  /** 需要累计获得多少枚徽章。 */
  readonly threshold: number
  /** 称号，展示在徽章墙顶部。 */
  readonly title: string
  /** 该阶段的主色，用于徽章墙的强调色。 */
  readonly accent: string
}

/** 里程碑阶梯（与目录总量 23 枚对齐）。 */
export const BADGE_MILESTONES: readonly BadgeMilestone[] = [
  { threshold: 3, title: '见习水手', accent: '#5fb3d4' },
  { threshold: 6, title: '深潜学员', accent: '#4a9fd8' },
  { threshold: 9, title: '暮光探索者', accent: '#6c7fe8' },
  { threshold: 12, title: '深渊领航员', accent: '#8b6de0' },
  { threshold: 16, title: '海沟船长', accent: '#c46ad0' },
  { threshold: 20, title: '深海传奇', accent: '#e0a13c' },
  { threshold: 23, title: '深海博物馆馆长', accent: '#f0d060' },
]

/** 当前已达成的最高里程碑；一枚都没有时返回 `null`。 */
export function reachedMilestone(earned: number): BadgeMilestone | null {
  let reached: BadgeMilestone | null = null
  for (const milestone of BADGE_MILESTONES) {
    if (earned >= milestone.threshold) reached = milestone
  }
  return reached
}

/** 下一个里程碑；全部达成后返回 `null`。 */
export function nextMilestone(earned: number): BadgeMilestone | null {
  return BADGE_MILESTONES.find((milestone) => earned < milestone.threshold) ?? null
}
