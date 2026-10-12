import { computed, ref } from 'vue'

import { MAX_HINT_LAYERS, revealHint, type RevealedHint } from '@/domain/hint/hintChainSelector'
import { createEventId } from '@/domain/eventLog/ids'
import { replayProjections } from '@/domain/eventLog/replay'
import { completeCurrentStep, createFiveStepMachine, resumeProgress, revisitStep } from '@/domain/quiz/fiveStepMachine'
import type { FiveStepState } from '@/domain/quiz/fiveStepMachine'
import { isCorrect, matchesExpression, matchesNumericValue } from '@/domain/quiz/answerJudgement'
import type { AnswerSubmittedEvent, DomainEvent, FiveStep, FiveStepType, Question } from '@/domain/model/types'
import { grantRewards } from '@/domain/reward/rewardGrant'

/**
 * 作答阶段——驱动答题页底部动作区显示哪两个按钮。
 *
 * - `answering`：未作答，显示「提交答案 / 我需要提示」
 * - `correct`：答对后暂停在当前题，显示「下一题 / 看答案详解」
 * - `wrong`：答错后显示「提交答案（订正）/ 看答案」
 * - `revealed`：看过答案后显示「下一题」
 *
 * 阶段只描述界面状态，不落事件：真正的作答事实仍由 `answer-submitted` /
 * `answer-revealed` / `hint-used` 事件承载。
 */
export type AnswerPhase = 'answering' | 'correct' | 'wrong' | 'revealed'

/** Minimal event-log capability required by a quiz session. */
export interface QuizSessionStore {
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
  appendEvents(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

/** Dependencies for an event-sourced quiz session. */
export interface QuizSessionOptions {
  sessionId: string
  profileId: string
  /**
   * 本题组的题目（顺序与 `session-started.questionIds` 一致，**必填**）。
   *
   * 必填是刻意的：早先它缺省到演示 fixture 时，首页用演示池组题、答题页按正式
   * 题库查题，两端内容不一致，孩子看到的是“点开始下潜没有任何反应”。让调用方
   * 必须显式给题，错配在编译期就暴露。
   */
  questions: readonly Question[]
  /** 相似题池：本组题目 `similarQuestionIds` 引到的题。 */
  similarQuestionPool?: readonly Question[]
  /** Optional target metadata consumed by T7's reward rules. */
  creatureId?: string
  zoneId?: string
  store: QuizSessionStore
  clock?: () => number
  idGenerator?: () => string
}

/**
 * 五步引导模板的兜底。
 *
 * 只在题目自己没带 `steps` 时使用（正式题库的五步题都必须带 `steps`，由内容
 * 校验保证）。它不是“演示内容”，是模板缺省，因此不属于上面要消除的那类
 * 「两端内容不一致」的隐患。
 */
const DEFAULT_FIVE_STEP_TEMPLATES: readonly FiveStep[] = [
  { type: 'known', prompt: '找出题目里的已知条件' },
  { type: 'unknown', prompt: '找出题目要求的内容' },
  { type: 'relation', prompt: '选择已知与未知的数量关系' },
  { type: 'expression', prompt: '写出算式' },
  { type: 'answer', prompt: '写出计算结果' },
]

export function useQuizSession(options: QuizSessionOptions) {
  const rootQuestions = options.questions
  const questionPool = [...rootQuestions, ...(options.similarQuestionPool ?? [])]
  const events = ref<readonly DomainEvent[]>([])
  const feedback = ref('')
  const stepFeedback = ref('')
  const fiveStepStates = ref<Record<string, FiveStepState>>({})
  const submitting = ref(false)
  const practiceQuestionId = ref<string | null>(null)
  /**
   * 当前作答阶段（见 {@link AnswerPhase}）。
   *
   * 关键变化：答对后**不再自动前进**——`currentQuestion` 由 `resolvedIds`
   * 派生，答对即会移到下一道未解题，因此这里额外用 `heldQuestionId` 把
   * 界面上「正在显示的那道题」按住（见 {@link displayedQuestion}）。
   */
  const phase = ref<AnswerPhase>('answering')
  /** 界面按住不动的题 id；`null` 时界面跟随 `currentQuestion`。 */
  const heldQuestionId = ref<string | null>(null)
  /** 释义面板是否展开（答对看详解 / 答错看答案后为真）。 */
  const explanationVisible = ref(false)
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
  /**
   * 界面上「正在显示的那道题」。
   *
   * 与 `currentQuestion` 的区别：`currentQuestion` 由 `resolvedIds` 派生，答对
   * 或看过答案后会**立即**移到下一题；而本 computed 在 `heldQuestionId` 非空时
   * 按住那一题不放，让界面停在原题等待孩子点「下一题」。所有面向 UI 的读数
   * （进度、提示、五步状态）都以它为准；`submitAnswer` / `revealAnswer` 等
   * 写事件的动作仍走 `currentQuestion`，保持事件流「答对即推进队列」的语义。
   */
  const displayedQuestion = computed(() => {
    if (heldQuestionId.value !== null) {
      const held = queue.value.find((question) => question.id === heldQuestionId.value)
      if (held !== undefined) return held
    }
    return currentQuestion.value
  })
  const practiceQuestionAvailable = computed(() => queue.value.some(
    (question) => !correctlyAnsweredIds.value.has(question.id),
  ))
  const sessionCompleted = computed(() => events.value.some(
    (event) => event.type === 'session-completed' && event.sessionId === options.sessionId &&
      event.profileId === options.profileId,
  ))
  const fiveStepTemplates = computed(() => displayedQuestion.value?.steps ?? DEFAULT_FIVE_STEP_TEMPLATES)
  const fiveStepState = computed(() => {
    const question = displayedQuestion.value
    if (question === null || !question.requiresFiveStep) return null
    return fiveStepStates.value[question.id] ?? createFiveStepMachine(fiveStepTemplates.value)
  })
  const currentPosition = computed(() => {
    const index = queue.value.findIndex((question) => question.id === displayedQuestion.value?.id)
    return index < 0 ? queue.value.length : index + 1
  })
  const totalQuestions = computed(() => queue.value.length)
  const usedHintLevel = computed(() => events.value.filter((event) =>
    event.type === 'hint-used' && event.sessionId === options.sessionId &&
    event.questionId === displayedQuestion.value?.id,
  ).length)
  const revealedHints = computed((): readonly RevealedHint[] => {
    const question = displayedQuestion.value
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
      phase.value = 'answering'
      heldQuestionId.value = null
      explanationVisible.value = false
      if (!questionStartedAt.has(next.id)) questionStartedAt.set(next.id, clock())
    }
  }

  /**
   * 站起来走到下一题：清掉「按住」与作答阶段，回到 `answering`。
   *
   * 因为 `currentQuestion` 在答对/看答案后已经自行推进，这里只需松开按住；
   * 界面随之回落到 `currentQuestion` 指向的下一道未解题。
   */
  function nextQuestion(): void {
    heldQuestionId.value = null
    phase.value = 'answering'
    explanationVisible.value = false
    feedback.value = ''
  }

  /**
   * 只展开释义面板，**不写任何事件**。
   *
   * 供「答对后看答案详解」使用：孩子已经答对，展示讲解不应把这道题标记成
   * 「看过答案」，否则会污染掌握度判定（`answer-revealed` 会把它降为提示后
   * 掌握）。答错后看答案走 {@link revealAnswer}，那条路径才写事件。
   */
  function showExplanation(): void {
    explanationVisible.value = true
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
      explanationVisible.value = false
      heldQuestionId.value = question.id

      if (!correct) {
        phase.value = 'wrong'
        feedback.value = '再想想，可以看看题目里的条件'
        if (usedHintLevel.value < 5) {
          // 规格 `daily-math-quest` §答题流程与判定 要求「答错时展开提示链第一层」，
          // 因此这里仍自动写一条 `hint-used`。但按真机验收的用户要求，答错态底部
          // 动作区只留「提交答案 / 看答案」两个按钮，`我需要提示` 按钮在答错态
          // 不显示（提示已在下方展开，无需重复入口）。这条张力在此显式留痕。
          const hint = revealHint(question, usedHintLevel.value)
          await append({
            ...baseEvent(), type: 'hint-used', sessionId: options.sessionId,
            questionId: question.id, level: hint.layer,
          })
        }
        return false
      }

      phase.value = 'correct'
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
      heldQuestionId.value = question.id
      phase.value = 'revealed'
      explanationVisible.value = true
      markNextQuestionStarted(occurredAt)
      await finishIfComplete()
    } finally {
      submitting.value = false
    }
  }

  return {
    events: computed(() => events.value), currentQuestion, displayedQuestion,
    currentPosition, totalQuestions, feedback, submitting,
    phase: computed(() => phase.value), explanationVisible: computed(() => explanationVisible.value),
    sessionCompleted, practiceQuestionAvailable, continuePractice, nextQuestion, showExplanation,
    stepFeedback, fiveStepTemplates, fiveStepState, fiveStepStates: computed(() => fiveStepStates.value),
    duplicateSlotCount, revealedHints, usedHintLevel, refreshEvents, useHint, submitAnswer,
    completeFiveStep, revisitFiveStep, resumeFiveStepProgress, revealAnswer,
  }
}
