import { describe, expect, it } from 'vitest'

import { resolveLedger } from '@/domain/economy/ledger'
import type { DomainEvent } from '@/domain/model/types'

/**
 * `domain/economy/ledger` 的行为契约。
 *
 * 锁五件事：
 * 1. 独立答对（未用提示、无重试）每题每天只 +1，同一天同一题重复作答不重复计分；
 * 2. 整组完成 +5，独立正确率 ≥80% 再 +3；
 * 3. 订正每题 +2，每天最多计 5 题，跨天重新计数；
 * 4. 购买按事件里的 `price` 扣减，余额 = earned - spent；
 * 5. 只统计传入 `profileId` 的事件，档案之间互不影响。
 *
 * 所有时间戳都用定值，避免时钟影响用例。
 */

const day = 86_400_000

function answer(
  id: string,
  qid: string,
  at: number,
  overrides: Partial<{ correct: boolean; hint: number; retry: number }> = {},
): DomainEvent {
  return {
    eventId: `a-${id}`,
    profileId: 'p1',
    occurredAt: at,
    type: 'answer-submitted',
    sessionId: 's1',
    questionId: qid,
    submitted: '1',
    correct: overrides.correct ?? true,
    usedHintLevel: overrides.hint ?? 0,
    retryCount: overrides.retry ?? 0,
    ms: 100,
  }
}

describe('resolveLedger', () => {
  it('独立答对每题 +1，同一天同题不重复', () => {
    const events = [answer('1', 'q1', 0), answer('2', 'q1', 1), answer('3', 'q2', 2)]
    expect(resolveLedger(events, 'p1').balance).toBe(2)
  })

  it('同一道题跨 UTC 日再次独立答对可再 +1', () => {
    const events = [answer('1', 'q1', 0), answer('2', 'q1', day)]
    expect(resolveLedger(events, 'p1').balance).toBe(2)
  })

  it('用提示或重试的答对不计分', () => {
    const events = [answer('1', 'q1', 0, { hint: 1 }), answer('2', 'q2', 0, { retry: 1 })]
    expect(resolveLedger(events, 'p1').balance).toBe(0)
  })

  it('整组完成 +5，正确率 ≥80% 再 +3', () => {
    const events: DomainEvent[] = [
      ...Array.from({ length: 9 }, (_, i) => answer(`${i}`, `q${i}`, i)),
      {
        eventId: 'c1',
        profileId: 'p1',
        occurredAt: 10,
        type: 'session-completed',
        sessionId: 's1',
        rewards: [],
      },
    ]
    expect(resolveLedger(events, 'p1').balance).toBe(17)
  })

  it('订正每天最多 5 题，购物流水扣减余额', () => {
    const corrections: DomainEvent[] = Array.from({ length: 8 }, (_, i) => ({
      eventId: `fix-${i}`,
      profileId: 'p1',
      occurredAt: i,
      type: 'correction-done',
      sessionId: 's1',
      questionId: `q${i}`,
      similarQuestionId: `s${i}`,
    }))
    const purchase: DomainEvent = {
      eventId: 'buy',
      profileId: 'p1',
      occurredAt: day,
      type: 'item-purchased',
      itemId: 'glow-ball',
      price: 5,
    }
    const ledger = resolveLedger([...corrections, purchase], 'p1')
    // 订正 8 题只算 5 题 = 10 分，买 5 分 → 余额 5。
    expect(ledger.balance).toBe(5)
  })

  it('只统计本档案的事件，并区分 earned / spent', () => {
    const otherProfile: DomainEvent = { ...answer('x', 'q9', 0), profileId: 'p2' }
    const purchase: DomainEvent = {
      eventId: 'buy',
      profileId: 'p1',
      occurredAt: 1,
      type: 'item-purchased',
      itemId: 'food',
      price: 1,
    }
    const ledger = resolveLedger(
      [answer('1', 'q1', 0), answer('2', 'q2', 0), otherProfile, purchase],
      'p1',
    )
    expect(ledger).toEqual({ balance: 1, earned: 2, spent: 1 })
  })

  it('正确率不足 80% 时不发准确率奖励', () => {
    const events: DomainEvent[] = [
      answer('1', 'q1', 0),
      answer('2', 'q2', 0, { hint: 1 }),
      answer('3', 'q3', 0, { retry: 1 }),
      {
        eventId: 'c1',
        profileId: 'p1',
        occurredAt: 1,
        type: 'session-completed',
        sessionId: 's1',
        rewards: [],
      },
    ]
    // 独立答对 1 题、该组共作答 3 题 → 33%，仅 1 + 5 = 6。
    expect(resolveLedger(events, 'p1').balance).toBe(6)
  })

  it('正确率恰好 80%（4/5）时发准确率奖励', () => {
    const events: DomainEvent[] = [
      ...Array.from({ length: 4 }, (_, i) => answer(`${i}`, `q${i}`, i)),
      answer('4', 'q4', 4, { correct: false }),
      {
        eventId: 'c1',
        profileId: 'p1',
        occurredAt: 5,
        type: 'session-completed',
        sessionId: 's1',
        rewards: [],
      },
    ]
    // 独立答对 4/5 = 80%，刚好达标：4 + 5 + 3 = 12。
    expect(resolveLedger(events, 'p1').balance).toBe(12)
  })

  it('正确率 80% 以下（3/5）不发准确率奖励', () => {
    const events: DomainEvent[] = [
      ...Array.from({ length: 3 }, (_, i) => answer(`${i}`, `q${i}`, i)),
      answer('3', 'q3', 3, { correct: false }),
      answer('4', 'q4', 4, { correct: false }),
      {
        eventId: 'c1',
        profileId: 'p1',
        occurredAt: 5,
        type: 'session-completed',
        sessionId: 's1',
        rewards: [],
      },
    ]
    // 独立答对 3/5 = 60%：3 + 5 = 8。
    expect(resolveLedger(events, 'p1').balance).toBe(8)
  })

  it('有题组事件时按题组题数计算正确率', () => {
    const events: DomainEvent[] = [
      {
        eventId: 'start',
        profileId: 'p1',
        occurredAt: -1,
        type: 'session-started',
        sessionId: 's1',
        questionIds: Array.from({ length: 10 }, (_, i) => `q${i}`),
        difficultyTrace: [],
      },
      ...Array.from({ length: 4 }, (_, i) => answer(`${i}`, `q${i}`, i)),
      {
        eventId: 'c1',
        profileId: 'p1',
        occurredAt: 5,
        type: 'session-completed',
        sessionId: 's1',
        rewards: [],
      },
    ]
    // 题组 10 题只独立答对 4 题 → 40%，不足 80%，只拿 4 + 5 = 9。
    expect(resolveLedger(events, 'p1').balance).toBe(9)
  })

  it('订正上限按天重置', () => {
    const corrections: DomainEvent[] = [
      ...Array.from({ length: 8 }, (_, i) => ({
        eventId: `fix-${i}`,
        profileId: 'p1',
        occurredAt: i,
        type: 'correction-done' as const,
        sessionId: 's1',
        questionId: `q${i}`,
        similarQuestionId: `s${i}`,
      })),
      {
        eventId: 'fix-next-day',
        profileId: 'p1',
        occurredAt: day,
        type: 'correction-done',
        sessionId: 's1',
        questionId: 'q-next',
        similarQuestionId: 's-next',
      },
    ]
    // 第一天 5 题、第二天 1 题，共 6 题 × 2 = 12。
    expect(resolveLedger(corrections, 'p1').balance).toBe(12)
  })

  it('没有作答记录的整组完成只发完成分', () => {
    const events: DomainEvent[] = [
      {
        eventId: 'c1',
        profileId: 'p1',
        occurredAt: 0,
        type: 'session-completed',
        sessionId: 's-empty',
        rewards: [],
      },
    ]
    // 正确率分母为 0，不能判成 100% 而多发 3 分。
    expect(resolveLedger(events, 'p1')).toEqual({ balance: 5, earned: 5, spent: 0 })
  })

  it('同一 sessionId 的重复完成事件只计一次', () => {
    const events: DomainEvent[] = [
      ...Array.from({ length: 5 }, (_, i) => answer(`${i}`, `q${i}`, i)),
      {
        eventId: 'c1',
        profileId: 'p1',
        occurredAt: 6,
        type: 'session-completed',
        sessionId: 's1',
        rewards: [],
      },
      {
        eventId: 'c2',
        profileId: 'p1',
        occurredAt: 7,
        type: 'session-completed',
        sessionId: 's1',
        rewards: [],
      },
    ]
    // 5 独立答对 + 完成 5 + 正确率 3 = 13；第二条完成事件不再发分。
    expect(resolveLedger(events, 'p1').balance).toBe(13)
  })

  it('纯函数不 clamp 余额，买超时余额可为负', () => {
    const events: DomainEvent[] = [
      {
        eventId: 'buy',
        profileId: 'p1',
        occurredAt: 0,
        type: 'item-purchased',
        itemId: 'deep-badge',
        price: 30,
      },
    ]
    // 购买校验在命令层；这里如实记录事件，不静默把余额改成 0。
    expect(resolveLedger(events, 'p1')).toEqual({ balance: -30, earned: 0, spent: 30 })
  })
})
