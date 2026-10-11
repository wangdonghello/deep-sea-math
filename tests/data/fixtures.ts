/**
 * 仓储测试共用的测试夹具（fixture）。
 *
 * 只造**最小合法**对象：仓储层必须与 `domain/` 的值对象形态对齐（同名字段、
 * 可结构化克隆），所以这里手写字段而不是 from json —— 让"模型改了但仓储
 * 没跟上"由编译期暴露，而不是运行时才发现 keyPath 写错。
 */
import type {
  DomainEvent,
  HintUsedEvent,
  Profile,
  Settings,
} from '../../src/domain/model/types'

/** 档案 A（隔离用例里的"本档案"）。 */
export const PROFILE_A = 'profile-a'

/** 档案 B（隔离用例里的"他档案"）。 */
export const PROFILE_B = 'profile-b'

/** 基准时间（Unix 毫秒），固定值保证断言可复现。 */
export const NOW = 1_700_000_000_000

/** 造一条 `profile-created` 事件（不含任何投影副作用）。 */
export function profileCreatedEvent(
  profileId: string,
  eventId = `event-profile-${profileId}`,
): DomainEvent {
  return {
    eventId,
    profileId,
    occurredAt: NOW,
    type: 'profile-created',
    nickname: '小深',
    avatarId: 'submarine',
    pinHash: 'a'.repeat(64),
    salt: 'b'.repeat(16),
  }
}

/** 造一条 `session-started` 事件（带 `sessionId`，四类答题事件的载体）。 */
export function sessionStartedEvent(
  profileId: string,
  eventId = `event-session-${profileId}`,
): DomainEvent {
  return {
    eventId,
    profileId,
    occurredAt: NOW + 1,
    type: 'session-started',
    sessionId: `session-${profileId}`,
    questionIds: ['q-1', 'q-2'],
    difficultyTrace: [1, 2],
  }
}

/** 造一条 `answer-submitted` 事件。 */
export function answerSubmittedEvent(
  profileId: string,
  eventId = `event-answer-${profileId}`,
): DomainEvent {
  return {
    eventId,
    profileId,
    occurredAt: NOW + 2,
    type: 'answer-submitted',
    sessionId: `session-${profileId}`,
    questionId: 'q-1',
    submitted: '6',
    correct: true,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 1200,
  }
}

/** 造一条 `settings-updated` 事件（逻辑组合键为 null，只能按 eventId 去重）。 */
export function settingsUpdatedEvent(
  profileId: string,
  eventId = `event-settings-${profileId}`,
): DomainEvent {
  return {
    eventId,
    profileId,
    occurredAt: NOW + 3,
    type: 'settings-updated',
    basicCount: 4,
    appliedCount: 2,
    probeCount: 1,
    maxMinutes: 15,
  }
}

/**
 * 造一批**同一毫秒**的 `hint-used` 事件。
 *
 * `hint-used` 的每个 `level` 都是独立的逻辑组合键（见 `appendEvents`），因此
 * 同毫秒的多条不会互相去重——正是排序测试需要的形状。`eventId` 刻意取
 * 与写入次序**倒序**的字母序，这样"按 eventId 排"和"按写入次序排"会给出
 * 相反结果，测试才有鉴别力。
 *
 * @param count 事件条数。
 * @param occurredAt 共用的时间戳。
 * @param eventIds 每条事件的 eventId；缺省按 `z0`…`zN` 倒序字母生成。
 * @param levelOffset 提示层级偏移：让不同批次拿到互不冲突的逻辑组合键
 *   （`appendEvents` 按 `sessionId+questionId+level` 去重，两批都从 level 1
 *   起算会被判成同一次操作，只剩一条）。
 */
export function sameMillisecondHints(
  count: number,
  occurredAt: number = NOW,
  eventIds?: string[],
  levelOffset = 0,
): DomainEvent[] {
  return Array.from({ length: count }, (_unused, index) => {
    const eventId = eventIds?.[index] ?? `z${String.fromCharCode(90 - index)}`
    return {
      eventId,
      profileId: PROFILE_A,
      occurredAt,
      type: 'hint-used',
      sessionId: `session-${PROFILE_A}`,
      questionId: 'q-1',
      level: levelOffset + index + 1,
    } satisfies HintUsedEvent
  })
}

/** 造一个档案对象。 */
export function makeProfile(id: string = PROFILE_A): Profile {  return {
    id,
    nickname: '小深',
    avatarId: 'submarine',
    pinHash: 'c'.repeat(64),
    salt: 'd'.repeat(16),
    createdAt: NOW,
  }
}

/** 造一份家长设置。 */
export function makeSettings(): Settings {
  return { basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 }
}
