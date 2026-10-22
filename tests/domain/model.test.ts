import { describe, expect, it } from 'vitest'

import {
  EVENT_TYPES,
  FIVE_STEP_TYPES,
  QUEST_CATEGORIES,
  QUIZ_TYPES,
  createQuestion,
  type AnswerEvent,
  type DomainEvent,
  type FiveStepType,
  type QuestCategory,
  type QuizType,
  type QuestionInput,
} from '../../src/domain/model/types'

/**
 * `QuizType` 编译期穷尽检查。
 *
 * 上面的对象字面量以 `satisfies Record<QuizType, true>` 约束：若 union
 * 增删成员而这里没有同步，`tsc` 直接报错。这样「六个取值齐全」既是运行时
 * 断言、也是编译期约束，不依赖后人自觉。
 */
const ALL_QUIZ_TYPES = {
  'add-sub': true,
  'mul-div': true,
  'two-step-app': true,
  'unknown-relation': true,
  'unit-time-route': true,
  'pattern-data': true,
} as const satisfies Record<QuizType, true>

/**
 * `FiveStepType` 编译期穷尽检查，与 {@link ALL_QUIZ_TYPES} 同一手法。
 *
 * 它锁的是 M6 修的那个约定：步骤类型由 `as const` 数组推导 union，而不是
 * 手写字面量 union。这份字面量若与 union 脱节，`tsc` 立刻报错——否则有人
 * 把 `FiveStepType` 改回手写 union 时，运行时真源与类型会静默漂移。
 */
const ALL_FIVE_STEP_TYPES = {
  known: true,
  unknown: true,
  relation: true,
  expression: true,
  answer: true,
} as const satisfies Record<FiveStepType, true>

/** 构造一道合法题目的最小输入（省略了两个带默认值的字段）。 */
function buildQuestionInput(): QuestionInput {
  return {
    id: 'q-0001',
    type: 'add-sub',
    difficulty: 1,
    category: 'basic',
    story: { title: '修补潜水艇', body: '潜水艇还需要 6 颗能量豆。' },
    hints: ['先把题目读一遍', '谁是已知，谁是未知？', '它们是什么关系？', '试试列出算式', '看看这样的例子'],
    answer: { value: 6, unit: '颗' },
    tags: ['add-sub', 'difficulty-1'],
    sources: ['https://example.com/curriculum/add-sub'],
  }
}

describe('domain/model: 事件 union', () => {
  it('覆盖 design §2 事件表的基础九类事件', () => {
    // 只断言 spec/design 已明确的九类必须存在，不断言总数——
    // 总数会随 spec 新增要求（如 difficultyFallback）增长，
    // 把总数写死会让后续 task 的正确改动先撞一条无关的失败。
    const required = [
      'profile-created',
      'session-started',
      'answer-submitted',
      'hint-used',
      'answer-revealed',
      'correction-done',
      'session-completed',
      'unlock-granted',
      'settings-updated',
    ] as const

    for (const type of required) {
      expect(EVENT_TYPES).toContain(type)
    }
    // 去重仍然要守：这是真不变量，与事件数量无关。
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length)
  })

  it('事件表不含任何撤销/回退类事件（答错绝不回退已解锁内容）', () => {
    // design §3：所有解锁事件为追加型。这里把这条规则钉在运行时表上，
    // 后来人想加一个 revoke 事件必须先看到这行断言失败。
    const revoking = EVENT_TYPES.filter((type) => type.includes('revoke') || type.includes('delete'))
    expect(revoking).toEqual([])
  })

  it('答题流程事件的四个类型都存在于事件表中', () => {
    // AnswerEvent 的四个成员必须都在 EVENT_TYPES 里，否则 Task 5 的状态机
    // 会收到日志层根本不认识的事件类型。
    const answerTypes: AnswerEvent['type'][] = [
      'answer-submitted',
      'hint-used',
      'answer-revealed',
      'correction-done',
    ]

    for (const type of answerTypes) {
      expect(EVENT_TYPES).toContain(type)
    }
  })

  it('DomainEvent 覆盖 EVENT_TYPES 全部取值', () => {
    // 编译期保证：DomainEvent 的判别属性集合必须与 EVENT_TYPES 完全一致。
    const exhaustive: Record<DomainEvent['type'], true> = {
      'profile-created': true,
      'profile-preferences-updated': true,
      'session-started': true,
      'answer-submitted': true,
      'hint-used': true,
      'answer-revealed': true,
      'correction-done': true,
      'session-completed': true,
      'unlock-granted': true,
      'settings-updated': true,
      // Task 4 登记的回落事件：这里与 EVENT_TYPES 同步增长，漏加则编译期
      // 就报错（Record 要求穷尽），不会等到重放层静默丢事件。
      'difficulty-fallback': true,
    }

    expect(Object.keys(exhaustive).sort()).toEqual([...EVENT_TYPES].sort())
  })

  it('四类答题流程事件都带 sessionId（Task 6 复合去重键的前置条件）', () => {
    // 这四行字面量同时是**编译期锁定**：任一事件少了 sessionId，
    // 赋给 AnswerEvent[] 时直接 TS2741，不会等到 Task 6 才发现键凑不齐。
    const answerEvents: AnswerEvent[] = [
      {
        eventId: 'e-1',
        profileId: 'p-1',
        occurredAt: 0,
        type: 'answer-submitted',
        sessionId: 's-1',
        questionId: 'q-1',
        submitted: '6',
        correct: true,
        usedHintLevel: 0,
        retryCount: 0,
        ms: 1200,
      },
      { eventId: 'e-2', profileId: 'p-1', occurredAt: 1, type: 'hint-used', sessionId: 's-1', questionId: 'q-1', level: 1 },
      { eventId: 'e-3', profileId: 'p-1', occurredAt: 2, type: 'answer-revealed', sessionId: 's-1', questionId: 'q-1', revealedAnswer: true },
      {
        eventId: 'e-4',
        profileId: 'p-1',
        occurredAt: 3,
        type: 'correction-done',
        sessionId: 's-1',
        questionId: 'q-1',
        similarQuestionId: 'q-2',
      },
    ]

    expect(answerEvents).toHaveLength(4)
    for (const event of answerEvents) {
      expect(event.sessionId).toBe('s-1')
    }
  })
})

describe('domain/model: QuizType', () => {
  it('覆盖规格要求的六类题型', () => {
    expect(QUIZ_TYPES).toHaveLength(6)
    expect(QUIZ_TYPES).toEqual(Object.keys(ALL_QUIZ_TYPES))
  })

  it('六个取值互不重复', () => {
    expect(new Set(QUIZ_TYPES).size).toBe(6)
  })
})

describe('domain/model: FiveStepType', () => {
  it('由 as const 数组推导，五个步骤齐全且互不重复', () => {
    expect(FIVE_STEP_TYPES).toEqual(Object.keys(ALL_FIVE_STEP_TYPES))
    expect(new Set(FIVE_STEP_TYPES).size).toBe(5)
  })

  it('顺序就是 design §3 的迁移链', () => {
    expect([...FIVE_STEP_TYPES]).toEqual(['known', 'unknown', 'relation', 'expression', 'answer'])
  })

  it('五步链与数学题型两个维度取值不重叠', () => {
    // FiveStepType 描述引导步序，QuizType 描述数学题型；两者共用字符串会让
    // "该给哪类题排五步"无法只凭 type 判断。
    const overlap = FIVE_STEP_TYPES.filter((step) => (QUIZ_TYPES as readonly string[]).includes(step))
    expect(overlap).toEqual([])
  })
})

describe('domain/model: 题组槽位与题型的正交性', () => {
  it('三个槽位齐全且互不重复', () => {
    expect(QUEST_CATEGORIES).toEqual(['basic', 'applied', 'probe'])
    expect(new Set(QUEST_CATEGORIES).size).toBe(3)
  })

  it('槽位与数学题型是两个维度，取值不重叠', () => {
    // 「探测题」是槽位概念，不是六类题型之一；两个维度共享同一批字符串
    // 会让组题时无法判断该按哪一维切池。
    const overlap = QUEST_CATEGORIES.filter((category) =>
      (QUIZ_TYPES as readonly string[]).includes(category),
    )

    expect(overlap).toEqual([])
  })

  it('编译期穷尽：QuestCategory 的每个取值都有对应行', () => {
    const exhaustive: Record<QuestCategory, string> = {
      basic: '基础题（直答，不强制五步）',
      applied: '应用题（走五步）',
      probe: '探测题（走五步）',
    }

    expect(Object.keys(exhaustive)).toEqual([...QUEST_CATEGORIES])
  })
})

describe('domain/model: createQuestion', () => {
  it('requiresFiveStep 缺省为 false', () => {
    const question = createQuestion(buildQuestionInput())
    expect(question.requiresFiveStep).toBe(false)
  })

  it('similarQuestionIds 缺省为空数组', () => {
    const question = createQuestion(buildQuestionInput())
    expect(question.similarQuestionIds).toEqual([])
  })

  it('显式传入时保留调用方取值', () => {
    const question = createQuestion({
      ...buildQuestionInput(),
      requiresFiveStep: true,
      similarQuestionIds: ['q-0002', 'q-0003'],
    })
    expect(question.requiresFiveStep).toBe(true)
    expect(question.similarQuestionIds).toEqual(['q-0002', 'q-0003'])
  })

  it('必填字段原样透传，不改变答案结构', () => {
    const input = buildQuestionInput()
    const question = createQuestion(input)

    expect(question.id).toBe('q-0001')
    expect(question.type).toBe('add-sub')
    expect(question.difficulty).toBe(1)
    expect(question.story).toEqual(input.story)
    expect(question.hints).toEqual(input.hints)
    expect(question.answer).toEqual(input.answer)
    expect(question.tags).toEqual(input.tags)
    expect(question.sources).toEqual(input.sources)
  })

  it('category 原样保留，且取自三个合法槽位', () => {
    const question = createQuestion(buildQuestionInput())

    expect(question.category).toBe('basic')
    expect(QUEST_CATEGORIES).toContain(question.category)

    // 三个槽位都要能落进产物：组题按这三个池子切题，漏一个就会少一类题。
    const all = QUEST_CATEGORIES.map((category) =>
      createQuestion({ ...buildQuestionInput(), id: `q-${category}`, category }).category,
    )

    expect(all).toEqual(['basic', 'applied', 'probe'])
  })

  it('为每个字段返回独立的副本（不共享调用方数组引用）', () => {
    const input = buildQuestionInput()
    const similar = ['q-0002']
    const question = createQuestion({ ...input, similarQuestionIds: similar })

    // 透传的数组不能被复用引用：调用方后续改 similar 不该影响已建好的题目。
    expect(question.similarQuestionIds).not.toBe(similar)

    // 默认值也必须是新数组：两个题目不能共享同一个 [] 实例。
    const another = createQuestion(buildQuestionInput())
    expect(question.similarQuestionIds).not.toBe(another.similarQuestionIds)
  })

  it('id 为空时抛错（不允许产出悬空外键的题目）', () => {
    expect(() => createQuestion({ ...buildQuestionInput(), id: '   ' })).toThrow(/id/)
  })
})
