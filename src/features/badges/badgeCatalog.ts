import type { ThemeId } from '@/domain/model/types'

/**
 * 徽章目录：**展示用**的唯一真源。
 *
 * 为什么单独建一份而不是从事件里读：事件只落徽章 id（`quest-complete` 等），
 * 名字、图标、获得条件属于产品文案，必须在孩子能看到的地方有一处完整清单，
 * 否则“通关后得了什么徽章”只能靠解锁动画一闪而过（本次反馈的原问题）。
 *
 * 徽章分三类：
 * - `theme`：跟着主题走的探索徽章（深海按关卡阈值，恐龙/太空按 4 个阶段）；
 * - `common`：与主题无关的学习徽章（整组完成、独立掌握）；
 * - `mistake`：错题练习相关（练习次数 + 累计修复）。
 */
export type BadgeSectionId = 'theme' | 'common' | 'streak' | 'mistake'

/** 一枚徽章的静态定义。 */
export interface BadgeDefinition {
  /** 稳定标识；与事件里的 `rewards` / `badgeIds` 同源。 */
  readonly id: string
  readonly name: string
  readonly icon: string
  /** 获得条件，直接展示给孩子。 */
  readonly requirement: string
  readonly section: BadgeSectionId
  /** 主题专属徽章所属主题；通用/错题徽章为 `null`。 */
  readonly themeId: ThemeId | null
}

/** 全部徽章。顺序即徽章墙的展示顺序。 */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // 主题 · 深海（阈值与 v3 十关的区域解锁点一致：1 / 3 / 6 / 9）
  { id: 'deep-sea-twilight', name: '暮光初探', icon: '🌅', requirement: '通关第 1 关', section: 'theme', themeId: 'deep-sea' },
  { id: 'deep-sea-midnight', name: '深海潜行', icon: '🌊', requirement: '通关第 3 关', section: 'theme', themeId: 'deep-sea' },
  { id: 'deep-sea-abyss', name: '深渊之光', icon: '🕳️', requirement: '通关第 6 关', section: 'theme', themeId: 'deep-sea' },
  { id: 'deep-sea-hadal', name: '海沟勇士', icon: '🦑', requirement: '通关第 9 关', section: 'theme', themeId: 'deep-sea' },

  // 主题 · 恐龙（4 个阶段）
  { id: 'dino-fern', name: '破壳而出', icon: '🥚', requirement: '完成恐龙主题第 1 阶段', section: 'theme', themeId: 'dinosaur' },
  { id: 'dino-volcano', name: '蕨类同行', icon: '🦕', requirement: '完成恐龙主题第 2 阶段', section: 'theme', themeId: 'dinosaur' },
  { id: 'dino-park', name: '顶级猎手', icon: '🦖', requirement: '完成恐龙主题第 3 阶段', section: 'theme', themeId: 'dinosaur' },
  { id: 'dino-sea', name: '远古海洋', icon: '🌋', requirement: '完成恐龙主题第 4 阶段', section: 'theme', themeId: 'dinosaur' },

  // 主题 · 太空（4 个阶段）
  { id: 'space-orbit', name: '点火升空', icon: '🚀', requirement: '完成太空主题第 1 阶段', section: 'theme', themeId: 'space' },
  { id: 'space-moon', name: '月轨巡航', icon: '🌙', requirement: '完成太空主题第 2 阶段', section: 'theme', themeId: 'space' },
  { id: 'space-mars', name: '行星穿越', icon: '🪐', requirement: '完成太空主题第 3 阶段', section: 'theme', themeId: 'space' },
  { id: 'space-galaxy', name: '星系远航', icon: '🌌', requirement: '完成太空主题第 4 阶段', section: 'theme', themeId: 'space' },

  // 通用学习徽章（事件 `session-completed.rewards` 里发放）
  { id: 'quest-complete', name: '整组完成徽章', icon: '🏅', requirement: '完成任意一组每日题', section: 'common', themeId: null },
  { id: 'independent-mastery', name: '独立掌握徽章', icon: '🎯', requirement: '一组题中独立答对 60% 以上', section: 'common', themeId: null },
  { id: 'accuracy-perfect', name: '百发百中徽章', icon: '💯', requirement: '一组题全部独立答对（正确率 100%）', section: 'common', themeId: null },

  // 坚持徽章（按连续完成天数）
  { id: 'streak-3', name: '连续下潜', icon: '🌊', requirement: '连续 3 天完成每日题', section: 'streak', themeId: null },
  { id: 'streak-7', name: '一周船长', icon: '⛵', requirement: '连续 7 天完成每日题', section: 'streak', themeId: null },
  { id: 'streak-14', name: '深海常客', icon: '🧭', requirement: '连续 14 天完成每日题', section: 'streak', themeId: null },

  // 错题徽章（练习次数为新增能力；修复徽章沿用旧规则）
  { id: 'mistake-practice-1', name: '知错能改徽章', icon: '🌱', requirement: '完成第一次错题练习', section: 'mistake', themeId: null },
  { id: 'mistake-practice-10', name: '错题清道夫徽章', icon: '🔁', requirement: '累计完成 10 次错题练习', section: 'mistake', themeId: null },
  { id: 'mistake-fix-5', name: '修复徽章 I', icon: '🧩', requirement: '独立改对 5 道错题', section: 'mistake', themeId: null },
  { id: 'mistake-fix-10', name: '修复徽章 II', icon: '🧩', requirement: '独立改对 10 道错题', section: 'mistake', themeId: null },
  { id: 'mistake-fix-20', name: '修复徽章 III', icon: '🧩', requirement: '独立改对 20 道错题', section: 'mistake', themeId: null },
]

/** 按分类取徽章（保持目录顺序）。 */
export function badgesBySection(section: BadgeSectionId): readonly BadgeDefinition[] {
  return BADGE_CATALOG.filter((badge) => badge.section === section)
}

/** 按主题取探索徽章。 */
export function themeBadges(themeId: ThemeId): readonly BadgeDefinition[] {
  return BADGE_CATALOG.filter((badge) => badge.section === 'theme' && badge.themeId === themeId)
}
