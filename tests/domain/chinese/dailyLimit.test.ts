import { describe, expect, it } from 'vitest'

import { countChineseCompletionsToday, MAX_CHINESE_COMPLETIONS_PER_DAY } from '@/domain/chinese/dailyLimit'
import type { DomainEvent } from '@/domain/model/types'

const NOW = Date.UTC(2026, 10, 14, 12)
const TODAY = NOW - 1000
const YESTERDAY = NOW - 86_400_000

function started(sessionId: string, subject: 'chinese' | 'math' = 'chinese'): DomainEvent {
  return {
    eventId: `start-${sessionId}`, profileId: 'p1', occurredAt: TODAY,
    type: 'session-started', sessionId, questionIds: ['q1'], difficultyTrace: [1], subject,
  }
}

function completed(sessionId: string, occurredAt = TODAY): DomainEvent {
  return {
    eventId: `done-${sessionId}-${occurredAt}`, profileId: 'p1', occurredAt,
    type: 'session-completed', sessionId, rewards: [],
  }
}

describe('Chinese daily limit', () => {
  it('counts up to two Chinese completions today', () => {
    const events = [
      started('cn-1'), completed('cn-1'),
      started('cn-2'), completed('cn-2'),
      started('cn-3'),
    ]
    expect(countChineseCompletionsToday(events, 'p1', NOW)).toBe(MAX_CHINESE_COMPLETIONS_PER_DAY)
  })

  it('ignores math sessions, yesterday and duplicate completions', () => {
    const events = [
      started('math-1', 'math'), completed('math-1'),
      started('cn-old'), completed('cn-old', YESTERDAY),
      started('cn-1'), completed('cn-1'), completed('cn-1'),
    ]
    expect(countChineseCompletionsToday(events, 'p1', NOW)).toBe(1)
  })
})
