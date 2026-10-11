import { describe, expect, it } from 'vitest'

import { EVENT_TYPES, type AnswerSubmittedEvent, type DomainEvent } from '../../../src/domain/model/types'
import {
  computeCurrentDifficulty,
  createDifficultyFallbackEvent,
  resolveEffectiveDifficulty,
} from '../../../src/domain/quiz/difficulty'

/**
 * `domain/quiz/difficulty` 的行为契约。
 *
 * 锁三件事：难度自适应公式（连续独立答对升一档、连续提示后才答对降一档、
 * clamp 在 1..3 内）、档位回落（目标档题量不足时从相邻档补齐）与
 * `difficultyFallback` 事件的字段完整性。
 *
 * 全部用真实事件字面量驱动，不 mock 时钟或随机源——本模块的确定性来自
 * 输入本身，时间由入参 `now` 固定，随机房无从介入。
 */

/** 固定「现在」，作为 7 天窗口的比较基准。 */
const NOW = 1_700_000_000_000
/** 一天的毫秒数。命名常量而非散落字面量，窗口计算只引用这一处。 */
const DAY_MS = 24 * 60 * 60 * 1000

/** 造一次「未用提示、直接答对」的提交（首次独立答对的最小事件形态）。 */
function independentAnswer(questionId: string, seq: number): AnswerSubmittedEvent {
  return {
    eventId: `e-${seq}`,
    profileId: 'p-1',
    occurredAt: NOW,
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

/** 造一次「展开提示后才答对」的提交（判定提示后掌握，不计独立）。 */
function hintedAnswer(questionId: string, seq: number): AnswerSubmittedEvent {
  return { ...independentAnswer(questionId, seq), usedHintLevel: 2 }
}

/** 把一次答题事件改写为 `ageDays` 天前发生，用于测试 7 天窗口过滤。 */
function aged(answer: AnswerSubmittedEvent, ageDays: number): AnswerSubmittedEvent {
  return { ...answer, occurredAt: NOW - ageDays * DAY_MS }
}

/** 造 count 次同类型答题事件，每次换一道题，避免同题重复计数歧义。 */
function streakOf(count: number, build: (index: number) => AnswerSubmittedEvent): AnswerSubmittedEvent[] {
  return Array.from({ length: count }, (_, index) => build(index))
}

describe('domain/quiz: difficulty — 升档', () => {
  it('连续 3 次首次独立答对后升一档', () => {
    const events = streakOf(3, (index) => independentAnswer(`q-${index}`, index))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(2)
  })

  it('连续 2 次独立答对不升档（未达 3 连门槛）', () => {
    const events = streakOf(2, (index) => independentAnswer(`q-${index}`, index))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(1)
  })

  it('答错打断独立连击后重新计数', () => {
    const events = [
      independentAnswer('q-0', 0),
      independentAnswer('q-1', 1),
      { ...independentAnswer('q-2', 2), correct: false },
      independentAnswer('q-3', 3),
    ]

    // 末尾只剩 1 连，不该因为前面曾凑到 2 连就升档。
    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(1)
  })

  it('重试后才答对同样打断独立连击（retryCount > 0 不算独立答对）', () => {
    const events = [
      independentAnswer('q-0', 0),
      independentAnswer('q-1', 1),
      { ...independentAnswer('q-2', 2), retryCount: 1 },
      independentAnswer('q-3', 3),
    ]

    // 改过错才算会的那一题不计入「首次独立答对」，连击在此中断；末尾仅 1 连。
    // 这条锁住 isIndependentCorrect 的 retryCount === 0 条件：若实现改成不看
    // retryCount，本题会误判为 2 连 + 1 连 = 3 连而升档。
    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(1)
  })

  it('整段都是重试后答对时始终不升档', () => {
    const events = streakOf(9, (index) => ({ ...independentAnswer(`q-${index}`, index), retryCount: 1 }))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(1)
  })

  it('升档最多 +1，答对 9 题也不会连跳两档', () => {
    const events = streakOf(9, (index) => independentAnswer(`q-${index}`, index))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(2)
  })
})

describe('domain/quiz: difficulty — 降档', () => {
  it('连续 2 题提示后才答对降一档', () => {
    const events = streakOf(2, (index) => hintedAnswer(`q-${index}`, index))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW, baseDifficulty: 2 })).toBe(1)
  })

  it('降档下限 1，不会跌破新手档', () => {
    const events = streakOf(4, (index) => hintedAnswer(`q-${index}`, index))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW, baseDifficulty: 1 })).toBe(1)
  })

  it('单次提示后答对不降档（未达 2 连门槛）', () => {
    const events = [hintedAnswer('q-0', 0)]

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW, baseDifficulty: 2 })).toBe(2)
  })

  it('看答案打断独立连击，且本身不计入提示后连击', () => {
    // 独立连击被看答案清零（剩 0 连），提示后连击也只有 1 连（未达 2 连），
    // 两者都不触发调整，留在 baseDifficulty。
    const events: DomainEvent[] = [
      independentAnswer('q-0', 0),
      {
        eventId: 'e-reveal',
        profileId: 'p-1',
        occurredAt: NOW,
        type: 'answer-revealed',
        sessionId: 's-1',
        questionId: 'q-1',
        revealedAnswer: true,
      },
      hintedAnswer('q-2', 2),
    ]

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW, baseDifficulty: 2 })).toBe(2)
  })
})

describe('domain/quiz: difficulty — clamp 与事件过滤', () => {
  it('升档与降档条件同时成立时按公式相加', () => {
    // 1 连独立（未达 3）+ 3 连提示（已达 2）：net = 0 - 1 = -1 → 从 2 降到 1。
    const events = [
      independentAnswer('q-0', 0),
      hintedAnswer('q-1', 1),
      hintedAnswer('q-2', 2),
      hintedAnswer('q-3', 3),
    ]

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW, baseDifficulty: 2 })).toBe(1)
  })

  it('档位被 clamp 在 1..3 内', () => {
    expect(computeCurrentDifficulty({ profileId: 'p-1', events: [], now: NOW })).toBe(1)

    const ceiling = computeCurrentDifficulty({
      profileId: 'p-1',
      events: streakOf(6, (index) => independentAnswer(`q-${index}`, index)),
      now: NOW,
      baseDifficulty: 3,
    })
    expect(ceiling).toBe(3)
  })

  it('只统计近 7 天事件，更早的历史不影响档位', () => {
    const events = [
      ...streakOf(3, (index) => aged(independentAnswer(`old-${index}`, index), 8)),
      independentAnswer('new-0', 9),
    ]

    // 3 连独立答对全在 8 天前 → 被窗口剔除，只剩 1 连新事件，不升档。
    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(1)
  })

  it('窗口边界：正好 7 天前的事件仍算近 7 天', () => {
    const events = streakOf(3, (index) => aged(independentAnswer(`q-${index}`, index), 7))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(2)
  })

  it('只统计本档案事件，别的档案表现不串档', () => {
    const events: DomainEvent[] = [
      ...streakOf(3, (index) => ({ ...independentAnswer(`other-${index}`, index), profileId: 'p-2' })),
      independentAnswer('mine-0', 9),
    ]

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(1)
  })

  it('无历史事件时保持 baseDifficulty 缺省值 1', () => {
    expect(computeCurrentDifficulty({ profileId: 'p-1', events: [], now: NOW })).toBe(1)
    expect(computeCurrentDifficulty({ profileId: 'p-1', events: [], now: NOW, baseDifficulty: 2 })).toBe(2)
  })

  it('时间窗口由可注入的 windowDays 控制，不写死 7', () => {
    // 同一批 8 天前的事件：窗口 7 天时被剔除，窗口 14 天时纳入。
    const events = streakOf(3, (index) => aged(independentAnswer(`q-${index}`, index), 8))

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(1)
    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW, windowDays: 14 })).toBe(2)
  })

  it('非答题事件不参与连击计算，读了也不影响档位', () => {
    // hint-used / correction-done / session-started 等不构成成败信号：
    // 孩子展开一次提示并不等于失败，若它们清零连击，「连续提示后答对降档」
    // 将永远攒不到 2 连。这里把提示与答对交错，验证连击仍然计满 3。
    const events: DomainEvent[] = [
      independentAnswer('q-0', 0),
      {
        eventId: 'e-hint',
        profileId: 'p-1',
        occurredAt: NOW,
        type: 'hint-used',
        sessionId: 's-1',
        questionId: 'q-0',
        level: 1,
      },
      independentAnswer('q-1', 1),
      {
        eventId: 'e-start',
        profileId: 'p-1',
        occurredAt: NOW,
        type: 'session-started',
        sessionId: 's-2',
        questionIds: ['q-2'],
        difficultyTrace: [1],
      },
      independentAnswer('q-2', 2),
    ]

    expect(computeCurrentDifficulty({ profileId: 'p-1', events, now: NOW })).toBe(2)
  })

})

describe('domain/quiz: difficulty — 档位回落', () => {
  /** 造一个「各档可用题数」表：`tiers[档位] = 题数`。 */
  function counts(tiers: Partial<Record<1 | 2 | 3, number>>) {
    return { 1: tiers[1] ?? 0, 2: tiers[2] ?? 0, 3: tiers[3] ?? 0 } as Record<1 | 2 | 3, number>
  }

  /** 需要取的题数：spec 默认的基础题数。 */
  const NEED = 5

  it('目标档题量充足时不回落', () => {
    expect(resolveEffectiveDifficulty(2, counts({ 2: 5 }), NEED)).toEqual({ difficulty: 2, fallback: false })
  })

  it('目标档凑不够所需题数时，从能凑够的相邻档补齐', () => {
    // 2 档 0 题、1 档只有 2 题（凑不够 5）、3 档有 5 题 → 只能去 3 档。
    expect(resolveEffectiveDifficulty(2, counts({ 1: 2, 3: 5 }), NEED)).toEqual({ difficulty: 3, fallback: true })
  })

  it('相邻两档都能凑够时优先低档（别难为孩子）', () => {
    // 2 档空了，1 档与 3 档都有 5 题：先低后高，选 1 档。
    expect(resolveEffectiveDifficulty(2, counts({ 1: 5, 3: 5 }), NEED)).toEqual({ difficulty: 1, fallback: true })
  })

  it('目标档题量偏少但仍最多时，不换档、由 repeatCount 兜底', () => {
    // 没有任何一档能凑够 5：2 档有 2 题（最多）、1 档 1 题、3 档 0 题 →
    // 留在 2 档靠重复填满，且不算难度回落。
    expect(resolveEffectiveDifficulty(2, counts({ 1: 1, 2: 2 }), NEED)).toEqual({ difficulty: 2, fallback: false })
  })

  it('题库整体短缺时取题数最多的档，即使它在相邻高档', () => {
    // 目标 3 档 0 题，2 档 1 题、1 档 2 题 → 无一档够 5，取最多的 1 档。
    expect(resolveEffectiveDifficulty(3, counts({ 1: 2, 2: 1 }), NEED)).toEqual({ difficulty: 1, fallback: true })
  })

  it('三档全空时保持目标档，由调用方走 repeatCount 分支', () => {
    // 池枯竭时无档可落：此时不回落（没有"另一个档"这回事），档位保持目标档。
    expect(resolveEffectiveDifficulty(2, counts({}), NEED)).toEqual({ difficulty: 2, fallback: false })
  })

  it('回落带来的题序差可复现：同输入必同档位', () => {
    // 回落判定只依赖 (requested, counts, needed) 三个数字，不含任何随机或
    // 时间成分——同输入必同输出在回落路径上同样成立。
    const first = resolveEffectiveDifficulty(2, counts({ 1: 5, 3: 5 }), NEED)
    const second = resolveEffectiveDifficulty(2, counts({ 1: 5, 3: 5 }), NEED)
    expect(second).toEqual(first)
  })

  it('回落事件带 requestedDifficulty / actualDifficulty / reason / category', () => {
    const event = createDifficultyFallbackEvent({
      eventId: 'e-fallback',
      profileId: 'p-1',
      occurredAt: NOW,
      sessionId: 's-1',
      requestedDifficulty: 3,
      actualDifficulty: 2,
      category: 'basic',
    })

    expect(event.type).toBe('difficulty-fallback')
    expect(event.eventId).toBe('e-fallback')
    expect(event.sessionId).toBe('s-1')
    expect(event.requestedDifficulty).toBe(3)
    expect(event.actualDifficulty).toBe(2)
    expect(event.category).toBe('basic')
    // reason 由实现生成而非调用方拼字符串：家长报告只认这一种文案。
    expect(event.reason).toContain('3')
    expect(event.reason).toContain('2')
    // 事件类型必须已登记进 EVENT_TYPES，否则重放层不认识它。
    expect(EVENT_TYPES).toContain('difficulty-fallback')
  })
})
