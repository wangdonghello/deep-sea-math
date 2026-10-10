/**
 * `src/domain/reward/rewardGrant` —— 奖励发放（事件装配 + 幂等）。
 *
 * 与 {@link evaluateRewardRules} 的分工：`unlockRules` 只回答「该发什么」，
 * 本模块回答「怎么落成事件、哪些已经发过不能重发」。四条核心规则：
 * 1. **追加型**：只产 `session-completed` 与 `unlock-granted` 两类事件，
 *    没有任何回退/撤销出口——答错绝不回退已解锁内容（design §3、spec
 *    `daily-math-quest` §整组完成与解锁）；
 * 2. **幂等**：同一题组重复完成不重复发奖。`session-completed` 按 `sessionId`
 *    比对、`unlock-granted` 按 `targetId` 比对既有事件（Task 9 仓储层的
 *    `eventId` 去重之外的第二道闸）；
 * 3. **确定**：不进随机源。`eventId` 与时间戳全部由调用方注入，同输入必得
 *    同输出（Task 6 重放可复现）；
 * 4. **纯函数**：不修改入参事件数组与其中事件，返回全新事件对象。
 */

import type { DomainEvent, SessionCompletedEvent, UnlockGrantedEvent } from '../model/types'

import { evaluateRewardRules, type RewardGrant } from './unlockRules'

/** 单次发奖调用的入参。 */
export interface RewardGrantInput {
  /** 档案 ID；事件隔离的边界。 */
  readonly profileId: string
  /** 所属当日题组（幂等比对与解锁原因都按它）。 */
  readonly sessionId: string
  /** 整组完成的客户端时间戳（Unix 毫秒），由注入的 `clock` 提供。 */
  readonly occurredAt: number
  /** `session-completed` 事件的 `eventId`（幂等键），由调用方注入。 */
  readonly eventId: string
  /** 本题组的题目标识顺序（与 `session-started` 的载荷一致）。 */
  readonly questionIds: readonly string[]
  /** 本档案既有事件全量（用于计独立答对率与去重比对）。 */
  readonly events: readonly DomainEvent[]
  /** 本题组对应的图鉴生物 id；缺省表示本次不下发图鉴卡。 */
  readonly creatureId?: string
  /** 完成后下潜到的区域 id；缺省表示本次不下发区域。 */
  readonly zoneId?: string
  /** 生成 `unlock-granted` 事件 id 的方式；缺省 `${eventId}-unlock-${kind}-${targetId}`。 */
  readonly unlockEventIdFactory?: (grant: RewardGrant) => string
}

/** 单次发奖的结果。 */
export interface RewardGrantResult {
  /** 本次是否真的产出了新事件（未完成或已发放过时为 false）。 */
  readonly granted: boolean
  /** 产出的 `session-completed` 事件；未发奖时为 `null`。 */
  readonly sessionCompletedEvent: SessionCompletedEvent | null
  /** 产出的 `unlock-granted` 事件（按求值顺序，且已按 targetId 去重）。 */
  readonly unlockGrantedEvents: readonly UnlockGrantedEvent[]
  /** 写进 `session-completed.rewards` 的徽章 id（按求值顺序）。 */
  readonly rewards: readonly string[]
  /** 本次全部新事件，追加序：`session-completed` 在前、`unlock-granted` 在后。 */
  readonly events: readonly DomainEvent[]
}

/** 未发奖时的空结果（含 `granted: false`），供两处提前返回复用。 */
const NOTHING_GRANTED: RewardGrantResult = {
  granted: false,
  sessionCompletedEvent: null,
  unlockGrantedEvents: [],
  rewards: [],
  events: [],
}

/**
 * 默认的 `unlock-granted` 事件 id 生成方式。
 *
 * 由 `eventId + kind + targetId` 确定性拼出而**不**用随机 UUID：同一题组的
 * 同一次发奖重复调用（刷新、离线重试）会得到同一事件 id，Task 9 的 `eventId`
 * 去重因此能把它们折叠成一条；而真的解锁了新生物（新题组）时 `eventId` 不同，
 * 事件 id 也不会撞。`kind` 进 id 是为了让 creature 与 zone 撞同一个 targetId
 * 时仍能区分（两条解锁是两次发放，不是一次）。
 */
function defaultUnlockEventId(eventId: string, grant: RewardGrant): string {
  return `${eventId}-unlock-${grant.kind}-${grant.targetId}`
}

/**
 * 带 `sessionId` 的事件子集。
 *
 * `DomainEvent` union 里 `profile-created` / `settings-updated` / `unlock-granted`
 * 没有 `sessionId` 字段，凡是要按会话过滤的地方都必须先把 union 收窄到这一子集，
 * 否则 `event.sessionId` 会因其中一类没有该字段而编译报错。
 */
type SessionScopedEvent = Extract<DomainEvent, { sessionId: string }>

/**
 * 「带 `sessionId` 的那几类」事件的类型集合（运行时真源）。
 *
 * 与 {@link SessionScopedEvent} 一一对应：compile 期的收窄靠类型谓词
 * {@link isSessionScoped}，运行期的判断靠这张表，两处共用同一份名单——漏掉
 * 一类事件的代价是「某类事件按会话统计时被静默忽略」，比编译报错更难发现。
 */
const SESSION_SCOPED_TYPES = new Set<DomainEvent['type']>([
  'session-started',
  'answer-submitted',
  'hint-used',
  'answer-revealed',
  'correction-done',
  'session-completed',
  'difficulty-fallback',
])

/**
 * 该事件是否属于「带 `sessionId` 的那几类」。
 *
 * 写成类型谓词而不是 `Set.has`：`Set.prototype.has` 不是类型守卫，TS 不会把
 * 判别属性收窄，`event.sessionId` 仍会在 union 上因 `ProfileCreatedEvent` 没有
 * 该字段而报错；谓词函数可以在收窄的同时保留 `type` 的判别能力。
 */
function isSessionScoped(event: DomainEvent): event is SessionScopedEvent {
  return SESSION_SCOPED_TYPES.has(event.type)
}

/**
 * 本题组中「首次独立答对」的题目数（按去重题计）。
 *
 * 独立答对 = 一次 `answer-submitted` 同时满足：`correct`、`usedHintLevel === 0`、
 * `retryCount === 0`（与 `mastery/classifyAnswerSignal`、`quiz/difficulty`
 * 的判定口径逐字一致——三处若漂移，答对率与难度自适应会给出互相矛盾的解释）；
 * 且该题**没有** `answer-revealed` 事件：直接看过答案的题即便后来又提交正确，
 * 也 MUST NOT 计独立掌握（spec `hint-and-correction` §直接看答案）。
 *
 * 只统计本次会话、本档案的事件：`sessionId` 与 `profileId` 双重过滤，外来
 * 事件既不抬答对率也不会让答对率失真。
 */
function countIndependentCorrect(
  sessionId: string,
  profileId: string,
  questionIds: readonly string[],
  events: readonly DomainEvent[],
): number {
  // 去重后的题目标识：题组可能因题池不足重复出同一题（见 buildDailyQuest 的
  // repeatCount），分子分母都按去重题计，重复出的同一题不得把答对率抬上去。
  const uniqueIds = new Set(questionIds)

  const revealed = new Set<string>()
  const independent = new Set<string>()
  for (const event of events) {
    if (event.profileId !== profileId || !isSessionScoped(event) || event.sessionId !== sessionId) {
      continue
    }
    if (event.type === 'answer-revealed') {
      revealed.add(event.questionId)
      continue
    }
    if (
      event.type === 'answer-submitted' &&
      event.correct === true &&
      event.usedHintLevel === 0 &&
      event.retryCount === 0
    ) {
      independent.add(event.questionId)
    }
  }

  let count = 0
  for (const questionId of uniqueIds) {
    if (!revealed.has(questionId) && independent.has(questionId)) {
      count += 1
    }
  }
  return count
}

/**
 * 发奖入口：求值奖励规则，装配成追加型事件。
 *
 * 执行顺序（任一步不满足即返回空结果，不产任何事件）：
 * 1. **幂等**：既有事件里已有同 `sessionId` 的 `session-completed` → 本题组
 *    已发放过，直接返回（重复完成不重复发奖）；
 * 2. **完成判定**：`questionIds` 里每一道题都有至少一条 `answer-submitted`
 *    事件，才算整组完成。**看答案不替代作答**——直接看答案可以继续学习，
 *    但要走完提交动作才计入题组进度（spec §直接看答案只豁免“计独立掌握”，
 *    不豁免“完成整组”）。未完成则一个奖励都不发；
 * 3. **求值**：按 {@link evaluateRewardRules} 顺序取本次应发奖励；
 * 4. **装配**：徽章进 `session-completed.rewards`；图鉴卡 / 区域产
 *    `unlock-granted` 事件，`targetId` 已在既有事件里出现过的跳过。
 *
 * `unlock-granted` 的 `kind` 只取 `creature` / `zone`（`model/types` 的定义
 * 如此），徽章没有对应事件类型——徽章信息全在 `session-completed.rewards`
 * 里，解锁动画按 `targetId` 反查。
 *
 * @param input 见 {@link RewardGrantInput}。
 * @returns 见 {@link RewardGrantResult}；入参不被修改。
 */
export function grantRewards(input: RewardGrantInput): RewardGrantResult {
  const { profileId, sessionId, events, questionIds } = input

  const sessionEvents = events.filter(
    (event) => event.profileId === profileId && isSessionScoped(event) && event.sessionId === sessionId,
  )

  // 1. 幂等：同一题组已发过奖就不再发（不重发徽章、不重复解锁）。
  const alreadyCompleted = sessionEvents.some((event) => event.type === 'session-completed')
  if (alreadyCompleted) {
    return NOTHING_GRANTED
  }

  // 2. 完成判定：本题组每道题都至少提交过一次答案。
  const answered = new Set<string>()
  for (const event of sessionEvents) {
    if (event.type === 'answer-submitted') {
      answered.add(event.questionId)
    }
  }
  const uniqueIds = [...new Set(questionIds)]
  const questCompleted = uniqueIds.length > 0 && uniqueIds.every((id) => answered.has(id))
  if (!questCompleted) {
    return NOTHING_GRANTED
  }

  // 3. 求值：该发什么（含 60% 门槛，分母是去重后的总题数）。
  const grants = evaluateRewardRules({
    totalQuestions: uniqueIds.length,
    answeredQuestions: answered.size,
    independentCorrect: countIndependentCorrect(sessionId, profileId, questionIds, events),
    questCompleted: true,
    creatureId: input.creatureId,
    zoneId: input.zoneId,
  })

  // 4a. 徽章 → session-completed.rewards（按求值顺序）。
  const rewards = grants.filter((grant) => grant.kind === 'badge').map((grant) => grant.targetId)

  const sessionCompletedEvent: SessionCompletedEvent = {
    eventId: input.eventId,
    profileId,
    occurredAt: input.occurredAt,
    type: 'session-completed',
    sessionId,
    rewards,
  }

  // 4b. 图鉴卡 / 区域 → unlock-granted 事件；targetId 已发放过的跳过。
  // 此处不需要 cast：filter 已按判别属性 `type` 收窄到 UnlockGrantedEvent。
  const grantedTargets = new Set(
    events
      .filter((event): event is UnlockGrantedEvent => event.type === 'unlock-granted')
      .map((event) => event.targetId),
  )
  const unlockEvents: UnlockGrantedEvent[] = []
  for (const grant of grants) {
    if (grant.kind !== 'creature' && grant.kind !== 'zone') {
      continue
    }
    if (grantedTargets.has(grant.targetId)) {
      continue
    }
    grantedTargets.add(grant.targetId)
    unlockEvents.push({
      eventId: input.unlockEventIdFactory
        ? input.unlockEventIdFactory(grant)
        : defaultUnlockEventId(input.eventId, grant),
      profileId,
      occurredAt: input.occurredAt,
      type: 'unlock-granted',
      targetId: grant.targetId,
      kind: grant.kind,
      reason: sessionId,
    })
  }

  return {
    granted: true,
    sessionCompletedEvent,
    unlockGrantedEvents: unlockEvents,
    rewards,
    events: [sessionCompletedEvent, ...unlockEvents],
  }
}
