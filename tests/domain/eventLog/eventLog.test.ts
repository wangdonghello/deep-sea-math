import { describe, expect, it } from 'vitest'

import type {
  AnswerRevealedEvent,
  AnswerSubmittedEvent,
  CorrectionDoneEvent,
  DifficultyFallbackEvent,
  DomainEvent,
  HintUsedEvent,
  ProfileCreatedEvent,
  SessionCompletedEvent,
  SessionStartedEvent,
  UnlockGrantedEvent,
} from '../../../src/domain/model/types'
import {
  appendEvents,
  logicalEventKey,
} from '../../../src/domain/eventLog/appendEvents'

/**
 * `domain/eventLog/appendEvents` 的行为契约（spec `offline-event-log`
 * §事件记录与 ID 幂等）。
 *
 * 锁两件事：
 * 1. **eventId 去重**：同一次逻辑操作被网络/界面原因写入两次（同 eventId），
 *    日志里只保留一条；
 * 2. **逻辑组合去重**：同一 `sessionId + questionId + retryCount + level`
 *    组合不得产生两条语义重复事件——即便两次写入拿到了不同的 eventId
 *    （例如重试提交时客户端先本地生成 id、后服务端补发）。
 *
 * 另锁纯函数契约：不改写入参、返回新数组。
 */

/** 基准档案，全部事件同属一个档案（隔离边界由 Task 9 仓储负责）。 */
const PROFILE_ID = 'p-1'

/** 基准时间（Unix 毫秒），固定值保证断言可复现。 */
const NOW = 1_700_000_000_000

/** 已存在的日志：一次题组里一条提交 + 一次提示。 */
function baseLog(): DomainEvent[] {
  const answer: AnswerSubmittedEvent = {
    eventId: 'e-answer-1',
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
  }
  const hint: HintUsedEvent = {
    eventId: 'e-hint-1',
    profileId: PROFILE_ID,
    occurredAt: NOW + 10,
    type: 'hint-used',
    sessionId: 's-1',
    questionId: 'q-2',
    level: 1,
  }
  return [answer, hint]
}

describe('domain/eventLog: logicalEventKey — 逻辑组合键', () => {
  it('answer-submitted 的组合键含 sessionId/questionId/retryCount/usedHintLevel', () => {
    const answer: AnswerSubmittedEvent = {
      ...baseLog()[0],
    } as AnswerSubmittedEvent
    expect(logicalEventKey(answer)).toBe('answer-submitted|s-1|q-1|0|0')
  })

  it('retryCount 或 usedHintLevel 任一不同 → 组合键不同（两次重试不是同一次操作）', () => {
    const first: AnswerSubmittedEvent = baseLog()[0] as AnswerSubmittedEvent
    const retried: AnswerSubmittedEvent = { ...first, retryCount: 1 }
    const hinted: AnswerSubmittedEvent = { ...first, usedHintLevel: 2 }
    expect(logicalEventKey(retried)).not.toBe(logicalEventKey(first))
    expect(logicalEventKey(hinted)).not.toBe(logicalEventKey(first))
    expect(logicalEventKey(retried)).not.toBe(logicalEventKey(hinted))
  })

  it('hint-used 的组合键含提示层级 level', () => {
    const hint = baseLog()[1] as HintUsedEvent
    expect(logicalEventKey(hint)).toBe('hint-used|s-1|q-2|1')
    // 同一题再展开第 2 层是另一次操作，不得被吞。
    expect(logicalEventKey({ ...hint, level: 2 })).not.toBe(logicalEventKey(hint))
  })

  it('answer-revealed 无 level 字段：组合键收敛为 sessionId+questionId（每题每组最多看一次答案）', () => {
    const reveal: AnswerRevealedEvent = {
      eventId: 'e-reveal-1',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'answer-revealed',
      sessionId: 's-1',
      questionId: 'q-3',
      revealedAnswer: true,
    }
    // 同题同组的第二次看答案（ eventId 不同）会被判为语义重复事件。
    expect(logicalEventKey(reveal)).toBe('answer-revealed|s-1|q-3')
    expect(logicalEventKey({ ...reveal, eventId: 'e-reveal-2' })).toBe(logicalEventKey(reveal))
    // 换题组则不是同一次操作。
    expect(logicalEventKey({ ...reveal, sessionId: 's-2' })).not.toBe(logicalEventKey(reveal))
  })

  it('correction-done 的组合键含相似题 ID（同一原题可订正多条相似题）', () => {
    const correction: CorrectionDoneEvent = {
      eventId: 'e-correction-1',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'correction-done',
      sessionId: 's-1',
      questionId: 'q-3',
      similarQuestionId: 'q-3-sim',
    }
    expect(logicalEventKey(correction)).toBe('correction-done|s-1|q-3|q-3-sim')
    expect(logicalEventKey({ ...correction, similarQuestionId: 'q-3-sim-2' })).not.toBe(
      logicalEventKey(correction),
    )
  })

  it('非答题流程事件（建档/设置）不设逻辑组合键', () => {
    // 这些事件没有「同一逻辑操作」可言（家长可以改多次设置），只靠 eventId 去重。
    expect(
      logicalEventKey({
        eventId: 'e-settings-1',
        profileId: PROFILE_ID,
        occurredAt: NOW,
        type: 'settings-updated',
        basicCount: 5,
        appliedCount: 3,
        probeCount: 1,
        maxMinutes: 15,
      }),
    ).toBeNull()
  })
})

describe('domain/eventLog: logicalEventKey — 其余事件类型的组合键', () => {
  /** 一条建档案事件。 */
  const profileCreated: ProfileCreatedEvent = {
    eventId: 'e-profile',
    profileId: PROFILE_ID,
    occurredAt: NOW,
    type: 'profile-created',
    nickname: '小深',
    avatarId: 'a-1',
    pinHash: 'hash',
    salt: 'salt',
  }

  it('profile-created 的组合键是档案 ID（一个档案只建档一次）', () => {
    expect(logicalEventKey(profileCreated)).toBe('profile-created|p-1')
  })

  it('session-started 的组合键是 sessionId（一次题组一条）', () => {
    const started: SessionStartedEvent = {
      eventId: 'e-session',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'session-started',
      sessionId: 's-1',
      questionIds: ['q-1'],
      difficultyTrace: [1],
    }
    expect(logicalEventKey(started)).toBe('session-started|s-1')
  })

  it('session-completed 的组合键是 sessionId（重复完成不重复发奖）', () => {
    const completed: SessionCompletedEvent = {
      eventId: 'e-done',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'session-completed',
      sessionId: 's-1',
      rewards: ['badge-x'],
    }
    expect(logicalEventKey(completed)).toBe('session-completed|s-1')
  })

  it('unlock-granted 的组合键含 kind 与 targetId', () => {
    const unlock: UnlockGrantedEvent = {
      eventId: 'e-unlock',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'unlock-granted',
      targetId: 'creature-anglerfish',
      kind: 'creature',
      reason: 's-1',
    }
    expect(logicalEventKey(unlock)).toBe('unlock-granted|creature|creature-anglerfish')
    // 同一目标从 zone 维度再解一次不算重复（kind 不同）。
    expect(logicalEventKey({ ...unlock, kind: 'zone' })).not.toBe(logicalEventKey(unlock))
  })

  it('difficulty-fallback 的组合键含 sessionId 与槽位类别', () => {
    const fallback: DifficultyFallbackEvent = {
      eventId: 'e-fallback',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'difficulty-fallback',
      sessionId: 's-1',
      requestedDifficulty: 2,
      actualDifficulty: 1,
      category: 'basic',
      reason: '2 档 basic 题量不足，改取 1 档补齐',
    }
    expect(logicalEventKey(fallback)).toBe('difficulty-fallback|s-1|basic')
    // 同一题组里 applied 槽位也回落是另一次操作。
    expect(logicalEventKey({ ...fallback, category: 'applied' })).not.toBe(logicalEventKey(fallback))
  })
})

describe('domain/eventLog: appendEvents — 同一 eventId 去重', () => {
  it('重复写入同一 eventId 只保留一条', () => {
    const log = baseLog()
    const merged = appendEvents(log, [log[0]])
    expect(merged).toHaveLength(2)
    expect(merged.map((event) => event.eventId)).toEqual(['e-answer-1', 'e-hint-1'])
  })

  it('在单次 incoming 批次内也去重（两条同 eventId 只留第一条）', () => {
    const answer = baseLog()[0]
    const merged = appendEvents([], [answer, { ...answer }])
    expect(merged).toHaveLength(1)
  })

  it('不同 eventId 的新事件照常追加，且保持写入顺序', () => {
    const incoming: DomainEvent[] = [
      {
        eventId: 'e-answer-2',
        profileId: PROFILE_ID,
        occurredAt: NOW + 20,
        type: 'answer-submitted',
        sessionId: 's-1',
        questionId: 'q-1',
        submitted: '7',
        correct: false,
        usedHintLevel: 0,
        retryCount: 1,
        ms: 1200,
      },
      { ...(baseLog()[1] as HintUsedEvent), eventId: 'e-hint-9', level: 3, questionId: 'q-2' },
    ]
    const merged = appendEvents(baseLog(), incoming)
    expect(merged.map((event) => event.eventId)).toEqual([
      'e-answer-1',
      'e-hint-1',
      'e-answer-2',
      'e-hint-9',
    ])
  })
})

describe('domain/eventLog: appendEvents — 同一逻辑组合去重', () => {
  it('不同 eventId 但同 sessionId+questionId+retryCount+level → 只保留先到的一条', () => {
    const first = baseLog()[0] as AnswerSubmittedEvent
    // 重试提交时客户端先本地生成 id、后补发：eventId 不同，语义同一次操作。
    const resent: AnswerSubmittedEvent = { ...first, eventId: 'e-answer-1-resent' }
    const merged = appendEvents([first], [resent])
    expect(merged).toHaveLength(1)
    expect(merged[0].eventId).toBe('e-answer-1')
  })

  it('同一题第二次看答案（新 eventId）被判为语义重复', () => {
    const reveal: AnswerRevealedEvent = {
      eventId: 'e-reveal-1',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'answer-revealed',
      sessionId: 's-1',
      questionId: 'q-3',
      revealedAnswer: true,
    }
    const merged = appendEvents([reveal], [{ ...reveal, eventId: 'e-reveal-2' }])
    expect(merged).toHaveLength(1)
  })

  it('retryCount 不同的两次提交是两次操作，均保留', () => {
    const first = baseLog()[0] as AnswerSubmittedEvent
    const retried: AnswerSubmittedEvent = {
      ...first,
      eventId: 'e-answer-2',
      retryCount: 1,
      correct: false,
    }
    expect(appendEvents([first], [retried])).toHaveLength(2)
  })

  it('不同题组里的同题同层提示不互相去重', () => {
    const hint = baseLog()[1] as HintUsedEvent
    const otherSession: HintUsedEvent = { ...hint, eventId: 'e-hint-2', sessionId: 's-2' }
    expect(appendEvents([hint], [otherSession])).toHaveLength(2)
  })
})

describe('domain/eventLog: appendEvents — 纯函数契约', () => {
  it('不修改入参数组，返回新数组', () => {
    const log = baseLog()
    const snapshot = log.map((event) => event.eventId)
    const merged = appendEvents(log, [])
    expect(merged).not.toBe(log)
    expect(log.map((event) => event.eventId)).toEqual(snapshot)
    expect(merged).toEqual(log)
  })

  it('事件对象按引用共享，不做深拷贝（事件是不可变值对象）', () => {
    const answer = baseLog()[0]
    const merged = appendEvents([], [answer])
    expect(merged[0]).toBe(answer)
  })

  it('既有日志里残留的语义重复事件也会被这次合并收敛', () => {
    const first = baseLog()[0] as AnswerSubmittedEvent
    const duplicate: AnswerSubmittedEvent = { ...first, eventId: 'e-answer-1-dup' }
    // existing 自身就有两条语义重复事件（早期版本写坏的日志）。
    const merged = appendEvents([first, duplicate], [])
    expect(merged).toHaveLength(1)
    expect(merged[0].eventId).toBe('e-answer-1')
  })

  it('两个入参都为空时返回空数组', () => {
    expect(appendEvents([], [])).toEqual([])
  })

  it('settings-updated 没有逻辑组合键：两次不同 eventId 的改设置都保留', () => {
    const first = {
      eventId: 'e-settings-1',
      profileId: PROFILE_ID,
      occurredAt: NOW,
      type: 'settings-updated',
      basicCount: 5,
      appliedCount: 3,
      probeCount: 1,
      maxMinutes: 15,
    } as const
    const second = { ...first, eventId: 'e-settings-2', maxMinutes: 20 }
    // 家长合法地改了两次设置：没有「同一逻辑操作」，只能按 eventId 去重，
    // 因此两条都在（少一条会让家长的下一次修改把前一次悄悄吞掉）。
    expect(appendEvents([first], [second])).toHaveLength(2)
  })
})
