import { describe, expect, it, vi } from 'vitest'

import type {
  AnswerSubmittedEvent,
  DomainEvent,
  ProfileCreatedEvent,
} from '../../../src/domain/model/types'
import { grantRewards, type RewardGrantInput } from '../../../src/domain/reward/rewardGrant'
import rewardGrantSource from '../../../src/domain/reward/rewardGrant.ts?raw'
import unlockRulesSource from '../../../src/domain/reward/unlockRules.ts?raw'

/**
 * `domain/reward/rewardGrant` 的行为契约。
 *
 * 锁五件事：
 * 1. **追加型**：只产出 `session-completed` 与 `unlock-granted` 两类事件，
 *    绝不产出任何回退/撤销类事件——答错绝不回退（design §3；spec
 *    `daily-math-quest` §整组完成与解锁「MUST NOT 撤销已解锁的内容或清除
 *    已有经验」）；
 * 2. **幂等**：重复完成同一题组不重复发奖（按 sessionId / targetId 比对
 *    既有事件）；
 * 3. 直接看答案（`answer-revealed`）的题 MUST NOT 计入独立答对率
 *    （spec `hint-and-correction` §直接看答案）；
 * 4. **决策确定**：奖励选择不进随机源；注入稳定 ID factory 后，同一入参反复调用得到同一结果；
 * 5. **纯函数**：不修改入参的事件数组。
 */

/** 静态时间戳：测试里的所有事件共用同一时刻，避免时钟干扰。 */
const NOW = 1_700_000_000_000

/** 可重复的 UUID 形状 unlock ID；每次 input() 都从同一序列开始。 */
function stableUnlockEventIdFactory(): () => string {
  let sequence = 0
  return () => `11111111-1111-4111-8111-${String(++sequence).padStart(12, '0')}`
}

/** 建档事件，作为事件历史的“锚”，同时验证 profileId 隔离。 */
function profileCreated(): ProfileCreatedEvent {
  return {
    eventId: 'e-profile',
    profileId: 'profile-1',
    occurredAt: NOW - 86_400_000,
    type: 'profile-created',
    nickname: '小深',
    avatarId: 'avatar-1',
    pinHash: 'hash',
    salt: 'salt',
  }
}

/** 9 题题组（默认 5 基础 + 3 应用 + 1 探测）。 */
const QUESTION_IDS = ['q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-7', 'q-8', 'q-9']

/** 造一次「首次独立答对」事件（未用提示、首次提交即对）。 */
function independentAnswer(questionId: string): AnswerSubmittedEvent {
  return {
    eventId: `e-${questionId}`,
    profileId: 'profile-1',
    occurredAt: NOW,
    type: 'answer-submitted',
    sessionId: 'session-1',
    questionId,
    submitted: '6',
    correct: true,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 900,
  }
}

/** 造一次「提示后才答对」事件。 */
function hintedAnswer(questionId: string): AnswerSubmittedEvent {
  return { ...independentAnswer(questionId), usedHintLevel: 2 }
}

/** 造一次「重试后才答对」事件（改过错才算会，不计独立答对）。 */
function retriedAnswer(questionId: string): AnswerSubmittedEvent {
  return { ...independentAnswer(questionId), retryCount: 1 }
}

/** 造一次「直接看答案」事件。 */
function revealed(questionId: string): DomainEvent {
  return {
    eventId: `e-reveal-${questionId}`,
    profileId: 'profile-1',
    occurredAt: NOW,
    type: 'answer-revealed',
    sessionId: 'session-1',
    questionId,
    revealedAnswer: true,
  }
}

/** 把每题都答完：`independents` 指定其中几题首次独立答对，其余提示后答对。 */
function answeredEveryQuestion(independents: number): DomainEvent[] {
  return QUESTION_IDS.map((_, index) => {
    const questionId = QUESTION_IDS[index]
    return index < independents ? independentAnswer(questionId) : hintedAnswer(questionId)
  })
}

/** 构造一次发奖调用的入参。 */
function input(overrides: Partial<RewardGrantInput> = {}): RewardGrantInput {
  return {
    profileId: 'profile-1',
    sessionId: 'session-1',
    occurredAt: NOW,
    eventId: 'e-session-completed',
    questionIds: QUESTION_IDS,
    events: [profileCreated(), ...answeredEveryQuestion(9)],
    creatureId: 'creature-anglerfish',
    zoneId: 'zone-twilight',
    unlockEventIdFactory: stableUnlockEventIdFactory(),
    ...overrides,
  }
}

describe('domain/reward: 完成整组的发放', () => {
  it('产出一条 session-completed 与 creature / zone 两条 unlock-granted', () => {
    const result = grantRewards(input())
    expect(result.granted).toBe(true)
    expect(result.sessionCompletedEvent?.type).toBe('session-completed')
    expect(result.unlockGrantedEvents.map((event) => event.kind)).toEqual(['creature', 'zone'])
  })

  it('未注入 unlock factory 时默认生成标准 UUID', () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('123e4567-e89b-42d3-a456-426614174001')
      .mockReturnValueOnce('123e4567-e89b-42d3-a456-426614174002')
    try {
      const result = grantRewards(input({ unlockEventIdFactory: undefined }))

      expect(result.unlockGrantedEvents.map((event) => event.eventId)).toEqual([
        '123e4567-e89b-42d3-a456-426614174001',
        '123e4567-e89b-42d3-a456-426614174002',
      ])
      expect(result.unlockGrantedEvents.every((event) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.eventId),
      )).toBe(true)
      expect(new Set(result.unlockGrantedEvents.map((event) => event.eventId)).size).toBe(2)
      expect(randomUUID).toHaveBeenCalledTimes(2)
    } finally {
      randomUUID.mockRestore()
    }
  })

  it('注入 unlock factory 时使用注入的事件 ID', () => {
    const factory = vi.fn()
      .mockReturnValueOnce('22222222-2222-4222-8222-000000000001')
      .mockReturnValueOnce('22222222-2222-4222-8222-000000000002')

    const result = grantRewards(input({ unlockEventIdFactory: factory }))

    expect(result.unlockGrantedEvents.map((event) => event.eventId)).toEqual([
      '22222222-2222-4222-8222-000000000001',
      '22222222-2222-4222-8222-000000000002',
    ])
    expect(result.unlockGrantedEvents.every((event) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.eventId),
    )).toBe(true)
    expect(new Set(result.unlockGrantedEvents.map((event) => event.eventId)).size).toBe(2)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('徽章写进 session-completed.rewards', () => {
    const result = grantRewards(input())
    expect(result.rewards).toContain('quest-complete')
  })

  it('6/9 首次独立答对时额外发放独立掌握徽章', () => {
    const result = grantRewards(input({ events: [profileCreated(), ...answeredEveryQuestion(6)] }))
    expect(result.rewards).toContain('independent-mastery')
  })

  it('unlock-granted 的 reason 是所属 sessionId（types.ts：解锁原因为 sessionId）', () => {
    const result = grantRewards(input())
    for (const event of result.unlockGrantedEvents) {
      expect(event.reason).toBe('session-1')
      expect(event.profileId).toBe('profile-1')
    }
  })

  it('events 为 session-completed 在前、unlock-granted 在后的追加序', () => {
    const result = grantRewards(input())
    expect(result.events.map((event) => event.type)).toEqual([
      'session-completed',
      'unlock-granted',
      'unlock-granted',
    ])
  })
})

describe('domain/reward: 直接看答案不计独立答对率', () => {
  it('9 题中 4 题独立答对、3 题看过答案后答对 → 只算 4/9，不得独立徽章', () => {
    // 4 独立 + 3 看答案（其后又提交答对也不独立）+ 2 提示后答对。
    const events: DomainEvent[] = [
      profileCreated(),
      ...QUESTION_IDS.map((questionId, index) => {
        if (index < 4) return independentAnswer(questionId)
        if (index < 7) return revealed(questionId)
        return hintedAnswer(questionId)
      }),
      // 被看答案的 3 题随后也提交答对，独立率仍不得回升。
      ...QUESTION_IDS.slice(4, 7).map((questionId) => hintedAnswer(questionId)),
    ]
    const result = grantRewards(input({ events }))
    expect(result.granted).toBe(true)
    expect(result.rewards).toContain('quest-complete')
    expect(result.rewards).not.toContain('independent-mastery')
  })

  it('重试后才答对不计独立答对率', () => {
    const events = [
      profileCreated(),
      ...QUESTION_IDS.map((questionId, index) =>
        index < 6 ? retriedAnswer(questionId) : hintedAnswer(questionId),
      ),
    ]
    const result = grantRewards(input({ events }))
    expect(result.rewards).not.toContain('independent-mastery')
  })

  it('同题被重复出（repeatCount）时按去重题计，不抬答对率', () => {
    // 3 道题各被独立答对两次（模拟同一天重做/复练）：若按“作答次数”算会得到
    // 6/9 = 66.7% 从而误发徽章；按去重题计则独立答对只有 3 题 = 33%。
    const duplicated = (questionId: string, eventId: string): DomainEvent => ({
      ...independentAnswer(questionId),
      eventId,
    })
    const events: DomainEvent[] = [
      profileCreated(),
      duplicated('q-1', 'e-q-1-again'),
      duplicated('q-2', 'e-q-2-again'),
      duplicated('q-3', 'e-q-3-again'),
      ...QUESTION_IDS.slice(0, 3).map((questionId) => independentAnswer(questionId)),
      ...QUESTION_IDS.slice(3).map((questionId) => hintedAnswer(questionId)),
    ]
    const result = grantRewards(input({ events }))
    expect(result.granted).toBe(true)
    expect(result.rewards).toContain('quest-complete')
    expect(result.rewards).not.toContain('independent-mastery')
  })

  it('分母同样按去重题计：题组里重复出的同题不把总题数撑大', () => {
    // 9 个槽位只装了 6 道不同的题（q-1 出现 3 次，模拟题池不足的重复取题）。
    // 4 题独立答对：按去重分母 4/6 = 66.7% 达到 60%，应发独立掌握徽章；
    // 若按槽位数 4/9 = 44% 算就会漏发。
    const ids = ['q-1', 'q-1', 'q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-6']
    const events = [
      profileCreated(),
      independentAnswer('q-1'),
      independentAnswer('q-2'),
      independentAnswer('q-3'),
      independentAnswer('q-4'),
      hintedAnswer('q-5'),
      hintedAnswer('q-6'),
    ]
    const result = grantRewards(input({ events, questionIds: ids }))
    expect(result.granted).toBe(true)
    expect(result.rewards).toContain('independent-mastery')
  })
})

describe('domain/reward: 追加型（只发不撤）', () => {
  it('产出事件的类型只允许 session-completed 与 unlock-granted', () => {
    const result = grantRewards(input())
    for (const event of result.events) {
      expect(['session-completed', 'unlock-granted']).toContain(event.type)
    }
  })

  it('产出事件中不存在任何回退/撤销类事件', () => {
    const result = grantRewards(input())
    for (const event of result.events) {
      expect(event.type).not.toContain('revoked')
      expect(event.type).not.toContain('REVOKED')
    }
  })

  it('即使本题组里答错过，也已发放的解锁绝不收回（无撤销事件可产）', () => {
    // 3 题答错过再订正：完成后照常发放，且事件流里没有任何“收回”语义。
    const events: DomainEvent[] = [
      profileCreated(),
      ...QUESTION_IDS.map((questionId, index) => {
        if (index < 6) return independentAnswer(questionId)
        return { ...hintedAnswer(questionId) }
      }),
    ]
    const result = grantRewards(input({ events }))
    const unlockEventCount = result.unlockGrantedEvents.length
    expect(unlockEventCount).toBe(2)
    // 再调用一次（模拟刷新后重放）不得新增任何事件，更不得“撤回”已解锁项。
    const replay = grantRewards(
      input({ events: [...events, ...result.events] }),
    )
    expect(replay.events).toEqual([])
    expect(replay.granted).toBe(false)
  })
})

describe('domain/reward: 重复完成同一题组不重复发奖', () => {
  it('历史里已有同 sessionId 的 session-completed 时不再发奖', () => {
    const first = grantRewards(input())
    const second = grantRewards(input({ events: [profileCreated(), ...answeredEveryQuestion(9), ...first.events] }))
    expect(second.granted).toBe(false)
    expect(second.events).toEqual([])
    expect(second.sessionCompletedEvent).toBeNull()
    expect(second.rewards).toEqual([])
    expect(second.unlockGrantedEvents).toEqual([])
  })

  it('历史里已有该生物的 unlock-granted 时不再重复发同一 targetId', () => {
    const alreadyGranted: DomainEvent[] = [
      profileCreated(),
      ...answeredEveryQuestion(6),
      {
        eventId: 'e-old-unlock',
        profileId: 'profile-1',
        occurredAt: NOW - 60_000,
        type: 'unlock-granted',
        targetId: 'creature-anglerfish',
        kind: 'creature',
        reason: 'session-0',
      },
    ]
    const result = grantRewards(input({ events: alreadyGranted }))
    expect(result.granted).toBe(true)
    expect(result.unlockGrantedEvents.map((event) => event.targetId)).toEqual(['zone-twilight'])
    // 未重复发放的 targetId 不出现在任何新事件里。
    expect(result.events.some((event) => event.type === 'unlock-granted' && event.targetId === 'creature-anglerfish')).toBe(
      false,
    )
  })

  it('生物与区域都已解锁过时只产 session-completed，不再产 unlock-granted', () => {
    const events: DomainEvent[] = [
      profileCreated(),
      ...answeredEveryQuestion(9),
      {
        eventId: 'e-old-1',
        profileId: 'profile-1',
        occurredAt: NOW - 60_000,
        type: 'unlock-granted',
        targetId: 'creature-anglerfish',
        kind: 'creature',
        reason: 'session-0',
      },
      {
        eventId: 'e-old-2',
        profileId: 'profile-1',
        occurredAt: NOW - 60_000,
        type: 'unlock-granted',
        targetId: 'zone-twilight',
        kind: 'zone',
        reason: 'session-0',
      },
    ]
    const result = grantRewards(input({ events }))
    expect(result.granted).toBe(true)
    expect(result.unlockGrantedEvents).toEqual([])
    expect(result.sessionCompletedEvent).not.toBeNull()
  })
})

describe('domain/reward: 未完成整组不得发奖', () => {
  it('还有题没答完时不产 any 事件', () => {
    // 9 题只答了 5 题：整组未完成，一个奖励都不发。
    const events = [profileCreated(), ...QUESTION_IDS.slice(0, 5).map((id) => independentAnswer(id))]
    const result = grantRewards(input({ events }))
    expect(result.granted).toBe(false)
    expect(result.events).toEqual([])
    expect(result.rewards).toEqual([])
    expect(result.sessionCompletedEvent).toBeNull()
  })

  it('历史里已有 unlock-granted 时，未完成整组也不得新增解锁', () => {
    const events: DomainEvent[] = [
      profileCreated(),
      ...QUESTION_IDS.slice(0, 5).map((id) => independentAnswer(id)),
      {
        eventId: 'e-old-1',
        profileId: 'profile-1',
        occurredAt: NOW - 60_000,
        type: 'unlock-granted',
        targetId: 'creature-anglerfish',
        kind: 'creature',
        reason: 'session-0',
      },
    ]
    const result = grantRewards(input({ events }))
    expect(result.granted).toBe(false)
    expect(result.events).toEqual([])
  })
})

describe('domain/reward: 确定性与纯函数契约', () => {
  it('注入稳定 ID factory 后同一入参反复调用得到同一结果', () => {
    const first = grantRewards(input())
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(JSON.stringify(grantRewards(input()))).toBe(JSON.stringify(first))
    }
  })

  it('源码中不存在随机源（Math.random）', () => {
    const source = rewardGrantSource
    expect(source).not.toContain('Math.random')
  })

  it('源码中不存在回退/撤销类事件字样', () => {
    // 两个模块都不该出现 `revoked` 子串——注释里写它也算语义回流。
    for (const source of [rewardGrantSource, unlockRulesSource]) {
      expect(source).not.toContain('revoked')
      expect(source).not.toContain('REVOKED')
    }
  })

  it('不修改入参事件数组与其中事件', () => {
    const events = [profileCreated(), ...answeredEveryQuestion(6)]
    const frozen = Object.freeze([...events.map((event) => Object.freeze({ ...event }))])
    const snapshot = JSON.stringify(frozen)
    grantRewards(input({ events: frozen }))
    expect(JSON.stringify(frozen)).toBe(snapshot)
    expect(frozen).toHaveLength(events.length)
  })

  it('其他档案与往次会话的事件不干扰计数', () => {
    const foreignProfile: AnswerSubmittedEvent = {
      ...independentAnswer('q-x'),
      profileId: 'profile-2',
      eventId: 'e-other-profile',
    }
    const foreignSession: AnswerSubmittedEvent = {
      ...independentAnswer('q-y'),
      sessionId: 'session-0',
      eventId: 'e-other-session',
    }
    const events: DomainEvent[] = [
      profileCreated(),
      ...answeredEveryQuestion(6),
      foreignProfile,
      foreignSession,
    ]
    const result = grantRewards(input({ events }))
    expect(result.rewards).toContain('independent-mastery')
    // 反向：把本题组的独立答对压到 3 题时，外来事件也不该把徽章顶出来。
    const weak = grantRewards(input({ events: [profileCreated(), ...answeredEveryQuestion(3)] }))
    expect(weak.rewards).not.toContain('independent-mastery')
  })
})
