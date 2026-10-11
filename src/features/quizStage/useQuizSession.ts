import { computed, ref } from 'vue'

import { MAX_HINT_LAYERS, revealHint, type RevealedHint } from '@/domain/hint/hintChainSelector'
import { createEventId } from '@/domain/eventLog/ids'
import { replayProjections } from '@/domain/eventLog/replay'
import { completeCurrentStep, createFiveStepMachine, resumeProgress, revisitStep } from '@/domain/quiz/fiveStepMachine'
import type { FiveStepState } from '@/domain/quiz/fiveStepMachine'
import { isCorrect, matchesExpression, matchesNumericValue } from '@/domain/quiz/answerJudgement'
import type { AnswerSubmittedEvent, DomainEvent, FiveStep, FiveStepType, Question } from '@/domain/model/types'
import { grantRewards } from '@/domain/reward/rewardGrant'
import { DEMO_QUESTION_POOL } from '@/features/home/fixtures'
import { DEMO_SIMILAR_QUESTIONS, DEMO_SIMILAR_QUESTION_MAPPING } from './demoSimilarQuestions'

/** Minimal event-log capability required by a quiz session. */
export interface QuizSessionStore {
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
  appendEvents(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

/** Dependencies for an event-sourced quiz session. */
export interface QuizSessionOptions {
  sessionId: string
  profileId: string
  /** Main session questions, in the order fixed by session-started. */
  questions?: readonly Question[]
  /** Available linked-question content when `questions` contains only session roots. */
  similarQuestionPool?: readonly Question[]
  /** Optional target metadata consumed by T7's reward rules. */
  creatureId?: string
  zoneId?: string
  store: QuizSessionStore
  clock?: () => number
  idGenerator?: () => string
}

const DEMO_FIVE_STEP_TEMPLATES: readonly FiveStep[] = [
  { type: 'known', prompt: '找出题目里的已知条件' },
  { type: 'unknown', prompt: '找出题目要求的内容' },
  { type: 'relation', prompt: '选择已知与未知的数量关系' },
  { type: 'expression', prompt: '写出算式' },
  { type: 'answer', prompt: '写出计算结果' },
]

/**
 * 答题 composable 的**演示题池缺省值**（未注入 `questions` 时使用）。
 *
 * 答题页的正式路径由 `app/productionStores.ts` 装配 → 路由守卫经
 * `app/questContext.ts` 从题库取题并挂到 `meta.questContext`；本文件只在没有
 * 题库上下文时兜底（组件测试、`.vue` 预览）。相似题链接同理由题库的
 * `similarQuestionIds` 提供，这里只补演示池自己的成对关系。
 */
export function useQuizSession(options: QuizSessionOptions) {
  const isDemoSession = options.questions === undefined
  const rootQuestions = (options.questions ?? DEMO_QUESTION_POOL).map((question) => {
    const linkedIds = isDemoSession ? DEMO_SIMILAR_QUESTION_MAPPING[question.id] : undefined
    return linkedIds === undefined ? question : {
      ...question, similarQuestionIds: [...question.similarQuestionIds, ...linkedIds],
    }
  })
  const questionPool = isDemoSession
    ? [...rootQuestions, ...DEMO_SIMILAR_QUESTIONS]
    : [...rootQuestions, ...(options.similarQuestionPool ?? [])]
  const events = ref<readonly DomainEvent[]>([])
  const feedback = ref('')
  const stepFeedback = ref('')
  const fiveStepStates = ref<Record<string, FiveStepState>>({})
  const submitting = ref(false)
  const practiceQuestionId = ref<string | null>(null)
  const clock = options.clock ?? (() => Date.now())
  const idGenerator = options.idGenerator ?? (() => createEventId())
  const questionStartedAt = new Map<string, number>()

  const sessionStarted = computed(() => events.value.find(
    (event) => event.type === 'session-started' && event.sessionId === options.sessionId &&
      event.profileId === options.profileId,
  ))
  const roots = computed(() => {
    const ids = sessionStarted.value?.type === 'session-started'
      ? sessionStarted.value.questionIds : rootQuestions.map((question) => question.id)
    const byId = new Map(questionPool.map((question) => [question.id, question]))
    return [...new Set(ids)].flatMap((id) => {
      const question = byId.get(id)
      return question === undefined ? [] : [question]
    })
  })
  const duplicateSlotCount = computed(() => {
    const ids = sessionStarted.value?.type === 'session-started'
      ? sessionStarted.value.questionIds : rootQuestions.map((question) => question.id)
    return ids.length - new Set(ids).size
  })

  const answerEvents = computed(() => events.value.filter(
    (event): event is AnswerSubmittedEvent =>
      event.type === 'answer-submitted' && event.sessionId === options.sessionId,
  ))
  const projections = computed(() => replayProjections(events.value, { profileId: options.profileId }))
  // Reveal advances the learning queue only; T7's grantRewards still requires submitted answers.
  const resolvedIds = computed(() => new Set([
    ...(projections.value.questProgress[options.sessionId]?.correctQuestionIds ?? []),
    ...(projections.value.questProgress[options.sessionId]?.revealedQuestionIds ?? []),
  ]))
  const correctlyAnsweredIds = computed(() => new Set(
    projections.value.questProgress[options.sessionId]?.correctQuestionIds ?? [],
  ))

  /** Similar questions are derived from a corrected root answer, never recursively added. */
  const queue = computed(() => {
    const byId = new Map(questionPool.map((question) => [question.id, question]))
    const result: Question[] = []
    for (const question of roots.value) {
      result.push(question)
      const corrected = answerEvents.value.some((event) =>
        event.questionId === question.id && event.correct && event.retryCount > 0,
      )
      const similarId = question.similarQuestionIds.find((id) => byId.has(id))
      const similar = corrected && similarId !== undefined ? byId.get(similarId) : undefined
      const isAnotherRoot = similar !== undefined && roots.value.some((root) => root.id === similar.id)
      if (similar !== undefined && !isAnotherRoot && !result.some((entry) => entry.id === similar.id)) result.push(similar)
    }
    return result
  })
  const currentQuestion = computed(() => {
    const practiceQuestion = queue.value.find((question) => question.id === practiceQuestionId.value)
    if (practiceQuestion !== undefined && !correctlyAnsweredIds.value.has(practiceQuestion.id)) {
      return practiceQuestion
    }
    return queue.value.find((question) => !resolvedIds.value.has(question.id)) ?? null
  })
  const practiceQuestionAvailable = computed(() => queue.value.some(
    (question) => !correctlyAnsweredIds.value.has(question.id),
  ))
  const sessionCompleted = computed(() => events.value.some(
    (event) => event.type === 'session-completed' && event.sessionId === options.sessionId &&
      event.profileId === options.profileId,
  ))
  const fiveStepTemplates = computed(() => currentQuestion.value?.steps ?? DEMO_FIVE_STEP_TEMPLATES)
  const fiveStepState = computed(() => {
    const question = currentQuestion.value
    if (question === null || !question.requiresFiveStep) return null
    return fiveStepStates.value[question.id] ?? createFiveStepMachine(fiveStepTemplates.value)
  })
  const currentPosition = computed(() => {
    const index = queue.value.findIndex((question) => question.id === currentQuestion.value?.id)
    return index < 0 ? queue.value.length : index + 1
  })
  const totalQuestions = computed(() => queue.value.length)
  const usedHintLevel = computed(() => events.value.filter((event) =>
    event.type === 'hint-used' && event.sessionId === options.sessionId &&
    event.questionId === currentQuestion.value?.id,
  ).length)
  const revealedHints = computed((): readonly RevealedHint[] => {
    const question = currentQuestion.value
    return question === null ? [] : Array.from(
      { length: Math.min(usedHintLevel.value, MAX_HINT_LAYERS) }, (_, index) => revealHint(question, index),
    )
  })

  async function refreshEvents(): Promise<void> {
    events.value = (await options.store.listEvents(options.profileId))
      .filter((event) => event.profileId === options.profileId)
    const active = currentQuestion.value
    if (active !== null && !questionStartedAt.has(active.id)) questionStartedAt.set(active.id, clock())
  }

  async function appendMany(incoming: readonly DomainEvent[]): Promise<void> {
    events.value = (await options.store.appendEvents(incoming))
      .filter((stored) => stored.profileId === options.profileId)
  }

  async function append(event: DomainEvent): Promise<void> {
    await appendMany([event])
  }

  function baseEvent(occurredAt = clock()) {
    return { eventId: idGenerator(), profileId: options.profileId, occurredAt }
  }

  function markNextQuestionStarted(at: number): void {
    const next = currentQuestion.value
    if (next !== null && !questionStartedAt.has(next.id)) questionStartedAt.set(next.id, at)
  }

  function continuePractice(): void {
    if (sessionCompleted.value) return
    const next = queue.value.find((question) => !correctlyAnsweredIds.value.has(question.id))
    if (next !== undefined) {
      practiceQuestionId.value = next.id
      if (!questionStartedAt.has(next.id)) questionStartedAt.set(next.id, clock())
    }
  }

  async function finishIfComplete(): Promise<void> {
    const queueNow = queue.value
    if (queueNow.length === 0 || queueNow.some((question) => !resolvedIds.value.has(question.id))) return
    const started = sessionStarted.value
    if (started?.type !== 'session-started') return
    const result = grantRewards({
      profileId: options.profileId, sessionId: options.sessionId, occurredAt: clock(),
      eventId: idGenerator(),
      questionIds: started.questionIds, events: events.value,
      creatureId: options.creatureId, zoneId: options.zoneId,
      unlockEventIdFactory: () => idGenerator(),
    })
    if (result.granted) await appendMany(result.events)
  }

  function completeFiveStep(value: string): boolean {
    const question = currentQuestion.value
    const machine = fiveStepState.value
    if (
      question === null || machine === null || machine.current === 'answer' ||
      machine.completed.includes(machine.current)
    ) return false
    if (machine.current === 'expression' && question.answer.expression !== undefined &&
      !matchesExpression(value, question.answer.expression)) {
      stepFeedback.value = '再看看数量关系，试着列出对应的算式。'
      return false
    }
    fiveStepStates.value = { ...fiveStepStates.value, [question.id]: completeCurrentStep(machine) }
    stepFeedback.value = ''
    return true
  }

  function revisitFiveStep(step: FiveStepType): void {
    const question = currentQuestion.value
    const machine = fiveStepState.value
    if (question !== null && machine !== null) {
      fiveStepStates.value = { ...fiveStepStates.value, [question.id]: revisitStep(machine, step) }
    }
  }

  function resumeFiveStepProgress(): void {
    const question = currentQuestion.value
    const machine = fiveStepState.value
    if (question !== null && machine !== null) {
      fiveStepStates.value = { ...fiveStepStates.value, [question.id]: resumeProgress(machine) }
    }
  }

  async function useHint(): Promise<void> {
    if (submitting.value || currentQuestion.value === null || usedHintLevel.value >= 5) return
    await refreshEvents()
    const question = currentQuestion.value
    if (question === null) return
    const hint = revealHint(question, usedHintLevel.value)
    await append({ ...baseEvent(), type: 'hint-used', sessionId: options.sessionId, questionId: question.id, level: hint.layer })
    feedback.value = hint.text
  }

  async function submitAnswer(submitted: string): Promise<boolean> {
    if (submitting.value) return false
    submitting.value = true
    try {
      await refreshEvents()
      const question = currentQuestion.value
      if (question === null) return false
      const answerStepState = question.requiresFiveStep && fiveStepState.value?.current === 'answer'
        ? fiveStepState.value : null
      const occurredAt = clock()
      const startedAt = questionStartedAt.get(question.id) ?? occurredAt
      const correct = question.requiresFiveStep
        ? matchesNumericValue(submitted, question.answer.value, question.answer.unit)
        : isCorrect(submitted, question.answer)
      const retryCount = answerEvents.value.filter((event) => event.questionId === question.id).length
      const event = {
        ...baseEvent(occurredAt), type: 'answer-submitted' as const, sessionId: options.sessionId,
        questionId: question.id, submitted, correct, usedHintLevel: usedHintLevel.value,
        retryCount, ms: Math.max(0, occurredAt - startedAt),
      }
      await append(event)

      if (!correct) {
        feedback.value = '再想想，可以看看题目里的条件'
        if (usedHintLevel.value < 5) {
          const hint = revealHint(question, usedHintLevel.value)
          await append({
            ...baseEvent(), type: 'hint-used', sessionId: options.sessionId,
            questionId: question.id, level: hint.layer,
          })
        }
        return false
      }

      if (answerStepState !== null) {
        fiveStepStates.value = { ...fiveStepStates.value, [question.id]: completeCurrentStep(answerStepState) }
      }
      practiceQuestionId.value = null
      feedback.value = retryCount > 0 ? '很好，我们再练一道差不多的' : '太棒了，继续下潜！'
      const parent = roots.value.find((candidate) => candidate.similarQuestionIds.includes(question.id))
      if (parent !== undefined && answerEvents.value.some((item) =>
        item.questionId === parent.id && !item.correct,
      )) {
        await append({
          ...baseEvent(), type: 'correction-done', sessionId: options.sessionId,
          questionId: parent.id, similarQuestionId: question.id,
        })
      }
      markNextQuestionStarted(occurredAt)
      await finishIfComplete()
      return true
    } finally {
      submitting.value = false
    }
  }

  async function revealAnswer(): Promise<void> {
    if (submitting.value) return
    submitting.value = true
    try {
      await refreshEvents()
      const question = currentQuestion.value
      if (question === null) return
      const occurredAt = clock()
      await append({
        ...baseEvent(occurredAt), type: 'answer-revealed', sessionId: options.sessionId,
        questionId: question.id, revealedAnswer: true,
      })
      feedback.value = `答案是 ${question.answer.expression ?? `${question.answer.value}${question.answer.unit ?? ''}`}`
      markNextQuestionStarted(occurredAt)
      await finishIfComplete()
    } finally {
      submitting.value = false
    }
  }

  return {
    events: computed(() => events.value), currentQuestion, currentPosition, totalQuestions, feedback, submitting,
    sessionCompleted, practiceQuestionAvailable, continuePractice,
    stepFeedback, fiveStepTemplates, fiveStepState, fiveStepStates: computed(() => fiveStepStates.value),
    duplicateSlotCount, revealedHints, usedHintLevel, refreshEvents, useHint, submitAnswer,
    completeFiveStep, revisitFiveStep, resumeFiveStepProgress, revealAnswer,
  }
}
