import { describe, expect, it } from 'vitest'

import type { AnswerSubmittedEvent, DomainEvent } from '../../../src/domain/model/types'
import { classifyStreakSignal } from '../../../src/domain/quiz/streakSignal'

/**
 * `domain/quiz/streakSignal` 的行为契约。
 *
 * 这是「连续独立答对」连击的**唯一真源**：`quiz/difficulty` 的难度连击与
 * `mastery/masteryStateMachine` 的题型级连击都委托它判定「推进 / 打断 /
 * 不参与」。这里逐条锁判定，两个消费方的对拍见各自测试里的「对拍」用例。
 */

/** 造一次 answer-submitted，逐字段可控，便于覆盖各分支组合。 */
function submitted(overrides: Partial<AnswerSubmittedEvent> = {}): AnswerSubmittedEvent {
  return {
    eventId: 'e-sub',
    profileId: 'p-1',
    occurredAt: 1_700_000_000_000,
    type: 'answer-submitted',
    sessionId: 's-1',
    questionId: 'q-1',
    submitted: '6',
    correct: true,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 900,
    ...overrides,
  }
}

describe('domain/quiz: streakSignal — answer-submitted 三态', () => {
  it('首次、未用提示、一次就对 → independent', () => {
    expect(classifyStreakSignal(submitted())).toBe('independent')
  })

  it('用了提示仍答对 → hinted', () => {
    expect(classifyStreakSignal(submitted({ usedHintLevel: 3 }))).toBe('hinted')
  })

  it('答错 → breaker', () => {
    expect(classifyStreakSignal(submitted({ correct: false }))).toBe('breaker')
  })

  it('改错后才对（retryCount > 0、未用提示）→ breaker（不算独立）', () => {
    // 关键：correct=true 也不能算 independent，否则连错 5 次后蒙对会推进连击。
    expect(classifyStreakSignal(submitted({ retryCount: 2 }))).toBe('breaker')
  })

  it('用了提示且改错后才对 → hinted（提示优先于 retry 归零）', () => {
    // 与 difficulty 原 isHintedCorrect 一致：correct 且 usedHintLevel>0 即 hinted，
    // 即便 retryCount>0。顺序颠倒会让「连续提示后答对降档」语义变化。
    expect(classifyStreakSignal(submitted({ usedHintLevel: 1, retryCount: 3 }))).toBe('hinted')
  })
})

describe('domain/quiz: streakSignal — 非提交事件', () => {
  it('看答案 → breaker（没独立做出来）', () => {
    const reveal: DomainEvent = {
      eventId: 'e-reveal',
      profileId: 'p-1',
      occurredAt: 1_700_000_000_000,
      type: 'answer-revealed',
      sessionId: 's-1',
      questionId: 'q-1',
      revealedAnswer: true,
    }
    expect(classifyStreakSignal(reveal)).toBe('breaker')
  })

  it('订正完成 → breaker（订正过即非独立，与 mastery 对齐）', () => {
    const correction: DomainEvent = {
      eventId: 'e-corr',
      profileId: 'p-1',
      occurredAt: 1_700_000_000_000,
      type: 'correction-done',
      sessionId: 's-1',
      questionId: 'q-1',
      similarQuestionId: 'q-1-sim',
    }
    expect(classifyStreakSignal(correction)).toBe('breaker')
  })

  it('展开提示 hint-used → ignored（不构成成败信号）', () => {
    const hint: DomainEvent = {
      eventId: 'e-hint',
      profileId: 'p-1',
      occurredAt: 1_700_000_000_000,
      type: 'hint-used',
      sessionId: 's-1',
      questionId: 'q-1',
      level: 1,
    }
    expect(classifyStreakSignal(hint)).toBe('ignored')
  })

  it('其它流程事件（建档/开始题组/设置/解锁/回落）→ ignored', () => {
    const flow: DomainEvent[] = [
      {
        eventId: 'e-1', profileId: 'p-1', occurredAt: 1,
        type: 'profile-created', nickname: 'n', avatarId: 'a', pinHash: 'h', salt: 's',
      },
      {
        eventId: 'e-2', profileId: 'p-1', occurredAt: 1,
        type: 'session-started', sessionId: 's', questionIds: ['q'], difficultyTrace: [1],
      },
      {
        eventId: 'e-3', profileId: 'p-1', occurredAt: 1,
        type: 'settings-updated', basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 20,
      },
      {
        eventId: 'e-4', profileId: 'p-1', occurredAt: 1,
        type: 'session-completed', sessionId: 's', rewards: [],
      },
      {
        eventId: 'e-5', profileId: 'p-1', occurredAt: 1,
        type: 'unlock-granted', targetId: 'c-1', kind: 'creature', reason: 's',
      },
    ]
    for (const event of flow) {
      expect(classifyStreakSignal(event)).toBe('ignored')
    }
  })
})
