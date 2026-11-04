import { describe, expect, it } from 'vitest'

import { sessionPoints } from '@/domain/economy/ledger'
import type { DomainEvent } from '@/domain/model/types'

const events: DomainEvent[] = [
  { eventId: 's', profileId: 'p1', occurredAt: 0, type: 'session-started', sessionId: 's1', questionIds: ['q1', 'q2'], difficultyTrace: [] },
  { eventId: 'a1', profileId: 'p1', occurredAt: 1, type: 'answer-submitted', sessionId: 's1', questionId: 'q1', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
  { eventId: 'a2', profileId: 'p1', occurredAt: 2, type: 'answer-submitted', sessionId: 's1', questionId: 'q2', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
]

describe('sessionPoints', () => {
  it('一组两题全对：2 + 5 + 3 = 10 分', () => {
    expect(sessionPoints(events, 'p1', 's1')).toBe(10)
  })

  it('未知题组为 0 分', () => {
    expect(sessionPoints(events, 'p1', 'missing')).toBe(0)
  })
})

describe('sessionPoints 与账本同口径', () => {
  it('同一天重练同一批题，基础分不重复计', () => {
    const repeated: DomainEvent[] = [
      { eventId: 's1', profileId: 'p1', occurredAt: 0, type: 'session-started', sessionId: 's1', questionIds: ['q1', 'q2'], difficultyTrace: [] },
      { eventId: 'a1', profileId: 'p1', occurredAt: 1, type: 'answer-submitted', sessionId: 's1', questionId: 'q1', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
      { eventId: 'a2', profileId: 'p1', occurredAt: 2, type: 'answer-submitted', sessionId: 's1', questionId: 'q2', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
      { eventId: 's2', profileId: 'p1', occurredAt: 3, type: 'session-started', sessionId: 's2', questionIds: ['q1', 'q2'], difficultyTrace: [] },
      { eventId: 'b1', profileId: 'p1', occurredAt: 4, type: 'answer-submitted', sessionId: 's2', questionId: 'q1', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
      { eventId: 'b2', profileId: 'p1', occurredAt: 5, type: 'answer-submitted', sessionId: 's2', questionId: 'q2', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
    ]
    // 第二组没有新增“当天首次答对”的题：基础分 0，但完成 5 分 + 正确率 3 分仍发（与账本一致）。
    expect(sessionPoints(repeated, 'p1', 's2')).toBe(8)
  })
})
