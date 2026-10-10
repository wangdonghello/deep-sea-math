import { describe, expect, it } from 'vitest'

import type { AnswerEvent, AnswerSubmittedEvent } from '../../../src/domain/model/types'
import {
  advanceTopicMastery,
  classifyAnswerSignal,
  MASTERY_TRANSITIONS,
} from '../../../src/domain/mastery/masteryStateMachine'
import { computeCurrentDifficulty } from '../../../src/domain/quiz/difficulty'
import { classifyStreakSignal } from '../../../src/domain/quiz/streakSignal'

/**
 * 连击口径**对拍**：mastery 与 difficulty 共用同一份「连续独立答对」判定。
 *
 * Task 6 的 `replayProjections` 会同时消费 mastery 的题型级连击与 difficulty
 * 的难度连击。若两处口径漂移，同一段事件流会给出两个独立连击数。本文件用
 * 两条对拍把它们焊在一起：
 * 1. **表对拍**：`MASTERY_TRANSITIONS[s].advancesStreak === (classifyStreakSignal(事件) === 'independent')`
 *    ——掌握表的「推进连击」位与共享真源的「independent」恒等。
 * 2. **行为对拍**：给定同一段事件，mastery 题型级 `independentStreak` 与
 *    difficulty 演化出来的独立连击数始终相等（并锁定 difficulty 数值结论，
 *    证明对齐没改坏 T4 的既有升/降档语义）。
 */

const NOW = 1_700_000_000_000

/** 造一条独立答对（首次、未用提示、一次就对）。 */
function independent(questionId: string, seq: number): AnswerSubmittedEvent {
  return {
    eventId: `e-ind-${seq}`,
    profileId: 'p-1',
    occurredAt: NOW + seq,
    type: 'answer-submitted',
    sessionId: 's-1',
    questionId,
    submitted: '6',
    correct: true,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 900,
  }
}

/**
 * 抽取一段事件里所有 `p-1` 的答题相关事件（过滤窗口也只看 occurredAt ≥
 * NOW，避免 difficulty 的 7 天窗口把构造的事件剔掉——这里 occurredAt 都
 * ≥ NOW 且 `now` 取 NOW+len，窗口足够宽）。
 */
function recent(events: AnswerEvent[]): AnswerEvent[] {
  return events.filter((e) => e.profileId === 'p-1')
}

/** 用 mastery 迁移把题型级 independentStreak 走一遍（只关心连击末值）。 */
function masteryStreakAfter(events: AnswerEvent[]): number {
  // 与 difficulty 一样按时间正序处理，保证对拍比较的是同一顺序。
  let current
  const sorted = [...recent(events)].sort((a, b) => a.occurredAt - b.occurredAt)
  for (const event of sorted) {
    current = advanceTopicMastery(current, event)
  }
  return current?.independentStreak ?? 0
}

/**
 * difficulty 的内部独立连击（复刻 computeCurrentDifficulty 的推进逻辑，但只
 * 取末态独立连击数）。这里**不**去重算判定——直接调用共享的 classifyStreakSignal，
 * 与两个模块的判定保持单一来源。
 */
function difficultyIndependentStreak(events: AnswerEvent[]): number {
  let independentStreak = 0
  const sorted = [...recent(events)].sort((a, b) => a.occurredAt - b.occurredAt)
  for (const event of sorted) {
    const signal = classifyStreakSignal(event)
    if (signal === 'independent') {
      independentStreak += 1
    } else if (signal === 'breaker' || signal === 'hinted') {
      independentStreak = 0
    }
  }
  return independentStreak
}

describe('连击对拍: 事件信号 → 表', () => {
  it('MASTERY_TRANSITIONS.advancesStreak 与 classifyStreakSignal==="independent" 恒等', () => {
    // 逐类事件验证：掌握表里只有 independent 推进连击，与共享真源判定一致。
    const samples: AnswerSubmittedEvent[] = [
      independent('a', 0),
      { ...independent('a', 0), usedHintLevel: 2 },
      { ...independent('a', 0), correct: false },
      { ...independent('a', 0), retryCount: 1 },
    ]
    for (const sample of samples) {
      const signal = classifyAnswerSignal(sample)
      const advances = MASTERY_TRANSITIONS[signal!].advancesStreak
      const sharedIndependent = classifyStreakSignal(sample) === 'independent'
      expect(advances).toBe(sharedIndependent)
    }
  })

  it('classifyAnswerSignal 委托共享源：answer-revealed/correction 也归为破坏连击', () => {
    // mastery 的 correction / reveal 信号，其 advancesStreak 必为 false
    // （共享源把它们判为 breaker）。防止有人给「订正完成」开后门推进连击。
    expect(MASTERY_TRANSITIONS.correction.advancesStreak).toBe(false)
    expect(MASTERY_TRANSITIONS.reveal.advancesStreak).toBe(false)
  })
})

describe('连击对拍: 行为一致', () => {
  it('同一段含订正/看答案/答错/提示的混合流，两边独立连击末值相等', () => {
    const events: AnswerEvent[] = [
      independent('q0', 0),
      { ...independent('q1', 1), usedHintLevel: 1 }, // 提示后答对 → 断
      independent('q2', 2),
      independent('q3', 3),
      {
        eventId: 'e-hint', profileId: 'p-1', occurredAt: NOW + 40, type: 'hint-used',
        sessionId: 's-1', questionId: 'q3', level: 1,
      },
      {
        eventId: 'e-corr', profileId: 'p-1', occurredAt: NOW + 50, type: 'correction-done',
        sessionId: 's-1', questionId: 'q3', similarQuestionId: 'q3-sim',
      },
      {
        eventId: 'e-rev', profileId: 'p-1', occurredAt: NOW + 60, type: 'answer-revealed',
        sessionId: 's-1', questionId: 'q5',
      },
      independent('q6', 7),
      independent('q7', 8),
      { ...independent('q8', 9), correct: false }, // 末尾答错 → 归零
    ]

    // mastery 题型轨独立连击末值
    const mastery = masteryStreakAfter(events)
    // difficulty 内部独立连击末值
    const difficulty = difficultyIndependentStreak(events)
    expect(mastery).toBe(difficulty)
    // 事件流末尾串接订正与看答案两种 breaker，独立连击必归零；两边末值一致均为 0。
    expect(mastery).toBe(0)
  })

  it('末尾连续独立答对 3 次，两边都数到 3（且 mastery 进 stable）', () => {
    const events: AnswerEvent[] = [independent('q0', 0), independent('q1', 1), independent('q2', 2)]

    expect(masteryStreakAfter(events)).toBe(3)
    expect(difficultyIndependentStreak(events)).toBe(3)

    let current
    for (const event of recent(events)) {
      current = advanceTopicMastery(current, event)
    }
    expect(current?.level).toBe('stable')
  })

  it('对齐未改坏 T4 数值：3 连独立答对升档（base 1 → 2）', () => {
    // difficulty 的对齐（correction 从 ignored 改 breaker）不能动既有升档结论。
    const events = [independent('q0', 0), independent('q1', 1), independent('q2', 2)]
    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW + 10 })).toBe(2)
  })

  it('对齐未改坏 T4 数值：提示后答对 2 连降档（base 2 → 1）', () => {
    const events = [
      { ...independent('q0', 0), usedHintLevel: 1 },
      { ...independent('q1', 1), usedHintLevel: 1 },
    ]
    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW + 10, baseDifficulty: 2 })).toBe(1)
  })

  it('订正完成不再被 difficulty 忽略：会打断独立连击', () => {
    // 改 breaker 后，独立连击中段插入订正，独立连击应归零（旧行为是忽略它）。
    const events: AnswerEvent[] = [
      independent('q0', 0),
      independent('q1', 1),
      {
        eventId: 'e-corr', profileId: 'p-1', occurredAt: NOW + 2, type: 'correction-done',
        sessionId: 's-1', questionId: 'q-old', similarQuestionId: 'q-old-sim',
      },
      independent('q2', 3),
    ]
    // 订正后只剩末 1 连：不足以升档，且与 mastery 末值一致。
    expect(difficultyIndependentStreak(events)).toBe(1)
    expect(masteryStreakAfter(events)).toBe(1)
    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW + 30 })).toBe(1)
  })
})
