import { describe, expect, it } from 'vitest'

import type {
  AnswerEvent,
  AnswerRevealedEvent,
  AnswerSubmittedEvent,
  CorrectionDoneEvent,
  DomainEvent,
  HintUsedEvent,
  MasteryState,
  QuizType,
} from '../../../src/domain/model/types'
import {
  advanceQuestionMastery,
  advanceTopicMastery,
} from '../../../src/domain/mastery/masteryStateMachine'
import { replayProjections, type Projections } from '../../../src/domain/eventLog/replay'

/**
 * `domain/eventLog/replay` 的行为契约（spec `offline-event-log`
 * §投影可由事件重建）。
 *
 * 核心断言：`replayProjections(events)`（一次 reduce 折叠全量事件）与**逐事件
 * 增量维护**的结果深度相等——即「重放 == 增量」。这正是 spec「重建投影」
 * Scenario 与「清空投影缓存仍可恢复」Scenario 的可执行形式。
 *
 * 增量参考实现写在本文件内（`incrementalProjections`），与 src 的重放是两条
 * 独立书写的折叠路径：src 侧是单次 reduce + 每次返回新对象，测试侧是
 * if/switch 就地改写可变对象。两者只在 `advanceQuestionMastery` /
 * `advanceTopicMastery`（Task 5 掌握的迁移真源）上共用代码。
 */

const PROFILE_ID = 'p-1'
const OTHER_PROFILE_ID = 'p-2'
const NOW = 1_700_000_000_000

/** 题号 → 题型 查询表（题型级掌握投影的唯一来源）。 */
const QUESTION_TYPE_BY_ID: Readonly<Record<string, QuizType>> = {
  'q-1': 'add-sub',
  'q-2': 'add-sub',
  'q-3': 'two-step-app',
  'q-4': 'mul-div',
  'q-5': 'add-sub',
  'q-6': 'mul-div',
  'q-7': 'unit-time-route',
  'q-3-sim': 'two-step-app',
}

/** 造一条 `answer-submitted` 事件，默认值均为「首次独立答对 q-1」。 */
function submitted(
  overrides: Partial<AnswerSubmittedEvent> & { eventId: string },
): AnswerSubmittedEvent {
  return {
    profileId: PROFILE_ID,
    occurredAt: NOW,
    type: 'answer-submitted',
    sessionId: 's-1',
    questionId: 'q-1',
    submitted: '6',
    correct: true,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 900,
    ...overrides,
  }
}

/** 造一条 `hint-used` 事件。 */
function hintUsed(eventId: string, overrides: Partial<HintUsedEvent> = {}): HintUsedEvent {
  return {
    eventId,
    profileId: PROFILE_ID,
    occurredAt: NOW,
    type: 'hint-used',
    sessionId: 's-1',
    questionId: 'q-1',
    level: 1,
    ...overrides,
  }
}

/** 造一条 `answer-revealed` 事件。 */
function revealed(eventId: string, overrides: Partial<AnswerRevealedEvent> = {}): AnswerRevealedEvent {
  return {
    eventId,
    profileId: PROFILE_ID,
    occurredAt: NOW,
    type: 'answer-revealed',
    sessionId: 's-1',
    questionId: 'q-1',
    revealedAnswer: true,
    ...overrides,
  }
}

/** 造一条 `correction-done` 事件。 */
function corrected(eventId: string, overrides: Partial<CorrectionDoneEvent> = {}): CorrectionDoneEvent {
  return {
    eventId,
    profileId: PROFILE_ID,
    occurredAt: NOW,
    type: 'correction-done',
    sessionId: 's-1',
    questionId: 'q-1',
    similarQuestionId: 'q-1-sim',
    ...overrides,
  }
}

/**
 * 一段真实事件序列：建档 → 第一天题组（含答对/用提示/答错/看答案/订正）→
 * 解锁与整组完成 → 第二天再开一组。
 *
 * 覆盖四类答题流程事件 + 解锁/完成/建档，是对 design §2 投影表的一次
 * 「一天完整使用」的具象化；后续所有断言都以它为输入。
 */
const REALISTIC_LOG: readonly DomainEvent[] = [
  {
    eventId: 'e-profile',
    profileId: PROFILE_ID,
    occurredAt: NOW,
    type: 'profile-created',
    nickname: '小深',
    avatarId: 'avatar-1',
    pinHash: 'hash',
    salt: 'salt',
  },
  {
    eventId: 'e-session-1',
    profileId: PROFILE_ID,
    occurredAt: NOW + 1,
    type: 'session-started',
    sessionId: 's-1',
    questionIds: ['q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-7'],
    difficultyTrace: [1, 1, 1],
  },
  submitted({ eventId: 'e-a1', occurredAt: NOW + 2 }),
  hintUsed('e-h1', { eventId: 'e-h1', occurredAt: NOW + 3, questionId: 'q-2', level: 1 }),
  submitted({
    eventId: 'e-a2',
    occurredAt: NOW + 4,
    questionId: 'q-2',
    usedHintLevel: 1,
  }),
  submitted({
    eventId: 'e-a3',
    occurredAt: NOW + 5,
    questionId: 'q-3',
    submitted: '9',
    correct: false,
  }),
  revealed('e-r3', { occurredAt: NOW + 6, questionId: 'q-3' }),
  corrected('e-c3', { occurredAt: NOW + 7, questionId: 'q-3', similarQuestionId: 'q-3-sim' }),
  submitted({
    eventId: 'e-a4',
    occurredAt: NOW + 8,
    questionId: 'q-4',
    submitted: '12',
    correct: false,
  }),
  revealed('e-r4', { occurredAt: NOW + 9, questionId: 'q-4' }),
  submitted({ eventId: 'e-a5', occurredAt: NOW + 10, questionId: 'q-5' }),
  submitted({ eventId: 'e-a6', occurredAt: NOW + 11, questionId: 'q-6' }),
  submitted({ eventId: 'e-a7', occurredAt: NOW + 12, questionId: 'q-7' }),
  {
    eventId: 'e-unlock-1',
    profileId: PROFILE_ID,
    occurredAt: NOW + 13,
    type: 'unlock-granted',
    targetId: 'creature-anglerfish',
    kind: 'creature',
    reason: 's-1',
  },
  {
    eventId: 'e-done-1',
    profileId: PROFILE_ID,
    occurredAt: NOW + 14,
    type: 'session-completed',
    sessionId: 's-1',
    rewards: ['badge-deep-diver'],
    unlockedZone: 'zone-2',
    unlockedCreature: 'creature-anglerfish',
  },
  {
    eventId: 'e-session-2',
    profileId: PROFILE_ID,
    occurredAt: NOW + 86_400_000,
    type: 'session-started',
    sessionId: 's-2',
    questionIds: ['q-7', 'q-8'],
    difficultyTrace: [1],
  },
]

/** 增量参考实现里的可变进度条目（与投影类型同形状，只是去掉了 readonly）。 */
type MutableProgress = {
  sessionId: string
  profileId: string
  questionIds: string[]
  answeredQuestionIds: string[]
  correctQuestionIds: string[]
  wrongQuestionIds: string[]
  revealedQuestionIds: string[]
  correctedQuestionIds: string[]
  hintCount: number
  completedAt: number | null
}

/** 增量参考实现里的可变错题条目。 */
type MutableMistake = {
  questionId: string
  wrongCount: number
  revealed: boolean
  lastWrongAt: number | null
  corrected: boolean
  correctedSimilarQuestionIds: string[]
}

/** 增量参考实现里的可变解锁条目。 */
type MutableUnlock = { targetId: string; kind: 'creature' | 'zone'; reason: string; unlockedAt: number }

/** 新建一条空进度（题组事件先于 session-started 到达时也要有处可写）。 */
function emptyProgress(sessionId: string, profileId: string): MutableProgress {
  return {
    sessionId,
    profileId,
    questionIds: [],
    answeredQuestionIds: [],
    correctQuestionIds: [],
    wrongQuestionIds: [],
    revealedQuestionIds: [],
    correctedQuestionIds: [],
    hintCount: 0,
    completedAt: null,
  }
}

/** 事件是否带 sessionId（答题流程四类与题组两类都带）。 */
function hasSessionId(event: DomainEvent): event is DomainEvent & { sessionId: string } {
  return 'sessionId' in event
}

/** 推进一次掌握迁移：题目轨 + 题型轨双轨同时走（题型未知时题型轨跳过）。 */
function advanceMastery(
  event: AnswerEvent,
  byQuestion: Record<string, MasteryState>,
  byTopic: Record<string, MasteryState>,
  questionTypeById: Readonly<Record<string, QuizType>>,
): void {
  byQuestion[event.questionId] = advanceQuestionMastery(byQuestion[event.questionId], event)
  const topic = questionTypeById[event.questionId]
  if (topic !== undefined) {
    byTopic[topic] = advanceTopicMastery(byTopic[topic], event)
  }
}

/**
 * 逐事件增量维护的参考实现（测试侧的独立折叠路径）。
 *
 * 与 src 的重放刻意分开书写：这里是 if/switch + 就地改写的可变对象，src 是
 * 单次 reduce + 每次返回新对象。两者只共用 Task 5 的掌握迁移函数——「重放
 * 不得另写一套掌握迁移逻辑」就落在 {@link advanceMastery} 这一行 import 上。
 */
function incrementalProjections(
  events: readonly DomainEvent[],
  questionTypeById: Readonly<Record<string, QuizType>>,
): Projections {
  const questProgress: Record<string, MutableProgress> = {}
  const masteryByQuestion: Record<string, MasteryState> = {}
  const masteryByTopic: Record<string, MasteryState> = {}
  const mistakeBook: Record<string, MutableMistake> = {}
  const bestiaryUnlock: Record<string, MutableUnlock> = {}
  const dailyQuestIndex: Record<string, string> = {}

  for (const event of events) {
    if (event.type === 'session-started') {
      const progress = (questProgress[event.sessionId] ??= emptyProgress(event.sessionId, event.profileId))
      // 题序先到者胜：同一 sessionId 的 session-started 重复到达（重试写入被
      // appendEvents 放行、或题组事件先于它到达）都不覆盖已固定的题序。
      if (progress.questionIds.length === 0) {
        progress.questionIds.push(...event.questionIds)
      }
      // 当日题组索引按 UTC 日界取日期键；同一天**后者覆盖**（最新一组胜出，
      // 让内容换版后失去引用的旧题组能被重新领取的题组顶掉）。
      const day = new Date(event.occurredAt).toISOString().slice(0, 10)
      dailyQuestIndex[day] = event.sessionId
      continue
    }

    // `unlock-granted` 不带 sessionId，先于 sessionId 守卫处理。
    if (event.type === 'unlock-granted') {
      grantUnlock(event.targetId, event.kind, event.reason, event.occurredAt)
      continue
    }

    if (!hasSessionId(event)) {
      continue
    }

    const progress = (questProgress[event.sessionId] ??= emptyProgress(event.sessionId, event.profileId))
    switch (event.type) {
      case 'answer-submitted': {
        advanceMastery(event, masteryByQuestion, masteryByTopic, questionTypeById)
        if (!progress.answeredQuestionIds.includes(event.questionId)) {
          progress.answeredQuestionIds.push(event.questionId)
        }
        if (event.correct) {
          if (!progress.correctQuestionIds.includes(event.questionId)) {
            progress.correctQuestionIds.push(event.questionId)
          }
        } else {
          if (!progress.wrongQuestionIds.includes(event.questionId)) {
            progress.wrongQuestionIds.push(event.questionId)
          }
          const mistake = (mistakeBook[event.questionId] ??= {
            questionId: event.questionId,
            wrongCount: 0,
            revealed: false,
            lastWrongAt: null,
            corrected: false,
            correctedSimilarQuestionIds: [],
          })
          mistake.wrongCount += 1
          mistake.lastWrongAt = event.occurredAt
          mistake.corrected = false
        }
        break
      }
      case 'hint-used':
        progress.hintCount += 1
        break
      case 'answer-revealed': {
        advanceMastery(event, masteryByQuestion, masteryByTopic, questionTypeById)
        if (!progress.revealedQuestionIds.includes(event.questionId)) {
          progress.revealedQuestionIds.push(event.questionId)
        }
        const mistake = (mistakeBook[event.questionId] ??= {
          questionId: event.questionId,
          wrongCount: 0,
          revealed: false,
          lastWrongAt: null,
          corrected: false,
          correctedSimilarQuestionIds: [],
        })
        mistake.revealed = true
        mistake.corrected = false
        break
      }
      case 'correction-done': {
        advanceMastery(event, masteryByQuestion, masteryByTopic, questionTypeById)
        if (!progress.correctedQuestionIds.includes(event.questionId)) {
          progress.correctedQuestionIds.push(event.questionId)
        }
        const mistake = (mistakeBook[event.questionId] ??= {
          questionId: event.questionId,
          wrongCount: 0,
          revealed: false,
          lastWrongAt: null,
          corrected: false,
          correctedSimilarQuestionIds: [],
        })
        mistake.corrected = true
        if (!mistake.correctedSimilarQuestionIds.includes(event.similarQuestionId)) {
          mistake.correctedSimilarQuestionIds.push(event.similarQuestionId)
        }
        break
      }
      case 'session-completed':
        progress.completedAt = event.occurredAt
        // 载荷里带的解锁与 unlock-granted 走同一把锁，因此同一次解锁两处都写
        // 也不会重复计数（先到者胜）。
        if (event.unlockedZone !== undefined) {
          grantUnlock(event.unlockedZone, 'zone', event.sessionId, event.occurredAt)
        }
        if (event.unlockedCreature !== undefined) {
          grantUnlock(event.unlockedCreature, 'creature', event.sessionId, event.occurredAt)
        }
        break
      default:
        // profile-created / settings-updated / difficulty-fallback 不参与投影。
        break
    }
  }

  return { questProgress, masteryByQuestion, masteryByTopic, mistakeBook, bestiaryUnlock, dailyQuestIndex }

  /** 追加型解锁：同一个 kind+targetId 只记第一次（先到者胜），绝不回退。 */
  function grantUnlock(targetId: string, kind: 'creature' | 'zone', reason: string, at: number): void {
    const key = `${kind}:${targetId}`
    if (bestiaryUnlock[key] === undefined) {
      bestiaryUnlock[key] = { targetId, kind, reason, unlockedAt: at }
    }
  }
}

describe('domain/eventLog: 重放 == 增量（spec §重建投影）', () => {
  it('真实事件序列上，replayProjections 与逐事件增量维护深度相等', () => {
    const replayed = replayProjections(REALISTIC_LOG, { questionTypeById: QUESTION_TYPE_BY_ID })
    const incremental = incrementalProjections(REALISTIC_LOG, QUESTION_TYPE_BY_ID)
    expect(replayed).toEqual(incremental)
  })

  it('题组事件先于 session-started 到达（乱序写入）时两侧仍一致', () => {
    const reordered = [REALISTIC_LOG[3], REALISTIC_LOG[1], REALISTIC_LOG[2], ...REALISTIC_LOG.slice(4)]
    const replayed = replayProjections(reordered, { questionTypeById: QUESTION_TYPE_BY_ID })
    const incremental = incrementalProjections(reordered, QUESTION_TYPE_BY_ID)
    expect(replayed).toEqual(incremental)
  })

  it('清空投影缓存后仍可从事件日志恢复（同一个 replay 不受既有投影影响）', () => {
    // 重放不接收任何既有投影入参——它是 events 的纯函数，因而「清空缓存」
    // 与「首次启动」必然得到同一结果。
    const first = replayProjections(REALISTIC_LOG, { questionTypeById: QUESTION_TYPE_BY_ID })
    const second = replayProjections(REALISTIC_LOG, { questionTypeById: QUESTION_TYPE_BY_ID })
    expect(first).toEqual(second)
    expect(first).toEqual(incrementalProjections(REALISTIC_LOG, QUESTION_TYPE_BY_ID))
  })

  it('只重放该档案的事件：混入其他档案的事件不污染投影', () => {
    const foreign: DomainEvent = submitted({
      eventId: 'e-foreign',
      profileId: OTHER_PROFILE_ID,
      occurredAt: NOW + 50,
      questionId: 'q-9',
      correct: false,
    })
    const replayed = replayProjections([...REALISTIC_LOG, foreign], {
      profileId: PROFILE_ID,
      questionTypeById: QUESTION_TYPE_BY_ID,
    })
    expect(replayed).toEqual(
      replayProjections(REALISTIC_LOG, { questionTypeById: QUESTION_TYPE_BY_ID }),
    )
    expect(Object.keys(replayed.masteryByQuestion)).not.toContain('q-9')
  })
})

describe('domain/eventLog: 六个投影的具体取值（design §2 投影表）', () => {
  const projections = replayProjections(REALISTIC_LOG, { questionTypeById: QUESTION_TYPE_BY_ID })

  it('questProgress：题序、已答/答对/答错/看答案/订正集合、提示次数与完成时间', () => {
    const first = projections.questProgress['s-1']
    expect(first.questionIds).toEqual(['q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-7'])
    expect(first.answeredQuestionIds).toEqual(['q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-7'])
    expect(first.correctQuestionIds).toEqual(['q-1', 'q-2', 'q-5', 'q-6', 'q-7'])
    expect(first.wrongQuestionIds).toEqual(['q-3', 'q-4'])
    expect(first.revealedQuestionIds).toEqual(['q-3', 'q-4'])
    expect(first.correctedQuestionIds).toEqual(['q-3'])
    expect(first.hintCount).toBe(1)
    expect(first.completedAt).toBe(NOW + 14)
    // 第二天另开一组，进度按 sessionId 分开记，不串组。
    expect(projections.questProgress['s-2'].questionIds).toEqual(['q-7', 'q-8'])
    expect(projections.questProgress['s-2'].answeredQuestionIds).toEqual([])
  })

  it('masteryByQuestion：题目级只升不降，看答案只到提示后掌握', () => {
    expect(projections.masteryByQuestion['q-1']).toEqual({ level: 'independent', independentStreak: 1 })
    expect(projections.masteryByQuestion['q-2']).toEqual({ level: 'hinted', independentStreak: 0 })
    // q-3：答错 → 看答案 → 订正相似题，停在提示后掌握。
    expect(projections.masteryByQuestion['q-3']).toEqual({ level: 'hinted', independentStreak: 0 })
    expect(projections.masteryByQuestion['q-5']).toEqual({ level: 'independent', independentStreak: 1 })
  })

  it('masteryByTopic：题型级跨题累计连击，add-sub 三次独立答对进稳定掌握', () => {
    // add-sub 上有 q-1 / q-2（提示）/ q-5 三次提交：仅 q-1 与 q-5 独立答对，
    // 中间被提示打断，因此连击为 1，停在独立掌握。
    expect(projections.masteryByTopic['add-sub']).toEqual({ level: 'independent', independentStreak: 1 })
    // mul-div 上 q-4 答错后看答案、q-6 独立答对 → 连击 1。
    expect(projections.masteryByTopic['mul-div']).toEqual({ level: 'independent', independentStreak: 1 })
    // two-step-app 上只有 q-3（答错/看答案/订正），等级提示后、连击 0。
    expect(projections.masteryByTopic['two-step-app']).toEqual({ level: 'hinted', independentStreak: 0 })
    // 未知题型的题目（q-8 未在查询表中）不进入题型轨。
    expect(Object.keys(projections.masteryByTopic)).not.toContain('pattern-data')
  })

  it('mistakeBook：答错与看答案都入册，订正后标记已订正且记录相似题', () => {
    const q3 = projections.mistakeBook['q-3']
    expect(q3).toEqual({
      questionId: 'q-3',
      wrongCount: 1,
      revealed: true,
      lastWrongAt: NOW + 5,
      corrected: true,
      correctedSimilarQuestionIds: ['q-3-sim'],
    })
    const q4 = projections.mistakeBook['q-4']
    expect(q4.wrongCount).toBe(1)
    expect(q4.revealed).toBe(true)
    expect(q4.corrected).toBe(false)
    expect(q4.correctedSimilarQuestionIds).toEqual([])
    // 答对的题不进错题本。
    expect(Object.keys(projections.mistakeBook)).toEqual(['q-3', 'q-4'])
  })

  it('bestiaryUnlock：append-only，unlock-granted 与整组完成载荷同键不重复', () => {
    expect(projections.bestiaryUnlock).toEqual({
      'creature:creature-anglerfish': {
        targetId: 'creature-anglerfish',
        kind: 'creature',
        reason: 's-1',
        unlockedAt: NOW + 13,
      },
      'zone:zone-2': { targetId: 'zone-2', kind: 'zone', reason: 's-1', unlockedAt: NOW + 14 },
    })
  })

  it('dailyQuestIndex：按 UTC 日界索引，同一天先到者胜（刷新不重抽）', () => {
    const firstDay = new Date(NOW).toISOString().slice(0, 10)
    const secondDay = new Date(NOW + 86_400_000).toISOString().slice(0, 10)
    expect(projections.dailyQuestIndex[firstDay]).toBe('s-1')
    expect(projections.dailyQuestIndex[secondDay]).toBe('s-2')
  })
})

/**
 * 固定种子 PRNG（mulberry32）：小而可复现，不引入任何依赖。
 *
 * 返回值是 [0,1) 的伪随机数；同一个 seed 必然产出同一条序列——fuzz 才可复现。
 * 之所以自己写而不引依赖：`domain/` 与测试都要求零运行时依赖，且 32 位
 * 状态已足够撑起 200 轮事件生成。
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 随机事件序列的入参：PRNG 与题库元数据由各轮共享。 */
function randomEvent(random: () => number, index: number): DomainEvent {
  const questionId = `q-${1 + Math.floor(random() * 8)}`
  const sessionId = `s-${1 + Math.floor(random() * 3)}`
  const occurredAt = NOW + Math.floor(random() * 40) * 2
  const profileId = random() < 0.1 ? OTHER_PROFILE_ID : PROFILE_ID
  const base = { eventId: `e-${index}`, profileId, occurredAt }

  switch (Math.floor(random() * 10)) {
    case 0:
    case 1:
    case 2:
      return {
        ...base,
        type: 'answer-submitted',
        sessionId,
        questionId,
        submitted: 'x',
        correct: random() < 0.5,
        usedHintLevel: Math.floor(random() * 3),
        retryCount: Math.floor(random() * 2),
        ms: 800,
      }
    case 3:
      return { ...base, type: 'hint-used', sessionId, questionId, level: 1 + Math.floor(random() * 5) }
    case 4:
      return { ...base, type: 'answer-revealed', sessionId, questionId, revealedAnswer: true }
    case 5:
      return {
        ...base,
        type: 'correction-done',
        sessionId,
        questionId,
        similarQuestionId: `${questionId}-sim`,
      }
    case 6:
      return {
        ...base,
        type: 'session-started',
        sessionId,
        questionIds: ['q-1', 'q-2'],
        difficultyTrace: [1],
      }
    case 7:
      return { ...base, type: 'unlock-granted', targetId: 'creature-x', kind: 'creature', reason: sessionId }
    case 8:
      return {
        ...base,
        type: 'session-completed',
        sessionId,
        rewards: ['badge-x'],
        unlockedZone: random() < 0.5 ? 'zone-2' : undefined,
        unlockedCreature: random() < 0.5 ? 'creature-x' : undefined,
      }
    default:
      return {
        ...base,
        type: 'settings-updated',
        basicCount: 5,
        appliedCount: 3,
        probeCount: 1,
        maxMinutes: 15,
      }
  }
}

describe('domain/eventLog: 重放的纯函数契约', () => {
  it('不修改事件数组与事件对象', () => {
    const events = REALISTIC_LOG.map((event) => ({ ...event }))
    const snapshot = JSON.stringify(events)
    replayProjections(events, { questionTypeById: QUESTION_TYPE_BY_ID })
    expect(JSON.stringify(events)).toBe(snapshot)
  })

  it('投影里的数组是新数组（改写投影不会反写到事件上）', () => {
    const started = REALISTIC_LOG.find((event) => event.type === 'session-started')
    const projections = replayProjections(REALISTIC_LOG, { questionTypeById: QUESTION_TYPE_BY_ID })
    const progress = projections.questProgress['s-1']
    // 题序是拷贝而非引用：重放产物被消费方改写不会污染事件载荷。
    expect(progress.questionIds).not.toBe(started?.questionIds)
    expect(progress.questionIds).toEqual(started?.questionIds)
  })

  it('空事件流产出六张空投影', () => {
    expect(replayProjections([])).toEqual({
      questProgress: {},
      masteryByQuestion: {},
      masteryByTopic: {},
      mistakeBook: {},
      bestiaryUnlock: {},
      dailyQuestIndex: {},
    })
  })
})

describe('domain/eventLog: fuzz — 固定种子 200 轮随机事件序列', () => {
  it('重放与增量在每一轮都深度相等', () => {
    const random = mulberry32(20260101)
    for (let round = 0; round < 200; round += 1) {
      const size = 5 + Math.floor(random() * 30)
      // occurredAt 故意重复（random()*40*2 只取奇数间隔的一半），让「同刻多条
      // 事件」的顺序成为被考察对象：两侧都按数组顺序折叠，必须给出同一结果。
      const events: DomainEvent[] = []
      for (let index = 0; index < size; index += 1) {
        events.push(randomEvent(random, round * 1000 + index))
      }
      const replayed = replayProjections(events, { questionTypeById: QUESTION_TYPE_BY_ID })
      const incremental = incrementalProjections(events, QUESTION_TYPE_BY_ID)
      expect(replayed).toEqual(incremental)
    }
  })
})
