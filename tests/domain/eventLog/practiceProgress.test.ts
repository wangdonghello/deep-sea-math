import { describe, expect, it } from 'vitest'

import { replayProjections } from '@/domain/eventLog/replay'
import type { DomainEvent } from '@/domain/model/types'

function answer(
  eventId: string,
  sessionId: string,
  questionId: string,
  overrides: Partial<{ correct: boolean; usedHintLevel: number; retryCount: number }> = {},
): DomainEvent {
  return {
    eventId,
    profileId: 'p1',
    occurredAt: 1,
    type: 'answer-submitted',
    sessionId,
    questionId,
    submitted: '7',
    correct: overrides.correct ?? true,
    usedHintLevel: overrides.usedHintLevel ?? 0,
    retryCount: overrides.retryCount ?? 0,
    ms: 100,
  }
}

describe('practiceProgress projection', () => {
  it('首次独立答对给 1 颗星，同一题累计两次独立答对算修复', () => {
    const events: DomainEvent[] = [
      answer('e1', 'practice-q1', 'q1'),
      answer('e2', 'practice-q1-again', 'q1'),
    ]
    const progress = replayProjections(events).practiceProgress
    expect(progress.stars).toBe(2)
    expect(progress.fixedQuestionIds).toEqual(['q1'])
    expect(progress.independentCorrectByQuestion.q1).toBe(2)
    expect(progress.badgeIds).toEqual([])
  })

  it('用了提示、重试过或答错的练习都不给星', () => {
    const events: DomainEvent[] = [
      answer('e1', 'practice-a', 'q1', { usedHintLevel: 1 }),
      answer('e2', 'practice-b', 'q1', { retryCount: 1 }),
      answer('e3', 'practice-c', 'q1', { correct: false }),
      answer('e4', 'session-daily', 'q1'),
    ]
    const progress = replayProjections(events).practiceProgress
    expect(progress.stars).toBe(0)
    expect(progress.fixedQuestionIds).toEqual([])
  })

  it('累计修复与错题星达到阈值时解锁徽章与图鉴装饰', () => {
    const events: DomainEvent[] = []
    for (let index = 0; index < 5; index += 1) {
      events.push(answer(`a-${index}-1`, `practice-${index}-1`, `q${index}`))
      events.push(answer(`a-${index}-2`, `practice-${index}-2`, `q${index}`))
    }
    const progress = replayProjections(events).practiceProgress
    expect(progress.stars).toBe(10)
    expect(progress.fixedQuestionIds).toHaveLength(5)
    expect(progress.badgeIds).toEqual(['mistake-fix-5'])
    expect(progress.decorationIds).toEqual(['mistake-star-5', 'mistake-star-10'])
  })
})
