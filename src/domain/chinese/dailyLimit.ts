import type { DomainEvent, SessionCompletedEvent, SessionStartedEvent } from '../model/types'

/** 语文每天最多通关两次。 */
export const MAX_CHINESE_COMPLETIONS_PER_DAY = 2

/** UTC 日期键，与数学每日组题/报告口径一致。 */
function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/**
 * 统计某档案当天已完成的语文轮次。
 *
 * 只认 `session-started.subject === 'chinese'` 的会话，避免把数学题组误算进来；
 * 同一会话即使重复写入 `session-completed` 也只算一次。
 */
export function countChineseCompletionsToday(
  events: readonly DomainEvent[],
  profileId: string,
  now: number,
): number {
  const chineseSessions = new Set(
    events
      .filter((event): event is SessionStartedEvent =>
        event.profileId === profileId && event.type === 'session-started' && event.subject === 'chinese',
      )
      .map((event) => event.sessionId),
  )
  const today = dayKey(now)
  return new Set(
    events
      .filter((event): event is SessionCompletedEvent =>
        event.profileId === profileId &&
        event.type === 'session-completed' &&
        chineseSessions.has(event.sessionId) &&
        dayKey(event.occurredAt) === today,
      )
      .map((event) => event.sessionId),
  ).size
}
