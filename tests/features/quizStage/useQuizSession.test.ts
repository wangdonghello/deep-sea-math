import { describe, expect, it, vi } from 'vitest'

import { createQuestion } from '@/domain/model/types'
import type { DomainEvent, Question } from '@/domain/model/types'
import { replayProjections } from '@/domain/eventLog/replay'
import { useQuizSession } from '@/features/quizStage/useQuizSession'

function makeQuestion(
  id: string,
  similarQuestionIds: string[] = [],
  answer: Question['answer'] = { value: 7, unit: '个' },
): Question {
  return createQuestion({
    id, type: 'add-sub', difficulty: 1, category: 'basic',
    story: { title: id, body: '3 加 4 是多少？' }, hints: ['1', '2', '3', '4', '5'],
    answer, similarQuestionIds, tags: [], sources: ['test'],
  })
}

function setup(
  questions: Question[],
  targets: { creatureId?: string; zoneId?: string } = {},
  useDefaultIdGenerator = false,
) {
  const similarIds = new Set(questions.flatMap((question) => question.similarQuestionIds))
  const roots = questions.filter((question) => !similarIds.has(question.id))
  const events: DomainEvent[] = [{
    eventId: 'session-started', profileId: 'profile-1', occurredAt: 1, type: 'session-started',
    sessionId: 'session-1', questionIds: roots.map((question) => question.id),
    difficultyTrace: [1],
  }]
  let id = 0
  const store = {
    async listEvents() { return [...events] },
    async appendEvents(incoming: readonly DomainEvent[]) {
      events.push(...incoming)
      return [...events]
    },
  }
  const session = useQuizSession({
    sessionId: 'session-1', profileId: 'profile-1', questions: roots,
    similarQuestionPool: questions.filter((question) => !roots.includes(question)), store,
    ...targets,
    clock: () => 1000 + events.length,
    ...(useDefaultIdGenerator ? {} : { idGenerator: () => `event-${++id}` }),
  })
  return { session, events, store }
}

function setupPractice(questions: Question[], seed: DomainEvent[] = []) {
  const events: DomainEvent[] = [...seed]
  let id = 0
  const store = {
    async listEvents() { return [...events] },
    async appendEvents(incoming: readonly DomainEvent[]) {
      events.push(...incoming)
      return [...events]
    },
  }
  const session = useQuizSession({
    sessionId: 'practice-q1', profileId: 'profile-1', questions,
    store, clock: () => 1000 + events.length, idGenerator: () => `practice-event-${++id}`,
  })
  return { session, events }
}

describe('useQuizSession', () => {
  it('深海题组完成后给出第 N 关与进入新区提示', async () => {
    const events: DomainEvent[] = [
      { eventId: 'start', profileId: 'profile-1', occurredAt: 1, type: 'session-started', sessionId: 'session-1', questionIds: ['q1'], difficultyTrace: [1] },
      { eventId: 'prior', profileId: 'profile-1', occurredAt: 2, type: 'session-completed', sessionId: 'old', rewards: [] },
    ]
    let id = 0
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const session = useQuizSession({
      sessionId: 'session-1', profileId: 'profile-1', questions: [makeQuestion('q1')],
      themeId: 'deep-sea', store, clock: () => 1000 + events.length, idGenerator: () => `e-${++id}`,
    })
    await session.submitAnswer('7')
    expect(session.stageCompletion.value).toEqual({ stage: 2, zoneName: null })
  })

  it('错题练习答对后给出错题星并在整组完成时标记完成', async () => {
    const { session } = setupPractice([makeQuestion('q1')])
    await session.submitAnswer('7')
    expect(session.isPracticeSession.value).toBe(true)
    expect(session.practiceStars.value).toBe(1)
    expect(session.practiceCompleted.value).toBe(true)
    expect(session.practiceFixedQuestionIds.value).toEqual([])
  })

  it('自定义错题的作答也会更新题型掌握度', async () => {
    const question = makeQuestion('custom-q1')
    const { session, events } = setupPractice([question])
    await session.submitAnswer('7')
    const projections = replayProjections(events, {
      profileId: 'profile-1',
      questionTypeById: { 'custom-q1': 'add-sub' },
    })
    expect(projections.masteryByTopic['add-sub']).toBeDefined()
    expect(projections.masteryByQuestion['custom-q1']).toBeDefined()
  })

  it('同一道题累计两次独立答对后计入本次修复', async () => {
    const seed: DomainEvent[] = [{
      eventId: 'old-practice', profileId: 'profile-1', occurredAt: 1, type: 'answer-submitted',
      sessionId: 'practice-q1-old', questionId: 'q1', submitted: '7', correct: true,
      usedHintLevel: 0, retryCount: 0, ms: 10,
    }]
    const { session } = setupPractice([makeQuestion('q1')], seed)
    await session.submitAnswer('7')
    expect(session.practiceStars.value).toBe(1)
    expect(session.practiceFixedQuestionIds.value).toEqual(['q1'])
  })

  it('每次提交都追加 answer-submitted，答错保持正向反馈', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.submitAnswer('6')
    expect(events.find((event) => event.type === 'answer-submitted'))
      .toMatchObject({ type: 'answer-submitted', correct: false, retryCount: 0 })
    expect(session.feedback.value).toContain('再想想')
    expect(session.feedback.value.toLowerCase()).not.toContain('red')
    expect(session.feedback.value).not.toContain('失败')
  })

  it('提示事件记录层级，正确订正后插入首个可用相似题并在相似题答对后记录订正', async () => {
    const { session, events } = setup([makeQuestion('q1', ['missing', 'similar']), makeQuestion('similar', ['another'])])
    await session.submitAnswer('6')
    await session.useHint()
    expect(session.revealedHints.value[0]).toMatchObject({ layer: 1, text: '1' })
    expect(events.at(-1)).toMatchObject({ type: 'hint-used', level: 2 })
    await session.useHint()
    expect(events.at(-1)).toMatchObject({ type: 'hint-used', level: 3 })
    await session.submitAnswer('7')
    expect(events.at(-1)).toMatchObject({
      type: 'answer-submitted', correct: true, retryCount: 1, usedHintLevel: 3,
    })
    expect(session.currentQuestion.value?.id).toBe('similar')
    await session.submitAnswer('5')
    expect(session.currentQuestion.value?.id).toBe('similar')
    expect(session.totalQuestions.value).toBe(2)
    await session.submitAnswer('7')
    expect(events.some((event) => event.type === 'correction-done' && event.questionId === 'q1'))
      .toBe(true)
  })

  it('答对后按住当前题（phase=correct），nextQuestion 才前进', async () => {
    const { session } = setup([makeQuestion('q1'), makeQuestion('q2')])
    await session.submitAnswer('7')
    // 答对不自动前进：界面仍显示 q1，队列指针已移到 q2
    expect(session.phase.value).toBe('correct')
    expect(session.displayedQuestion.value?.id).toBe('q1')
    expect(session.currentQuestion.value?.id).toBe('q2')
    session.nextQuestion()
    expect(session.phase.value).toBe('answering')
    expect(session.displayedQuestion.value?.id).toBe('q2')
  })

  it('答错进入 wrong 阶段并保持当前题，且自动展开第一层提示', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.submitAnswer('6')
    expect(session.phase.value).toBe('wrong')
    expect(session.displayedQuestion.value?.id).toBe('q1')
    expect(events.filter((event) => event.type === 'hint-used')).toHaveLength(1)
  })

  it('看答案进入 revealed 阶段并展开释义', async () => {
    const { session } = setup([makeQuestion('q1')])
    await session.revealAnswer()
    expect(session.phase.value).toBe('revealed')
    expect(session.explanationVisible.value).toBe(true)
  })

  it('showExplanation 只展开释义、不写 answer-revealed', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.submitAnswer('7') // 答对
    const before = events.length
    session.showExplanation()
    expect(session.explanationVisible.value).toBe(true)
    expect(events.length).toBe(before)
    expect(events.some((event) => event.type === 'answer-revealed')).toBe(false)
  })

  it('看答案写 answer-revealed、sessionId 与 revealedAnswer=true', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.revealAnswer()
    const revealed = events.find((event) => event.type === 'answer-revealed')
    expect(revealed).toMatchObject({
      type: 'answer-revealed', sessionId: 'session-1', questionId: 'q1', revealedAnswer: true,
    })
  })

  it('数值答案接受等价单位写法并由事件重放得到独立掌握', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.submitAnswer('7个')
    expect(events.find((event) => event.type === 'answer-submitted')).toMatchObject({ correct: true, usedHintLevel: 0 })
    expect(events.find((event) => event.type === 'session-completed'))
      .toMatchObject({
        type: 'session-completed', eventId: 'event-2',
        rewards: ['quest-complete', 'independent-mastery'],
      })
    expect(replayProjections(events, { profileId: 'profile-1' }).masteryByQuestion.q1?.level).toBe('independent')
  })

  it('默认 session-completed eventId 使用 Web Crypto UUID', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('123e4567-e89b-42d3-a456-426614174001')
      .mockReturnValueOnce('123e4567-e89b-42d3-a456-426614174002')
    vi.stubGlobal('crypto', { randomUUID })
    try {
      const { session, events } = setup([makeQuestion('q1')], {}, true)
      await session.submitAnswer('7')
      expect(events.find((event) => event.type === 'session-completed')?.eventId)
        .toBe('123e4567-e89b-42d3-a456-426614174002')
      expect(randomUUID).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('只看答案不会完成题组或发奖', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.revealAnswer()
    expect(events.some((event) => event.type === 'session-completed')).toBe(false)
    expect(events.some((event) => event.type === 'unlock-granted')).toBe(false)
  })

  it('看完题后可继续订正；每题提交答案后 T7 才完成题组', async () => {
    const { session, events } = setup([makeQuestion('q1'), makeQuestion('q2')])
    await session.revealAnswer()
    await session.revealAnswer()
    expect(session.currentQuestion.value).toBeNull()
    expect(session.sessionCompleted.value).toBe(false)
    expect(events.some((event) => event.type === 'session-completed')).toBe(false)

    session.continuePractice()
    expect(session.currentQuestion.value?.id).toBe('q1')
    await session.submitAnswer('6')
    expect(session.currentQuestion.value?.id).toBe('q1')
    await session.submitAnswer('7')
    session.continuePractice()
    expect(session.currentQuestion.value?.id).toBe('q2')
    await session.submitAnswer('7')
    expect(events.some((event) => event.type === 'session-completed')).toBe(true)
    expect(session.sessionCompleted.value).toBe(true)
  })

  it('完成后的重放不会重复发奖', async () => {
    const { session, events, store } = setup([makeQuestion('q1')])
    await session.submitAnswer('7')
    const resumed = useQuizSession({
      sessionId: 'session-1', profileId: 'profile-1', questions: [makeQuestion('q1')], store,
    })
    await resumed.refreshEvents()
    expect(events.filter((event) => event.type === 'session-completed')).toHaveLength(1)
  })

  it('向 T7 透传可选的图鉴与区域目标并追加其奖励事件', async () => {
    const { session, events } = setup([makeQuestion('q1')], { creatureId: 'lanternfish', zoneId: 'zone-2' })
    await session.submitAnswer('7')
    expect(events.filter((event) => event.type === 'unlock-granted')).toMatchObject([
      { kind: 'creature', targetId: 'lanternfish' }, { kind: 'zone', targetId: 'zone-2' },
    ])
    expect(events.filter((event) => event.type === 'unlock-granted').map((event) => event.eventId))
      .toEqual(['event-3', 'event-4'])
  })

  it('显式注入题组与相似题池即可完成订正与相似题练习', async () => {
    const root = makeQuestion('root-1', ['similar-1'], { value: 7, unit: '个' })
    const similar = makeQuestion('similar-1', [], { value: 9, unit: '个' })
    const { session, events } = setup([root, similar])

    await session.submitAnswer('6')
    await session.submitAnswer('7')
    expect(session.currentQuestion.value?.id).toBe('similar-1')
    await session.submitAnswer('9')
    expect(events.some((event) => event.type === 'correction-done')).toBe(true)
  })

  it('重复题目槽位明确合并并暴露 fallback 数量，不按 ID 静默重复推进', async () => {
    const first = makeQuestion('dup-1')
    const second = makeQuestion('dup-2')
    const events: DomainEvent[] = [{
      eventId: 'started', profileId: 'profile-1', occurredAt: 1, type: 'session-started',
      sessionId: 'session-1', questionIds: ['dup-1', 'dup-1', 'dup-2'],
      difficultyTrace: [1, 1, 1],
    }]
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const session = useQuizSession({
      sessionId: 'session-1', profileId: 'profile-1', questions: [first, second], store,
    })
    await session.refreshEvents()
    expect(session.totalQuestions.value).toBe(2)
    expect(session.duplicateSlotCount.value).toBe(1)
    expect(session.currentQuestion.value?.id).toBe('dup-1')
  })

  it('提交进行中时忽略重复提交', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await Promise.all([session.submitAnswer('7'), session.submitAnswer('7')])
    expect(events.filter((event) => event.type === 'answer-submitted')).toHaveLength(1)
  })

  it('重新创建会话时从事件重放恢复到首个未完成题', async () => {
    const questions = [makeQuestion('q1'), makeQuestion('q2')]
    const { session, store } = setup(questions)
    await session.submitAnswer('7')
    const resumed = useQuizSession({
      sessionId: 'session-1', profileId: 'profile-1', questions, store,
    })
    await resumed.refreshEvents()
    expect(resumed.currentQuestion.value?.id).toBe('q2')
  })

  it('统一判定口径：算式题与数值题各自按声明形态判等', async () => {
    const expressionSession = setup([makeQuestion('expression', [], { value: 6, expression: '24÷4' })]).session
    await expressionSession.submitAnswer('24/4')
    expect(expressionSession.feedback.value).toContain('太棒了')

    // 应用题不再走「答案步只比较数值结果」：无论基础题还是应用题，声明了算式
    // 就按算式判等、声明了数值就按数值（含单位）判等（见 RETRO R27）。
    const source = makeQuestion('applied', [], { value: 7, expression: '3+4' })
    const applied = createQuestion({ ...source, requiresFiveStep: true, steps: [
      { type: 'known', prompt: '已知' }, { type: 'unknown', prompt: '未知' },
      { type: 'relation', prompt: '关系' }, { type: 'expression', prompt: '算式' },
      { type: 'answer', prompt: '答案' },
    ] })
    const { session, events } = setup([applied])
    await session.submitAnswer('7')
    expect(events.find((event) => event.type === 'answer-submitted')).toMatchObject({ correct: false })
    await session.submitAnswer('3+4')
    expect(events.filter((event) => event.type === 'answer-submitted').at(-1)).toMatchObject({ correct: true, retryCount: 1 })
  })
})
