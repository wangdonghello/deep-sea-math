import { replayProjections } from '@/domain/eventLog/replay'
import type { DomainEvent, ThemeId } from '@/domain/model/types'

import { BADGE_CATALOG, themeBadges, type BadgeDefinition } from './badgeCatalog'

/**
 * 徽章获得状态的计算（纯函数，事件驱动）。
 *
 * 三类来源：
 * 1. **通用徽章**直接数 `session-completed.rewards`（可重复获得，次数即成就）；
 * 2. **主题徽章**按该主题已完成的每日题组数对照阈值（深海 1/3/6/9 关，
 *    恐龙与太空各 4 个阶段）；主题从 `session-started.themeId` 关联，
 *    老数据缺这条事件时按深海处理；
 * 3. **错题徽章**取错题练习投影：练习次数（新增）+ 累计修复数（旧规则）。
 *
 * 徽章不落独立事件：它们都能从既有事件重建，因此刷新/换设备后仍能看全。
 */
export interface BadgeState {
  readonly id: string
  readonly earned: boolean
  /** 获得次数；一次性徽章为 0 或 1。 */
  readonly count: number
}

export interface BadgeSummary {
  readonly total: number
  readonly earned: number
  /** 历史最长连续完成天数（坚持徽章的判定依据）。 */
  readonly streak: number
  readonly states: ReadonlyMap<string, BadgeState>
}

/** 每个主题的探索徽章阈值（与目录里的顺序一一对应）。 */
const THEME_STAGE_TARGETS: Readonly<Record<ThemeId, readonly number[]>> = {
  'deep-sea': [1, 3, 6, 9],
  dinosaur: [1, 2, 3, 4],
  space: [1, 2, 3, 4],
}

const REPEATABLE_BADGES = new Set(['quest-complete', 'independent-mastery', 'accuracy-perfect'])

/** 事件时间 → UTC 日期键；跨设备时区不影响“连续几天”的口径。 */
function utcDayKey(occurredAt: number): string {
  return new Date(occurredAt).toISOString().slice(0, 10)
}

/** 最长连续天数。 */
function longestStreak(days: readonly string[]): number {
  const sorted = [...new Set(days)].sort()
  let best = 0
  let run = 0
  let previous = 0
  for (const day of sorted) {
    const midnight = Date.parse(`${day}T00:00:00Z`)
    run = previous !== 0 && midnight - previous === 86_400_000 ? run + 1 : 1
    previous = midnight
    if (run > best) best = run
  }
  return best
}

/** 累计修复类徽章：id 后缀即门槛。 */
function fixThreshold(badgeId: string): number | null {
  const match = /^mistake-fix-(\d+)$/.exec(badgeId)
  return match === null ? null : Number(match[1])
}

/** 主题徽章对应的通关阈值；不是主题徽章时返回 null。 */
function themeTarget(badge: BadgeDefinition): number | null {
  if (badge.section !== 'theme' || badge.themeId === null) return null
  const index = themeBadges(badge.themeId).findIndex((candidate) => candidate.id === badge.id)
  if (index < 0) return null
  return THEME_STAGE_TARGETS[badge.themeId][index] ?? null
}

/**
 * 重放一个档案的事件，算出全部徽章的获得状态。
 *
 * @param events 该档案（或包含多档案）的事件流。
 * @param profileId 当前档案 id；其他档案的事件会被过滤掉。
 */
export function resolveBadgeSummary(
  events: readonly DomainEvent[],
  profileId: string,
): BadgeSummary {
  const scoped = events.filter((event) => event.profileId === profileId)
  const practice = replayProjections(scoped, { profileId }).practiceProgress

  const rewardCounts = new Map<string, number>()
  const themeBySession = new Map<string, ThemeId>()
  const themeStages = new Map<ThemeId, number>()
  const completedDays: string[] = []

  for (const event of scoped) {
    if (event.type === 'session-started') {
      themeBySession.set(event.sessionId, event.themeId ?? 'deep-sea')
    }
  }
  for (const event of scoped) {
    if (event.type !== 'session-completed') continue
    for (const rewardId of event.rewards) {
      rewardCounts.set(rewardId, (rewardCounts.get(rewardId) ?? 0) + 1)
    }
    const themeId = themeBySession.get(event.sessionId) ?? 'deep-sea'
    themeStages.set(themeId, (themeStages.get(themeId) ?? 0) + 1)
    completedDays.push(utcDayKey(event.occurredAt))
  }
  const streak = longestStreak(completedDays)

  function countFor(badge: BadgeDefinition): number {
    if (REPEATABLE_BADGES.has(badge.id)) return rewardCounts.get(badge.id) ?? 0

    const streakThreshold = /^streak-(\d+)$/.exec(badge.id)
    if (streakThreshold !== null) {
      return streak >= Number(streakThreshold[1]) ? 1 : 0
    }

    const threshold = fixThreshold(badge.id)
    if (threshold !== null) return practice.fixedQuestionIds.length >= threshold ? 1 : 0

    if (badge.id === 'mistake-practice-1') return practice.practiceSessionCount >= 1 ? 1 : 0
    if (badge.id === 'mistake-practice-10') return practice.practiceSessionCount >= 10 ? 1 : 0

    const target = themeTarget(badge)
    if (target !== null && badge.themeId !== null) {
      return (themeStages.get(badge.themeId) ?? 0) >= target ? 1 : 0
    }
    return 0
  }

  const states = new Map<string, BadgeState>()
  let earned = 0
  for (const badge of BADGE_CATALOG) {
    const count = countFor(badge)
    const isEarned = count > 0
    if (isEarned) earned += 1
    states.set(badge.id, { id: badge.id, earned: isEarned, count })
  }
  return { total: BADGE_CATALOG.length, earned, streak, states }
}
