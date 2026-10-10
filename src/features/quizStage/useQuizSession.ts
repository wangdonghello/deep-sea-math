import { computed, ref } from 'vue'

import { revealHint } from '@/domain/hint/hintChainSelector'
import { createEventId } from '@/domain/eventLog/ids'
import { replayProjections } from '@/domain/eventLog/replay'
import { isCorrect, matchesNumericValue } from '@/domain/quiz/answerJudgement'
import type { AnswerSubmittedEvent, DomainEvent, Question } from '@/domain/model/types'
import { DEMO_QUESTION_POOL } from '@/features/home/fixtures'

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
  store: QuizSessionStore
  clock?: () => number
  idGenerator?: () => string
}

/**
 * Owns answer-flow events; visible progress is rebuilt from the returned event log.
 * Task 8 content replaces the temporary DEMO_QUESTION_POOL fallback.
 */
export function useQuizSession(options: QuizSessionOptions) {
  const rootQuestions = options.questions ?? DEMO_QUESTION_POOL
  const questionPool = options.questions === undefined
    ? DEMO_QUESTION_POOL
    : [...options.questions, ...(options.similarQuestionPool ?? [])]
  const events = ref<readonly DomainEvent[]>([])
  const feedback = ref('')
  const submitting = ref(false)
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
    return ids.flatMap((id) => {
      const question = byId.get(id)
      return question === undefined ? [] : [question]
    })
  })

  const answerEvents = computed(() => events.value.filter(
    (event): event is AnswerSubmittedEvent =>
      event.type === 'answer-submitted' && event.sessionId === options.sessionId,
  ))
  const projections = computed(() => replayProjections(events.value, { profileId: options.profileId }))
  const resolvedIds = computed(() => new Set([
    ...(projections.value.questProgress[options.sessionId]?.correctQuestionIds ?? []),
    ...(projections.value.questProgress[options.sessionId]?.revealedQuestionIds ?? []),
  ]))

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
      if (similar !== undefined && !result.some((entry) => entry.id === similar.id)) result.push(similar)
    }
    return result
  })
  const currentQuestion = computed(() => queue.value.find((question) => !resolvedIds.value.has(question.id)) ?? null)
  const currentPosition = computed(() => {
    const index = queue.value.findIndex((question) => question.id === currentQuestion.value?.id)
    return index < 0 ? queue.value.length : index + 1
  })
  const totalQuestions = computed(() => queue.value.length)
  const usedHintLevel = computed(() => events.value.filter((event) =>
    event.type === 'hint-used' && event.sessionId === options.sessionId &&
    event.questionId === currentQuestion.value?.id,
  ).length)

  async function refreshEvents(): Promise<void> {
    events.value = (await options.store.listEvents(options.profileId))
      .filter((event) => event.profileId === options.profileId)
    const active = currentQuestion.value
    if (active !== null && !questionStartedAt.has(active.id)) questionStartedAt.set(active.id, clock())
  }

  async function append(event: DomainEvent): Promise<void> {
    events.value = (await options.store.appendEvents([event]))
      .filter((stored) => stored.profileId === options.profileId)
  }

  function baseEvent(occurredAt = clock()) {
    return { eventId: idGenerator(), profileId: options.profileId, occurredAt }
  }

  function markNextQuestionStarted(at: number): void {
    const next = currentQuestion.value
    if (next !== null && !questionStartedAt.has(next.id)) questionStartedAt.set(next.id, at)
  }

  async function finishIfComplete(): Promise<void> {
    const queueNow = queue.value
    if (queueNow.length === 0 || queueNow.some((question) => !resolvedIds.value.has(question.id))) return
    const alreadyCompleted = events.value.some((event) =>
      event.type === 'session-completed' && event.sessionId === options.sessionId,
    )
    if (!alreadyCompleted) {
      await append({ ...baseEvent(), type: 'session-completed', sessionId: options.sessionId, rewards: [] })
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

  async function submitAnswer(submitted: string): Promise<void> {
    if (submitting.value) return
    submitting.value = true
    try {
      await refreshEvents()
      const question = currentQuestion.value
      if (question === null) return
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
        return
      }

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
        questionId: question.id,
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
    usedHintLevel, refreshEvents, useHint, submitAnswer, revealAnswer,
  }
}
