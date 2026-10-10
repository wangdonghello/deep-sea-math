import { describe, expect, it } from 'vitest'

import type {
  AnswerEvent,
  AnswerRevealedEvent,
  AnswerSubmittedEvent,
  CorrectionDoneEvent,
  MasteryState,
} from '../../../src/domain/model/types'
import { MASTERY_LEVELS } from '../../../src/domain/model/types'
import {
  advanceQuestionMastery,
  advanceTopicMastery,
  applyMasteryTransition,
  classifyAnswerSignal,
  MASTERY_TRANSITIONS,
} from '../../../src/domain/mastery/masteryStateMachine'

/**
 * `domain/mastery/masteryStateMachine` 的行为契约。
 *
 * 锁四件事（对应 spec `daily-math-quest` §掌握状态判定的 4 个 Scenario 与
 * design §3 的迁移图）：
 * 1. 首次独立答对 → 独立掌握（未掌握 → 独立）
 * 2. 提示后答对 → 提示后掌握
 * 3. 看答案 → 提示后掌握，且 MUST NOT 进独立掌握
 * 4. 同一题型连续 3 次独立答对 → 题型稳定掌握
 *
 * 双轨：题目级（cap 在独立，永不进稳定）与题型级（连击满 3 进稳定）。
 * 等级只升不降（答错/提示不抹掉已有成果），连击归零。
 */

/** 未掌握态，等价于投影里没有记录时的缺省。 */
const UNMASTERED: MasteryState = { level: 'unmastered', independentStreak: 0 }

/** 造一次「首次独立答对」事件（未用提示、首次提交即对）。 */
function independentAnswer(questionId: string): AnswerSubmittedEvent {
  return {
    eventId: `e-${questionId}`,
    profileId: 'p-1',
    occurredAt: 1_700_000_000_000,
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

/** 造一次「提示后才答对」事件（展开了提示但仍答对）。 */
function hintedAnswer(questionId: string): AnswerSubmittedEvent {
  return { ...independentAnswer(questionId), usedHintLevel: 2 }
}

/** 造一次「看答案」事件。 */
function revealed(questionId: string): AnswerRevealedEvent {
  return {
    eventId: `e-reveal-${questionId}`,
    profileId: 'p-1',
    occurredAt: 1_700_000_000_000,
    type: 'answer-revealed',
    sessionId: 's-1',
    questionId,
    revealedAnswer: true,
  }
}

/** 造一次「答错」事件。 */
function wrongAnswer(questionId: string): AnswerSubmittedEvent {
  return { ...independentAnswer(questionId), correct: false }
}

/** 造一次「相似题订正完成」事件。 */
function correction(questionId: string): CorrectionDoneEvent {
  return {
    eventId: `e-correction-${questionId}`,
    profileId: 'p-1',
    occurredAt: 1_700_000_000_000,
    type: 'correction-done',
    sessionId: 's-1',
    questionId,
    similarQuestionId: `${questionId}-sim`,
  }
}

describe('domain/mastery: classifyAnswerSignal — 事件归一为迁移信号', () => {
  it('首次独立答对归一为 independent', () => {
    expect(classifyAnswerSignal(independentAnswer('q-1'))).toBe('independent')
  })

  it('提示后答对归一为 hinted', () => {
    expect(classifyAnswerSignal(hintedAnswer('q-1'))).toBe('hinted')
  })

  it('答错归一为 wrong', () => {
    expect(classifyAnswerSignal(wrongAnswer('q-1'))).toBe('wrong')
  })

  it('看答案归一为 reveal', () => {
    expect(classifyAnswerSignal(revealed('q-1'))).toBe('reveal')
  })

  it('相似题订正归一为 correction', () => {
    expect(classifyAnswerSignal(correction('q-1'))).toBe('correction')
  })

  it('重试后才答对不算独立答对（retryCount > 0 归为 wrong）', () => {
    const retried = { ...independentAnswer('q-1'), retryCount: 1 }
    // 与 difficulty.ts 的口径一致：改过错才算会，不计入首次独立答对。
    expect(classifyAnswerSignal(retried)).toBe('wrong')
  })

  it('hint-used 是流程事件，不产生迁移信号', () => {
    const hint = {
      eventId: 'e-hint',
      profileId: 'p-1',
      occurredAt: 1_700_000_000_000,
      type: 'hint-used',
      sessionId: 's-1',
      questionId: 'q-1',
      level: 1,
    } as AnswerEvent
    // 展开提示本身不是成败信号，读了不该改变掌握状态。
    expect(classifyAnswerSignal(hint)).toBeNull()
  })
})

describe('domain/mastery: 题目级迁移（cap 独立掌握，永不进稳定）', () => {
  it('未掌握 → 首次独立答对 → 独立掌握', () => {
    const next = advanceQuestionMastery(UNMASTERED, independentAnswer('q-1'))
    expect(next.level).toBe('independent')
    expect(next.independentStreak).toBe(1)
  })

  it('未掌握 → 提示后答对 → 提示后掌握', () => {
    const next = advanceQuestionMastery(UNMASTERED, hintedAnswer('q-1'))
    expect(next.level).toBe('hinted')
    expect(next.independentStreak).toBe(0)
  })

  it('未掌握 → 看答案 → 提示后掌握，且不得进独立掌握', () => {
    const next = advanceQuestionMastery(UNMASTERED, revealed('q-1'))
    expect(next.level).toBe('hinted')
    expect(next.independentStreak).toBe(0)
  })

  it('未掌握 → 相似题订正 → 提示后掌握', () => {
    const next = advanceQuestionMastery(UNMASTERED, correction('q-1'))
    expect(next.level).toBe('hinted')
    expect(next.independentStreak).toBe(0)
  })

  it('未掌握 → 答错 → 仍未掌握，连击为 0', () => {
    const next = advanceQuestionMastery(UNMASTERED, wrongAnswer('q-1'))
    expect(next.level).toBe('unmastered')
    expect(next.independentStreak).toBe(0)
  })

  it('题目级不设连击门槛：连续多次独立答对仍停在独立，不跃迁稳定', () => {
    // 「稳定掌握是题型级而非题目级」——题目轨不传 threshold，永不进 stable。
    let state = UNMASTERED
    for (const id of ['q-1', 'q-2', 'q-3', 'q-4']) {
      state = advanceQuestionMastery(state, independentAnswer(id))
    }
    expect(state.level).toBe('independent')
    expect(state.independentStreak).toBe(4)
  })

  it('promote 反例：题目级即便连击满 3 也不得进稳定掌握', () => {
    let state = UNMASTERED
    for (const id of ['q-1', 'q-2', 'q-3']) {
      state = advanceQuestionMastery(state, independentAnswer(id))
    }
    // 题目轨封顶在独立掌握：正面断言它停在 independent，即隐含「非 stable」。
    expect(state.level).toBe('independent')
  })
})

describe('domain/mastery: 题型级迁移（连击满 3 进稳定掌握）', () => {
  it('同一题型连续 3 次独立答对 → 稳定掌握', () => {
    let state = UNMASTERED
    for (const id of ['q-1', 'q-2', 'q-3']) {
      state = advanceTopicMastery(state, independentAnswer(id))
    }
    expect(state.level).toBe('stable')
    expect(state.independentStreak).toBe(3)
  })

  it('不同题的独立答对可跨题累计，答错即归零', () => {
    // 题型级「连续独立答对」跨题目 id 累计（spec：可为不同题）；中途插入一次
    // 答错则连击归零，前面 add-0 / add-1 攒到的 2 连被清掉。
    let state = UNMASTERED
    state = advanceTopicMastery(state, independentAnswer('add-0'))
    state = advanceTopicMastery(state, independentAnswer('add-1'))
    expect(state.level).toBe('independent')
    expect(state.independentStreak).toBe(2)
    state = advanceTopicMastery(state, wrongAnswer('add-2'))
    // 答错归零：连击清空，需重新累计到 3 才能进稳定。
    expect(state.independentStreak).toBe(0)
  })

  it('第 3 次之前停在独立掌握（未满 3 不跃迁稳定）', () => {
    let state = UNMASTERED
    state = advanceTopicMastery(state, independentAnswer('q-1'))
    state = advanceTopicMastery(state, independentAnswer('q-2'))
    expect(state.level).toBe('independent')
    expect(state.independentStreak).toBe(2)
  })

  it('答错归零连击后重新计数', () => {
    let state = UNMASTERED
    state = advanceTopicMastery(state, independentAnswer('q-1'))
    state = advanceTopicMastery(state, independentAnswer('q-2'))
    state = advanceTopicMastery(state, wrongAnswer('q-3'))
    state = advanceTopicMastery(state, independentAnswer('q-4'))
    state = advanceTopicMastery(state, independentAnswer('q-5'))
    expect(state.level).toBe('independent')
    expect(state.independentStreak).toBe(2)
  })

  it('看答案归零连击，重新累计到 3 才稳定', () => {
    let state = UNMASTERED
    state = advanceTopicMastery(state, independentAnswer('q-1'))
    state = advanceTopicMastery(state, revealed('q-2'))
    expect(state.independentStreak).toBe(0)
    state = advanceTopicMastery(state, independentAnswer('q-3'))
    state = advanceTopicMastery(state, independentAnswer('q-4'))
    state = advanceTopicMastery(state, independentAnswer('q-5'))
    expect(state.level).toBe('stable')
  })

  it('提示后答对：从未掌握提升为提示后掌握，连击归零', () => {
    // spec §掌握状态判定 Scenario 提示后答对：题型层级提升为提示后掌握。
    const next = advanceTopicMastery(UNMASTERED, hintedAnswer('q-1'))
    expect(next.level).toBe('hinted')
    expect(next.independentStreak).toBe(0)
  })

  it('提示后答对打断独立连击，但不回退独立等级（无下行箭头）', () => {
    // design §3 迁移图没有「独立 → 提示后」的下行箭头：用提示答对只归零连击，
    // 已到的独立掌握不被拉回。这与「稳定掌握需独立连击攒满 3」配合——
    // 若这里回退，孩子偶尔用一次提示就丢掉整个题型的独立等级。
    const independent: MasteryState = { level: 'independent', independentStreak: 2 }
    const kept = advanceTopicMastery(independent, hintedAnswer('q-2'))
    expect(kept.level).toBe('independent')
    expect(kept.independentStreak).toBe(0)
  })
})

describe('domain/mastery: 等级只升不降（答错/看答案不抹掉已有成果）', () => {
  it('已独立掌握的题型再答错，等级不跌回未掌握', () => {
    const independent: MasteryState = { level: 'independent', independentStreak: 1 }
    const next = advanceTopicMastery(independent, wrongAnswer('q-9'))
    expect(next.level).toBe('independent')
    expect(next.independentStreak).toBe(0)
  })

  it('已独立掌握再看答案，等级不跌回提示后掌握', () => {
    const independent: MasteryState = { level: 'independent', independentStreak: 1 }
    const next = advanceTopicMastery(independent, revealed('q-9'))
    expect(next.level).toBe('independent')
  })

  it('已稳定的题型再看答案/答错，仍是稳定掌握（最高档不回退）', () => {
    const stable: MasteryState = { level: 'stable', independentStreak: 5 }
    expect(advanceTopicMastery(stable, revealed('q-9')).level).toBe('stable')
    expect(advanceTopicMastery(stable, wrongAnswer('q-9')).level).toBe('stable')
    // 稳定后用提示后答对，等级仍是 stable。
    expect(advanceTopicMastery(stable, hintedAnswer('q-9')).level).toBe('stable')
  })

  it('已稳定的题型再次独立答对仍是 stable，连击继续累加不重复晋升', () => {
    // 覆盖 promote 分支的另一侧：advancesStreak 为真、连击已过门槛，但 level
    // 已是 stable 而非 independent——此时不做（也无须做）二次晋升，只累加连击。
    const stable: MasteryState = { level: 'stable', independentStreak: 3 }
    const next = advanceTopicMastery(stable, independentAnswer('q-9'))
    expect(next.level).toBe('stable')
    expect(next.independentStreak).toBe(4)
  })

  it('看答案后再独立答对可重新晋升（看答案不进独立，但后续答对能）', () => {
    // 从提示后掌握重新累计，说明 reveal 只挡「看答案这次」，不永久封顶。
    let state = advanceQuestionMastery(UNMASTERED, revealed('q-1'))
    expect(state.level).toBe('hinted')
    state = advanceQuestionMastery(state, independentAnswer('q-2'))
    expect(state.level).toBe('independent')
  })

  it('已独立掌握后订正相似题，等级不回退、连击归零', () => {
    // correction 信号目标为提示后掌握，但对已独立的题型只升不降——订正一次
    // 不该抹掉题型已有的独立等级。similarQuestionId 指向的相似题状态由
    // 调用方单独维护，本迁移只动当前这条轨道。
    const independent: MasteryState = { level: 'independent', independentStreak: 2 }
    const next = advanceTopicMastery(independent, correction('q-1'))
    expect(next.level).toBe('independent')
    expect(next.independentStreak).toBe(0)
  })
})

describe('domain/mastery: 迁移表 MASTERY_TRANSITIONS 是纯数据', () => {
  it('涵盖全部 5 种信号，且目标等级合法', () => {
    const signals = ['independent', 'hinted', 'wrong', 'reveal', 'correction']
    for (const signal of signals) {
      expect(MASTERY_TRANSITIONS).toHaveProperty(signal)
      // 目标等级必须是 MASTERY_LEVELS 里的合法档，而非 merely truthy。
      expect(MASTERY_LEVELS).toContain(MASTERY_TRANSITIONS[signal as keyof typeof MASTERY_TRANSITIONS].target)
    }
  })

  it('提示后答对与看答案的目标等级都是提示后掌握', () => {
    expect(MASTERY_TRANSITIONS.hinted.target).toBe('hinted')
    expect(MASTERY_TRANSITIONS.reveal.target).toBe('hinted')
    expect(MASTERY_TRANSITIONS.correction.target).toBe('hinted')
  })

  it('只有首次独立答对推进连击，其余信号归零', () => {
    expect(MASTERY_TRANSITIONS.independent.advancesStreak).toBe(true)
    expect(MASTERY_TRANSITIONS.hinted.advancesStreak).toBe(false)
    expect(MASTERY_TRANSITIONS.wrong.advancesStreak).toBe(false)
    expect(MASTERY_TRANSITIONS.reveal.advancesStreak).toBe(false)
    expect(MASTERY_TRANSITIONS.correction.advancesStreak).toBe(false)
  })

  it('迁移表在运行时被冻结（Object.freeze），改写静默失败/抛错', () => {
    // Readonly<> 只是编译期约束；深冻结让运行时的意外改写也被挡住。
    expect(Object.isFrozen(MASTERY_TRANSITIONS)).toBe(true)
    for (const signal of ['independent', 'hinted', 'wrong', 'reveal', 'correction'] as const) {
      expect(Object.isFrozen(MASTERY_TRANSITIONS[signal])).toBe(true)
    }
    // 在严格模式（ESM 测试）下，向冻结对象赋值会抛 TypeError。
    expect(() => {
      ;(MASTERY_TRANSITIONS as { independent: { target: string } }).independent.target = 'stable'
    }).toThrow()
    // 断言值未被改变。
    expect(MASTERY_TRANSITIONS.independent.target).toBe('independent')
  })
})

describe('domain/mastery: 纯函数契约（不改写入参，返回新对象）', () => {
  it('advanceTopicMastery 不修改传入的旧状态对象', () => {
    const frozen: MasteryState = { level: 'independent', independentStreak: 2 }
    Object.freeze(frozen)
    const next = advanceTopicMastery(frozen, independentAnswer('q-1'))
    expect(frozen).toEqual({ level: 'independent', independentStreak: 2 })
    expect(next).not.toBe(frozen)
    expect(next.level).toBe('stable')
    expect(next.independentStreak).toBe(3)
  })

  it('undefined 入参视为未掌握起步', () => {
    const next = applyMasteryTransition(undefined, 'independent')
    expect(next.level).toBe('independent')
  })

  it('hint-used 事件驱动迁移时原样返回（不迁移），且给出新对象', () => {
    // classifyAnswerSignal 对 hint-used 返回 null；两个 advance 包装器在该分支
    // 下应原样带出当前状态（连击与等级都不动），但仍返回新对象而非共享引用，
    // 以免 Vue 3 watch 因引用未变而漏更新。
    const hint = {
      eventId: 'e-hint',
      profileId: 'p-1',
      occurredAt: 1_700_000_000_000,
      type: 'hint-used',
      sessionId: 's-1',
      questionId: 'q-1',
      level: 1,
    } as AnswerEvent

    const current: MasteryState = { level: 'independent', independentStreak: 2 }
    const q = advanceQuestionMastery(current, hint)
    expect(q).toEqual({ level: 'independent', independentStreak: 2 })
    expect(q).not.toBe(current)
    const t = advanceTopicMastery(current, hint)
    expect(t).toEqual({ level: 'independent', independentStreak: 2 })
    expect(t).not.toBe(current)
  })

  it('hint-used 事件且无既有状态时起步为未掌握', () => {
    const hint = {
      eventId: 'e-hint',
      profileId: 'p-1',
      occurredAt: 1_700_000_000_000,
      type: 'hint-used',
      sessionId: 's-1',
      questionId: 'q-1',
      level: 1,
    } as AnswerEvent
    expect(advanceQuestionMastery(undefined, hint)).toEqual({ level: 'unmastered', independentStreak: 0 })
    expect(advanceTopicMastery(undefined, hint)).toEqual({ level: 'unmastered', independentStreak: 0 })
  })
})
