import { describe, expect, it } from 'vitest'

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

function setup(questions: Question[], targets: { creatureId?: string; zoneId?: string } = {}) {
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
    clock: () => 1000 + events.length, idGenerator: () => `event-${++id}`,
  })
  return { session, events, store }
}

describe('useQuizSession', () => {
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

  it('看答案写 answer-revealed 及 sessionId，不引入 revealedAnswer 字段', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.revealAnswer()
    const revealed = events.find((event) => event.type === 'answer-revealed')
    expect(revealed).toMatchObject({ type: 'answer-revealed', sessionId: 'session-1', questionId: 'q1' })
    expect(revealed).not.toHaveProperty('revealedAnswer')
  })

  it('数值答案接受等价单位写法并由事件重放得到独立掌握', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.submitAnswer('7个')
    expect(events.find((event) => event.type === 'answer-submitted')).toMatchObject({ correct: true, usedHintLevel: 0 })
    expect(events.find((event) => event.type === 'session-completed'))
      .toMatchObject({
        type: 'session-completed', eventId: 'profile-1:session-1:session-completed',
        rewards: ['quest-complete', 'independent-mastery'],
      })
    expect(replayProjections(events, { profileId: 'profile-1' }).masteryByQuestion.q1?.level).toBe('independent')
  })

  it('只看答案不会完成题组或发奖', async () => {
    const { session, events } = setup([makeQuestion('q1')])
    await session.revealAnswer()
    expect(events.some((event) => event.type === 'session-completed')).toBe(false)
    expect(events.some((event) => event.type === 'unlock-granted')).toBe(false)
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
  })

  it('默认 demo 池无需外注相似题池即可完成订正与相似题练习', async () => {
    const events: DomainEvent[] = [{
      eventId: 'started', profileId: 'profile-1', occurredAt: 1, type: 'session-started',
      sessionId: 'session-1', questionIds: ['demo-basic-1'], difficultyTrace: [1],
    }]
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const session = useQuizSession({ sessionId: 'session-1', profileId: 'profile-1', store })
    await session.submitAnswer('6')
    await session.submitAnswer('7')
    expect(session.currentQuestion.value?.id).not.toBe('demo-basic-1')
    const similarAnswer = String(session.currentQuestion.value?.answer.value)
    await session.submitAnswer(similarAnswer)
    expect(events.some((event) => event.type === 'correction-done')).toBe(true)
  })

  it('重复题目槽位明确合并并暴露 fallback 数量，不按 ID 静默重复推进', async () => {
    const events: DomainEvent[] = [{
      eventId: 'started', profileId: 'profile-1', occurredAt: 1, type: 'session-started',
      sessionId: 'session-1', questionIds: ['demo-basic-1', 'demo-basic-1', 'demo-basic-2'],
      difficultyTrace: [1, 1, 1],
    }]
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const session = useQuizSession({ sessionId: 'session-1', profileId: 'profile-1', store })
    await session.refreshEvents()
    expect(session.totalQuestions.value).toBe(2)
    expect(session.duplicateSlotCount.value).toBe(1)
    expect(session.currentQuestion.value?.id).toBe('demo-basic-1')
  })

  it('五步答案只有答对才完成 answer 步', async () => {
    const source = makeQuestion('applied')
    const applied = createQuestion({ ...source, requiresFiveStep: true, answer: { ...source.answer, expression: '3+4' }, steps: [
      { type: 'known', prompt: '已知' }, { type: 'unknown', prompt: '未知' },
      { type: 'relation', prompt: '关系' }, { type: 'expression', prompt: '算式' },
      { type: 'answer', prompt: '答案' },
    ] })
    const { session } = setup([applied])
    session.completeFiveStep('已知')
    expect(session.fiveStepStates.value.applied?.current).toBe('unknown')
    session.revisitFiveStep('known')
    expect(session.fiveStepStates.value.applied?.current).toBe('known')
    session.resumeFiveStepProgress()
    expect(session.fiveStepStates.value.applied?.current).toBe('unknown')
    session.completeFiveStep('未知')
    session.completeFiveStep('关系')
    expect(session.completeFiveStep('3+5')).toBe(false)
    expect(session.fiveStepStates.value.applied?.current).toBe('expression')
    session.completeFiveStep('3+4')
    await session.submitAnswer('6')
    expect(session.fiveStepStates.value.applied?.completed).not.toContain('answer')
    await session.submitAnswer('7')
    expect(session.fiveStepStates.value.applied?.completed).toContain('answer')
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

  it('基础算式题比较表达式；五步答案只比较数值结果', async () => {
    const expressionSession = setup([makeQuestion('expression', [], { value: 6, expression: '24÷4' })]).session
    await expressionSession.submitAnswer('24/4')
    expect(expressionSession.feedback.value).toContain('太棒了')

    const source = makeQuestion('applied', [], { value: 7, expression: '3+4' })
    const applied = createQuestion({ ...source, requiresFiveStep: true, steps: [
      { type: 'known', prompt: '已知' }, { type: 'unknown', prompt: '未知' },
      { type: 'relation', prompt: '关系' }, { type: 'expression', prompt: '算式' },
      { type: 'answer', prompt: '答案' },
    ] })
    const { session, events } = setup([applied])
    await session.submitAnswer('3+4')
    expect(events.find((event) => event.type === 'answer-submitted')).toMatchObject({ correct: false })
    await session.submitAnswer('7')
    expect(events.filter((event) => event.type === 'answer-submitted').at(-1)).toMatchObject({ correct: true, retryCount: 1 })
  })
})
