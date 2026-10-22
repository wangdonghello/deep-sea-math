import { advanceQuestionMastery, advanceTopicMastery } from '../mastery/masteryStateMachine'
import type { AnswerEvent, DomainEvent, MasteryState, QuizType } from '../model/types'

/**
 * `src/domain/eventLog/replay` —— 由事件重建全部投影。
 *
 * spec `offline-event-log` §投影可由事件重建：「档案视图所需的派生状态 SHALL
 * 由事件日志投影生成，且 MUST 可由事件日志完整重建」。design §2 的六张投影
 * 表全部在这里一次 fold 出来：
 *
 * | 投影 | 键 | 来源事件 |
 * |---|---|---|
 * | `questProgress` | `sessionId` | `session-started` / 四类答题事件 / `session-completed` |
 * | `masteryByQuestion` | `questionId` | 四类答题事件（复用 Task 5 状态机） |
 * | `masteryByTopic` | `QuizType` | 同上（题型级轨道） |
 * | `mistakeBook` | `questionId` | `answer-submitted`(错) / `answer-revealed` / `correction-done` |
 * | `bestiaryUnlock` | `kind:targetId` | `unlock-granted` / `session-completed`（追加型） |
 * | `dailyQuestIndex` | UTC 日期键 | `session-started`（后者覆盖，见实现处说明） |
 *
 * **事件是唯一事实来源**：本函数不接收任何既有投影入参，输出完全由
 * `events` 决定。因此「清空投影缓存仍可恢复」不是额外代码路径，而是这个
 * 纯函数签名的直接推论——缓存存不存在，重放结果都一样。
 *
 * 实现立场：
 * 1. **一次 reduce 折叠全量事件**，事件在内存里批量处理；绝不在循环里做
 *    I/O 或逐条查询存储（design Constitution Check「事件重放使用 getAll
 *    一次取全量后在内存 reduce」）。Task 9 的仓储负责把事件一次取回来。
 * 2. **掌握状态迁移一律复用 Task 5 的 `advanceQuestionMastery` /
 *    `advanceTopicMastery`**，本模块不另写一套迁移规则——两套规则必然漂移，
 *    而那会让「重放结果」与「答题当时的状态」分叉。
 * 3. **不改写入参**：事件数组与事件对象都只读；投影里的数组全部是新数组。
 */

/** 重放的可选入参。 */
export interface ReplayOptions {
  /**
   * 档案 ID。传入时只重放该档案的事件（档案间数据隔离边界）。
   *
   * 缺省表示调用方已经按档案筛过（Task 9 的 `eventRepo` 按 `profileId`
   * 查询），此时按单档案事件流处理。
   */
  profileId?: string
  /**
   * `questionId → QuizType` 查询表（题型级掌握投影的唯一来源）。
   *
   * 事件本身不带题型（`model/types` 的答题事件只有 `questionId`），题型级
   * 轨道必须由调用方补上题目元数据。**查不到题型的题目不进入题型轨**，
   * 题目轨不受影响——宁可少一票，也不要把 `mul-div` 的连击算到
   * `add-sub` 头上。
   */
  questionTypeById?: Readonly<Record<string, QuizType>>
}

/** 单个题组的进度（`questProgress` 投影的一项）。 */
export interface QuestProgress {
  readonly sessionId: string
  readonly profileId: string
  /** `session-started` 固定的题序（未收到该事件时为空数组）。 */
  readonly questionIds: readonly string[]
  /** 已提交过答案的题目 ID，按首次提交顺序去重。 */
  readonly answeredQuestionIds: readonly string[]
  /** 提交且判对的题目 ID（含提示后答对），按首次答对顺序去重。 */
  readonly correctQuestionIds: readonly string[]
  /** 提交且判错的题目 ID，按首次答错顺序去重。 */
  readonly wrongQuestionIds: readonly string[]
  /** 看过答案的题目 ID，按首次看答案顺序去重。 */
  readonly revealedQuestionIds: readonly string[]
  /** 已完成相似题订正的题目 ID，按首次订正顺序去重。 */
  readonly correctedQuestionIds: readonly string[]
  /** 本组展开提示的总次数。 */
  readonly hintCount: number
  /** 整组完成时间（Unix 毫秒）；未完成时为 `null`。 */
  readonly completedAt: number | null
}

/** 错题本的一条记录（`mistakeBook` 投影的一项）。 */
export interface MistakeEntry {
  readonly questionId: string
  /** 答错次数（同题多次答错累计）。 */
  readonly wrongCount: number
  /** 是否直接看过答案。 */
  readonly revealed: boolean
  /** 最近一次答错时间（Unix 毫秒）；只因看答案入册时为 `null`。 */
  readonly lastWrongAt: number | null
  /** 订正后是否已完成至少一条相似题。 */
  readonly corrected: boolean
  /** 已完成的相似题 ID，按完成顺序去重。 */
  readonly correctedSimilarQuestionIds: readonly string[]
}

/** 图鉴/区域解锁记录（`bestiaryUnlock` 投影的一项，追加型）。 */
export interface UnlockEntry {
  readonly targetId: string
  readonly kind: 'creature' | 'zone'
  /** 解锁原因（`sessionId`），来自事件本身。 */
  readonly reason: string
  /** 首次解锁时间（Unix 毫秒）；同一目标重复解锁不覆盖。 */
  readonly unlockedAt: number
}

/** 全部投影（design §2 投影表的类型化）。 */
export interface Projections {
  readonly questProgress: Readonly<Record<string, QuestProgress>>
  readonly masteryByQuestion: Readonly<Record<string, MasteryState>>
  readonly masteryByTopic: Readonly<Record<string, MasteryState>>
  readonly mistakeBook: Readonly<Record<string, MistakeEntry>>
  readonly bestiaryUnlock: Readonly<Record<string, UnlockEntry>>
  /** UTC 日期键（`YYYY-MM-DD`）→ 当日题组的 `sessionId`。 */
  readonly dailyQuestIndex: Readonly<Record<string, string>>
}

/**
 * reduce 的累加器（可变草稿）。
 *
 * 之所以用「内部草稿 + 末尾收敛为 readonly 投影」而不是每次返回深拷贝的
 * 不可变累加器：后者每步都要重建整张表，重放在几十万条事件的量级上是
 * O(n²)。草稿对象全程不逃逸出本模块，事件与调用方数据都不被触碰，
 * 纯函数契约（不改写入参）因此仍然成立。
 */
interface Draft {
  questProgress: Record<string, Mutable<QuestProgress>>
  masteryByQuestion: Record<string, MasteryState>
  masteryByTopic: Record<string, MasteryState>
  mistakeBook: Record<string, Mutable<MistakeEntry>>
  bestiaryUnlock: Record<string, UnlockEntry>
  dailyQuestIndex: Record<string, string>
}

/** 把 {@link QuestProgress} / {@link MistakeEntry} 的只读数组翻成可写数组。 */
type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer Item)[] ? Item[] : T[K]
}

/** 空进度草稿（题组事件先于 `session-started` 到达时也要有处可写）。 */
function emptyProgress(sessionId: string, profileId: string): Mutable<QuestProgress> {
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

/** 取（或建）某题组的进度草稿。 */
function progressOf(draft: Draft, sessionId: string, profileId: string): Mutable<QuestProgress> {
  const existing = draft.questProgress[sessionId]
  if (existing !== undefined) {
    return existing
  }
  const created = emptyProgress(sessionId, profileId)
  draft.questProgress[sessionId] = created
  return created
}

/** 取（或建）某题的错题草稿。 */
function mistakeOf(draft: Draft, questionId: string): Mutable<MistakeEntry> {
  const existing = draft.mistakeBook[questionId]
  if (existing !== undefined) {
    return existing
  }
  const created: Mutable<MistakeEntry> = {
    questionId,
    wrongCount: 0,
    revealed: false,
    lastWrongAt: null,
    corrected: false,
    correctedSimilarQuestionIds: [],
  }
  draft.mistakeBook[questionId] = created
  return created
}

/**
 * 双轨推进一次掌握迁移。
 *
 * 题型从 {@link ReplayOptions.questionTypeById} 查；查不到就只走题目轨。
 * `advanceQuestionMastery` / `advanceTopicMastery` 每次都返回**新的**
 * `MasteryState`，因此草稿里的记录不会被某个输入状态对象别名污染。
 */
function advanceMastery(
  draft: Draft,
  event: AnswerEvent,
  questionTypeById: Readonly<Record<string, QuizType>>,
): void {
  draft.masteryByQuestion[event.questionId] = advanceQuestionMastery(
    draft.masteryByQuestion[event.questionId],
    event,
  )
  const type = questionTypeById[event.questionId]
  if (type !== undefined) {
    draft.masteryByTopic[type] = advanceTopicMastery(draft.masteryByTopic[type], event)
  }
}

/**
 * 折叠单条事件进草稿（`reduce` 的回调）。
 *
 * 事件按 `events` 的数组顺序处理——**本函数不做重排序**：调用方传入的顺序
 * 就是写入顺序，逐事件增量维护也按同一顺序推进，两者才可能给出同一结果。
 * （若在这里按 `occurredAt` 重排，重放与增量的口径就会分叉：同一毫秒内的
 * 多条事件谁先谁后本没有标准答案，让调用方决定比让两个实现各自决定更诚实。）
 *
 * `session-started` 的题序**先到者胜**：同一 `sessionId` 重复到达（重试
 * 写入、或题组事件先于它到达）都不覆盖已固定的题序。索引同样先到者胜。
 */
function foldEvent(
  draft: Draft,
  event: DomainEvent,
  questionTypeById: Readonly<Record<string, QuizType>>,
): Draft {
  if (event.type === 'session-started') {
    const progress = progressOf(draft, event.sessionId, event.profileId)
    if (progress.questionIds.length === 0) {
      progress.questionIds.push(...event.questionIds)
    }
    const day = utcDayKey(event.occurredAt)
    /*
     * **后者覆盖**（最新的 `session-started` 胜出），而不是先到者胜。
     *
     * 这条规则是“内容变更后的自愈”开关：当日题组一旦生成就固定（spec
     * §刷新页面不换题），但如果那组题里存的是**当前题库已不存在的题目**
     * （典型场景：题库换版后，旧题组成了悬空引用），派生的当日题组就无法
     * 渲染。此时首页会把它视为“今天还没有题组”并允许重新领取，新题组写进
     * 日志后必须能顶掉那条悬空记录，否则孩子会被永久卡在一个取不出题的
     * 会话里（旧行为就是如此：索引先到者胜，新题组永远不可达）。
     *
     * 并发风险：两个标签页同时“领取”的窗口极短，且 `claimToday` 已有
     * `claiming` 闸门；万一真撞上，两条写入完成后两个标签页读到的都是**最新**
     * 那条（都重新投影），不会各看一组题，收敛性与先到者胜一致。
     */
    draft.dailyQuestIndex[day] = event.sessionId
    return draft
  }

  // 建档、家长改设置、档位回落不产生任何投影：它们是配置与解释性记录。
  if (
    event.type === 'profile-created' ||
    event.type === 'profile-preferences-updated' ||
    event.type === 'settings-updated' ||
    event.type === 'difficulty-fallback'
  ) {
    return draft
  }

  // `unlock-granted` 不带 `sessionId`（只带解锁原因 `reason`），因此不能挂到
  // 任何题组进度上，直接进追加型解锁表。
  if (event.type === 'unlock-granted') {
    grantUnlock(draft, event.targetId, event.kind, event.reason, event.occurredAt)
    return draft
  }

  const progress = progressOf(draft, event.sessionId, event.profileId)

  switch (event.type) {
    case 'answer-submitted': {
      advanceMastery(draft, event, questionTypeById)
      pushUnique(progress.answeredQuestionIds, event.questionId)
      if (event.correct) {
        pushUnique(progress.correctQuestionIds, event.questionId)
      } else {
        pushUnique(progress.wrongQuestionIds, event.questionId)
        const mistake = mistakeOf(draft, event.questionId)
        mistake.wrongCount += 1
        mistake.lastWrongAt = event.occurredAt
        // 重新答错意味着之前的订正作废，错题重新开放。
        mistake.corrected = false
      }
      return draft
    }
    case 'hint-used':
      progress.hintCount += 1
      return draft
    case 'answer-revealed': {
      advanceMastery(draft, event, questionTypeById)
      pushUnique(progress.revealedQuestionIds, event.questionId)
      const mistake = mistakeOf(draft, event.questionId)
      mistake.revealed = true
      // 再次求助表示订正作废：孩子看过答案就说明还没真正会。
      mistake.corrected = false
      return draft
    }
    case 'correction-done': {
      advanceMastery(draft, event, questionTypeById)
      pushUnique(progress.correctedQuestionIds, event.questionId)
      const mistake = mistakeOf(draft, event.questionId)
      mistake.corrected = true
      pushUnique(mistake.correctedSimilarQuestionIds, event.similarQuestionId)
      return draft
    }
    case 'session-completed': {
      progress.completedAt = event.occurredAt
      // 载荷里带的解锁与 `unlock-granted` 共用同一把追加型锁（kind:targetId），
      // 因此「先记 unlock-granted、后到 session-completed」不会重复计数。
      if (event.unlockedZone !== undefined) {
        grantUnlock(draft, event.unlockedZone, 'zone', event.sessionId, event.occurredAt)
      }
      if (event.unlockedCreature !== undefined) {
        grantUnlock(draft, event.unlockedCreature, 'creature', event.sessionId, event.occurredAt)
      }
      return draft
    }
  }
}

/** 去重追加（仅当不存在时 push）。 */
function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) {
    list.push(value)
  }
}

/**
 * 追加型解锁：同一个 `kind + targetId` 只记第一次。
 *
 * design §3「答错绝不回退：所有解锁事件为追加型，无 `unlock-revoked` 事件
 * 类型」——所以这里只可能「新增」，覆盖已解锁记录是反语义的。
 */
function grantUnlock(
  draft: Draft,
  targetId: string,
  kind: 'creature' | 'zone',
  reason: string,
  occurredAt: number,
): void {
  const key = `${kind}:${targetId}`
  if (draft.bestiaryUnlock[key] === undefined) {
    draft.bestiaryUnlock[key] = { targetId, kind, reason, unlockedAt: occurredAt }
  }
}

/**
 * 取 UTC 日期键。
 *
 * 刻意用 UTC 而不是宿主本地时区：`occurredAt` 是绝对时间，本地时区会让
 * 「今天是哪一天」随设备所在时区漂移——孩子跨时区（或家长手工改系统时间）
 * 时，同一份事件会得出不同的当日题组。UTC 日界让重放结果只取决于事件本身。
 */
function utcDayKey(occurredAt: number): string {
  return new Date(occurredAt).toISOString().slice(0, 10)
}

/** 空选题型表：缺省 `questionTypeById` 时复用同一个空对象，避免每轮新建。 */
const NO_QUESTION_TYPE: Readonly<Record<string, QuizType>> = {}

/**
 * 重放全部事件，产出 design §2 的六张投影。
 *
 * 计算是一次**单趟 reduce**：先（可选）按档案过滤，再 `foldEvent` 逐条折叠。
 * 时间 O(n)、额外空间 O(投影规模)，且循环内没有任何查询或 I/O——事件必须
 * 由调用方一次取全后传入（Task 9 仓储的 `getAll`）。
 *
 * @param events 事件日志（只读）。按写入顺序传入。
 * @param options 见 {@link ReplayOptions}。
 * @returns {@link Projections}。入参不被修改；同一份 `events` 重放必然得到
 *   与逐事件增量维护深度相等的结果。
 */
export function replayProjections(
  events: readonly DomainEvent[],
  options: ReplayOptions = {},
): Projections {
  const questionTypeById = options.questionTypeById ?? NO_QUESTION_TYPE
  const draft: Draft = {
    questProgress: {},
    masteryByQuestion: {},
    masteryByTopic: {},
    mistakeBook: {},
    bestiaryUnlock: {},
    dailyQuestIndex: {},
  }

  const scoped =
    options.profileId === undefined
      ? events
      : events.filter((event) => event.profileId === options.profileId)

  return scoped.reduce((accumulator, event) => foldEvent(accumulator, event, questionTypeById), draft)
}
