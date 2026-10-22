import { describe, expect, it } from 'vitest'

import { replayProjections } from '@/domain/eventLog/replay'
import type { DomainEvent } from '@/domain/model/types'

const base = { profileId: 'p1', sessionId: 's1', questionId: 'q1', usedHintLevel: 0, retryCount: 0, ms: 10 }

describe('mistake last wrong answer', () => {
  it('stores the latest wrong submission', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'e1', occurredAt: 1, type: 'answer-submitted', submitted: '7', correct: false },
      { ...base, eventId: 'e2', occurredAt: 2, type: 'answer-submitted', submitted: '8', correct: false, retryCount: 1 },
    ]
    const projections = replayProjections(events, { profileId: 'p1' })
    expect(projections.mistakeBook.q1.lastWrongAnswer).toBe('8')
  })

  it('leaves it undefined when the question was only revealed', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'e1', occurredAt: 1, type: 'answer-revealed', revealedAnswer: true },
    ]
    const projections = replayProjections(events, { profileId: 'p1' })
    expect(projections.mistakeBook.q1.lastWrongAnswer).toBeUndefined()
  })
})
