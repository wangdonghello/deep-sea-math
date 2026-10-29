import {
  DEEP_SEA_STAGES,
  DEEP_SEA_ZONES,
  type DeepSeaStage,
  type DeepSeaZone,
  type DeepSeaZoneId,
} from '@/data/content/deepSeaStages'
import type { DomainEvent } from '@/domain/model/types'

/**
 * 深海关卡进度（v3.0）的**唯一推算口径**。
 *
 * 1 组每日题 = 1 关：`completedGroups` 直接映射到已通关卡数，封顶 10。
 * 不读事件、不碰时钟，调用方传入完成组数即可；因此地图、图鉴、家长报告
 * 可以共用同一份结果，不会出现“地图到第 5 关、图鉴只认第 3 关”的分叉。
 */
export interface DeepSeaProgress {
  /** 已通关卡数（0–10）。 */
  readonly completedStages: number
  /** 当前正在探索的关卡（1–10）；全部通关后仍为 10。 */
  readonly currentStage: number
  /** 已解锁的关卡；第 N 关在完成 N 组题后可见。 */
  readonly unlockedStages: readonly DeepSeaStage[]
  /** 已解锁区域 id。 */
  readonly unlockedZoneIds: readonly DeepSeaZoneId[]
  /** 当前所在区域；未通关任何关卡时为 null（潜水艇基地）。 */
  readonly currentZoneId: DeepSeaZoneId | null
  /** 下一关；全部通关后为 null。 */
  readonly nextStage: DeepSeaStage | null
}

/** 区域解锁所需的已通关数。 */
export function zoneUnlockedAt(zone: DeepSeaZone): number {
  return zone.unlockAtStage
}

/** 由“已完成每日题组数”推算 10 关进度。 */
export function resolveDeepSeaProgress(completedGroups: number): DeepSeaProgress {
  const completedStages = Math.max(0, Math.min(Math.floor(completedGroups), DEEP_SEA_STAGES.length))
  const unlockedStages = DEEP_SEA_STAGES.filter((stage) => stage.stage <= completedStages)
  const unlockedZoneIds = DEEP_SEA_ZONES
    .filter((zone) => completedStages >= zone.unlockAtStage)
    .map((zone) => zone.id)
  const currentZoneId = unlockedZoneIds.at(-1) ?? null
  const currentStage = Math.min(Math.max(completedStages + 1, 1), DEEP_SEA_STAGES.length)
  const nextStage = DEEP_SEA_STAGES.find((stage) => stage.stage === completedStages + 1) ?? null
  return { completedStages, currentStage, unlockedStages, unlockedZoneIds, currentZoneId, nextStage }
}

/** 某关是否已解锁。 */
export function isStageUnlocked(progress: DeepSeaProgress, stage: number): boolean {
  return stage >= 1 && stage <= progress.completedStages
}

/** 某区域的关卡是否已解锁（按区域阈值，而不是按单关）。 */
export function isZoneUnlocked(progress: DeepSeaProgress, zoneId: DeepSeaZoneId): boolean {
  return progress.unlockedZoneIds.includes(zoneId)
}

/**
 * 从事件日志数出已通关卡数（= 已完成的每日题组数，按 sessionId 去重）。
 *
 * 与 `useDeepSeaProgress` 共用同一套口径：只数 `session-completed`，历史数据里
 * 重复的完成事件不会把进度算多。抽成纯函数是为了让图鉴投影与观察舱守卫在
 * **同一份输入**上得出同一个关卡数，而不是各自实现一遍。
 */
export function completedStageCount(
  events: readonly DomainEvent[],
  profileId: string,
): number {
  const sessions = new Set(
    events.flatMap((event) =>
      event.type === 'session-completed' && event.profileId === profileId
        ? [event.sessionId]
        : [],
    ),
  )
  return resolveDeepSeaProgress(sessions.size).completedStages
}
