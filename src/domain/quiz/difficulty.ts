import type { Difficulty, DifficultyFallbackEvent, DomainEvent, MasteryState, QuestCategory } from '../model/types'
import { classifyStreakSignal } from './streakSignal'

/**
 * `src/domain/quiz/difficulty` —— 难度自适应与档位回落。
 *
 * 职责对应 design §3「难度自适应」：由该档案近 7 天事件算出当前难度档，
 * 并在目标档题量不足时决定回落到哪个相邻档。
 *
 * 本模块**不接触题目池本身**：它既不遍历 `pool`，也不知道 `Question` 长什么样
 * ——「哪些题算可用」由 `buildDailyQuest` 按 `category` 切池后，把各档题数交给
 * {@link resolveEffectiveDifficulty}。唯一与题目相关的导出是
 * {@link isMastered}（「独立/稳定掌握的题不再出」的判定），它是被 `buildDailyQuest`
 * 在分区时调用的谓词，而不是本模块自己去筛池子。因此这里零依赖（不 import
 * Vue、不触碰浏览器/Node 全局），可在 Node 下被直接单测。
 *
 * 与 `buildDailyQuest` 的分工之所以这样切：档位决策是纯数字运算（clamp、
 * streak、相邻档选择），取题是集合运算（分区、排除已掌握、排序）。两者变化
 * 的原因不同——公式调整不该牵连取题逻辑，反之亦然。
 */

/** 难度档位取值（1 见习训练师 / 2 深海训练师 / 3 探险大师）。 */
const DIFFICULTY_TIERS = [1, 2, 3] as const satisfies readonly Difficulty[]

/** 难度下限：新手档，MUST NOT 被跌破。 */
const MIN_DIFFICULTY = 1

/** 难度上限：探险大师档。 */
const MAX_DIFFICULTY = 3

/**
 * 「连续首次独立答对」的升档门槛：连够 3 次才升一档。
 *
 * 对应 spec「题型与难度覆盖 §连续答对升档」——「在同一题组内连续 3 题首次
 * 独立答对」上调一档。取 3 而不是 2：2 连在小学段属于正常波动，一次升档
 * 会让孩子在状态最好的时候被推到超出最近发展区的题，随后连续降档反而
 * 造成档位抖动。
 */
const CORRECT_STREAK_FOR_UPGRADE = 3

/**
 * 「连续提示后才答对」的降档门槛：连够 2 次才降一档。
 *
 * 对应 spec「题型与难度覆盖 §连续答错降档」——「连续 2 题需要提示后才答对」
 * 下调一档或补基础例题。取 2 而不是 3：需要提示是明确的求助信号，连续两次
 * 说明当前档已持续超出孩子的独立解题能力，应当比升档更快地给出回应。
 */
const HINTED_STREAK_FOR_DOWNGRADE = 2

/**
 * 默认历史窗口：7 天。
 *
 * design §3「读取该档案近 **7 天**事件 → 计算当前难度档」。命名成常量并允许
 * 调用方注入 `windowDays`，是为了让窗口长度成为可调策略而不是散落在实现里
 * 的魔法数字——Task 6 事件流接入后，窗口天数可能随教学策略调整。
 */
const DEFAULT_WINDOW_DAYS = 7

/** 一天的毫秒数。窗口计算只引用这一处，避免多处写 `86400000` 后改漏。 */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 难度自适应的输入。
 *
 * **与 `tasks.md` Task 4 GREEN 原文的差异**：任务书写的是「依据 masteryByTopic
 * 事件摘要计算档位」，而这里收的是**全量 `events` 数组**、不接收 `masteryByTopic`
 * 摘要。依据有两条：
 * 1. `design.md §3` 的原文只写「读取该档案近 7 天**事件** → 计算当前难度档」，
 *    没有提到任何摘要结构——design 是冻结产物，任务书是它的执行拆分；
 * 2. `masteryByTopic` 是 design §2 投影表里的一项，属于 **Task 6 `replayProjections`
 *    的产物**。此时它还不存在，若按任务书措辞先造一个摘要结构，等 Task 6 落地
 *    时必然出现两套并存的表示，而后改的那套会悄悄漂移。
 *
 * 因此这里直接吃事件，把「投影长什么样」的耦合整段推迟到 Task 6——届时若摘要
 * 结构变化，改的是重放层而不是本函数签名。
 *
 * `now` **必填而非默认取 `Date.now()`**：时间是不可注入的隐式状态，一旦有
 * 默认值，「同输入必同输出」的确定性就断了——测试固定 `now` 也必须能覆盖
 * 到默认路径。
 */
export interface DifficultyHistory {
  /** 档案 ID；只统计属于该档案的事件。 */
  profileId: string
  /** 该档案的事件流（全量，内部按 profileId 与窗口过滤）。 */
  events: readonly DomainEvent[]
  /** 「现在」（Unix 毫秒），7 天窗口的比较基准，由调用方注入。 */
  now: number
  /** 基准档位（自适应前的档）。缺省 1——新档案从见习训练师起步。 */
  baseDifficulty?: Difficulty
  /** 历史窗口天数，缺省 {@link DEFAULT_WINDOW_DAYS}。 */
  windowDays?: number
}

/**
 * 档位回落决策的结论。
 *
 * `fallback: false` 有两种互斥含义，调用方无需区分也不需要区分：一是目标档
 * 题量充足（正常出题），二是目标档已是题库中最富的一档、只能靠重复取题填满
 * （见 {@link resolveEffectiveDifficulty}）。两者都不会产生 `difficulty-fallback`
 * 事件——后者的重复由 `repeatCount` 记录，把它记成「难度回落」会在家长报告里
 * 留下无法归因的假记录。
 */
export interface EffectiveDifficulty {
  /** 生效档位。 */
  difficulty: Difficulty
  /** 是否发生了回落（决定是否写 `difficulty-fallback` 事件）。 */
  fallback: boolean
}

/**
 * 归一化到合法档位范围。
 *
 * 单独立成函数而非内联：公式 `base + bonus - penalty` 的每一项都可能把结果
 * 推出 1..3（例如 3 档孩子又连对 3 题），clamp 是这条公式不可省略的一步。
 * 用 `Math.min/Math.max` 而不是 if 链，边界取 {@link MIN_DIFFICULTY} /
 * {@link MAX_DIFFICULTY} 两个常量。
 */
function clampDifficulty(value: number): Difficulty {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, value)) as Difficulty
}

/**
 * 「连续独立答对」等连击判定已抽到共享真源 {@link classifyStreakSignal}
 * （`quiz/streakSignal`）。
 *
 * 原先这里有一对私有谓词 `isIndependentCorrect` / `isHintedCorrect`，
 * 但它们与 `mastery/masteryStateMachine` 的口径是两份平行实现——Task 6
 * 重放会同时喂给两边，任何一边悄悄改判定都会让 `replayProjections` 与
 * `computeCurrentDifficulty` 对同一段流的连击数给出不同答案。故删除私有
 * 副本，改由 {@link classifyStreakSignal} 统一供数：本模块只保留难度特有
 * 的「提示连击」与门槛计算，不再自己判断一次答题算不算独立。
 */

/**
 * 计算该档案的当前难度档（design §3 难度自适应公式）。
 *
 * ```
 * currentDifficulty = clamp(baseDifficulty + correctStreakBonus - wrongStreakPenalty, 1, 3)
 * ```
 *
 * 两项修正各只可能是 ±1（design 原文的「上限 +1 / 下限 −1」），由门槛常量
 * {@link CORRECT_STREAK_FOR_UPGRADE} / {@link HINTED_STREAK_FOR_DOWNGRADE} 控制
 * 是否触发，因此连对 9 题也只会 +1，不会连跳两档。
 *
 * 连击的推进规则（按事件时间正序单次遍历），判定统一来自共享真源
 * {@link classifyStreakSignal}：
 * - 首次独立答对 → 独立连击 +1，提示连击清零
 * - 提示后才答对 → 提示连击 +1，独立连击清零
 * - 答错 / 看答案 / **重试后才答对** / **订正完成** → 两者都清零（连击断了
 *   就是断了，不保留一半；“改过错才算会”、订正过才算完，都不计入连续独立答对）
 * - `hint-used` 等非答题流程事件 → ignored，读了也不影响档位（否则展开一次
 *   提示就会把「提示后答对」的连击清零，降档永远触发不了）
 *
 * **与 mastery 的对齐**：这里对「订正完成」从 ignored 改为 breaker（过去两
 * 处口径不一致会让 Task 6 重放给出两个独立连击数）。判定函数已抽到
 * {@link classifyStreakSignal} 由本模块与 `mastery/masteryStateMachine` 共用，
 * 详情与对拍测试见 `tests/domain/quiz/streakSignal.test.ts` 与
 * `streakConsistency.test.ts`。本模块只保留难度特有的「提示连击」与门槛计算。
 *
 * 只要末态连击数达标就触发修正，因此「前 2 连独立 + 答错 + 1 连独立」的
 * 末态是 1 连，不升档——这正是 spec「连续答对升档」里「连续」二字的含义。
 *
 * @param history 见 {@link DifficultyHistory}。
 * @returns clamp 后的当前难度档。
 */
export function computeCurrentDifficulty(history: DifficultyHistory): Difficulty {
  const { profileId, events, now } = history
  const baseDifficulty = history.baseDifficulty ?? MIN_DIFFICULTY
  const windowDays = history.windowDays ?? DEFAULT_WINDOW_DAYS
  const windowStart = now - windowDays * DAY_MS

  // 单次过滤出本档案在窗口内的事件，再按时间正序遍历。
  // `filter` 已返回新数组，因此可以直接 `sort`，不会改写调用方的入参。
  const recent = events
    .filter((event) => event.profileId === profileId && event.occurredAt >= windowStart)
    .sort((left, right) => left.occurredAt - right.occurredAt)

  let independentStreak = 0
  let hintedStreak = 0

  for (const event of recent) {
    // 连击判定走共享真源（与 mastery/masteryStateMachine 同一处），本模块只
    // 在信号之上叠加「难度特有」的提示连击与门槛。ignored（hint-used /
    // session-* 等流程事件）直接跳过：展开提示不等于失败，若它打断连击，
    // 「连续提示后答对降档」永远攒不到 2 连。
    const signal = classifyStreakSignal(event)

    if (signal === 'independent') {
      independentStreak += 1
      hintedStreak = 0
      continue
    }

    if (signal === 'hinted') {
      hintedStreak += 1
      independentStreak = 0
      continue
    }

    // breaker：答错、看答案、改错后才对、订正完成——这几种都清零两种连击。
    // 一次失败、直接求助、要改错才碰中、或订正过才算完，都说明这题不是
    // 「独立」会的，半个连击不该留到下一次。ignored 不进入此分支。
    if (signal === 'breaker') {
      independentStreak = 0
      hintedStreak = 0
    }
  }

  const upgrade = independentStreak >= CORRECT_STREAK_FOR_UPGRADE ? 1 : 0
  const downgrade = hintedStreak >= HINTED_STREAK_FOR_DOWNGRADE ? 1 : 0

  return clampDifficulty(baseDifficulty + upgrade - downgrade)
}

/** 各难度档的可用题数（已排除已掌握题之后）。 */
export type DifficultyCounts = Readonly<Record<Difficulty, number>>

/**
 * 决定实际取题的档位：目标档题量**不足所需题数**时回落到相邻档。
 *
 * 判定基准是 `needed`（该槽位要取几道题）而不是「有没有题」：spec「题型与难度
 * 覆盖」写的是「上调后的档位在候选题型中**不足所需题数** → 从相邻档位补齐」。
 * 若按「有一题就算够」判定，2 档只剩 1 道题时会用这一道题把 5 个基础槽位填满
 * ——孩子将连续做 5 遍同一道题。那种重复是题库枯竭的信号，应当先尝试换档。
 *
 * 回落顺序固定为 **目标档 → 相邻低档 → 相邻高档**（目标 2 时依次试 2、1、3），
 * 取第一个能凑够 `needed` 题的档。先低后高的理由：回落的语义是「题不够了，
 * 别难为孩子」——低一档至少保证在孩子能独立完成的范围内，而高档题可能超出
 * 其最近发展区；spec「连续答错降档」允许的处置也正是「下调一档或补基础例题」。
 *
 * 若**没有任何一档**能凑够 `needed`（题库整体短缺），取题数最多的那一档
 * （并列时取顺序中更靠前的，即更接近目标档的一侧）：这样把必然发生的重复
 * 摊到题量最大的池子里，孩子至少能见到更多不同的题。此时若选中的就是
 * 目标档，`fallback` 仍为 `false`——没有换档，重复由调用方的 `repeatCount`
 * 记录，不该伪装成一次难度回落。
 *
 * @param requestedDifficulty 自适应算出的目标档位。
 * @param counts 各档可用题数，key 为档位 1..3。
 * @param needed 该槽位需要取几题（`settings` 的三类数量之一）。
 */
export function resolveEffectiveDifficulty(
  requestedDifficulty: Difficulty,
  counts: DifficultyCounts,
  needed: number,
): EffectiveDifficulty {
  // 目标档 → 相邻低档 → 相邻高档：按「与目标档的距离」排序，距离相等时
  // **显式**取低档（不能只依赖 sort 的稳定性——那会让"低档优先"变成一条
  // 没人写下来的隐含约定，重构排序字段时悄无声息地失效）。
  const order = [...DIFFICULTY_TIERS].sort((left, right) => {
    const byDistance = Math.abs(left - requestedDifficulty) - Math.abs(right - requestedDifficulty)
    return byDistance !== 0 ? byDistance : left - right
  })

  for (const difficulty of order) {
    if (counts[difficulty] >= needed) {
      return { difficulty, fallback: difficulty !== requestedDifficulty }
    }
  }

  // 无一档够用：取题数最多者，并列时顺序中更靠前（离目标档更近）者胜出。
  let best: Difficulty = requestedDifficulty
  for (const difficulty of order) {
    if (counts[difficulty] > counts[best]) {
      best = difficulty
    }
  }

  return { difficulty: best, fallback: best !== requestedDifficulty }
}

/**
 * 生成 `difficulty-fallback` 事件。
 *
 * 事件的公共字段（`eventId` / `occurredAt`）由调用方传入——`idGenerator` 与
 * `clock` 是 design §1 的两个注入点，本模块不直接引用 `crypto.randomUUID()`
 * 或 `Date.now()`，否则 domain 层会依赖宿主全局，「注入固定时钟与 ID 发生器
 * 时同输入必同输出」这条回归锁定就无从谈起。
 *
 * `reason` 在这里生成而不是由调用方拼字符串：家长报告只认一种文案口径。
 * 文案包含回落前后的两个档位与槽位类别，足以让报告说明「为什么今天的题看
 * 起来偏易」。**不含任何对孩子能力的评价**——回落是题库容量事实，不是孩子
 * 的失败。
 */
export function createDifficultyFallbackEvent(input: {
  eventId: string
  occurredAt: number
  profileId: string
  sessionId: string
  requestedDifficulty: Difficulty
  actualDifficulty: Difficulty
  category: QuestCategory
}): DifficultyFallbackEvent {
  const { eventId, occurredAt, profileId, sessionId, requestedDifficulty, actualDifficulty, category } = input

  return {
    eventId,
    profileId,
    occurredAt,
    type: 'difficulty-fallback',
    sessionId,
    requestedDifficulty,
    actualDifficulty,
    category,
    reason: `${requestedDifficulty} 档${category}题量不足，改取 ${actualDifficulty} 档补齐`,
  }
}

/** 题目在某维度上的掌握状态摘要（由 Task 6 重放产出，这里只消费）。 */
export type MasteryByQuestion = Readonly<Record<string, MasteryState>>

/** 「已独立掌握」的两种状态：题不能再出，避免重复刷同一道题。 */
const MASTERED_LEVELS: readonly MasteryState['level'][] = ['independent', 'stable']

/**
 * 判断一道题是否已独立掌握（独立 / 稳定掌握），即 MUST NOT 再进入当日题组。
 *
 * spec「每日题组生成」的不重复规则：`masteryByQuestion` 中状态为独立/稳定
 * 掌握的题要排除。没有记录（`unmastered` 或 `hinted`）的题都算可用——
 * `hinted` 说明孩子还需要提示，正是需要再练的题，排除它等于把最需要练习
 * 的题藏起来。
 *
 * @param questionId 题目 ID。
 * @param masteryByQuestion 题目级掌握状态摘要；缺省视为没有掌握记录。
 */
export function isMastered(questionId: string, masteryByQuestion?: MasteryByQuestion): boolean {
  if (masteryByQuestion === undefined) {
    return false
  }

  const level = masteryByQuestion[questionId]?.level
  return level !== undefined && MASTERED_LEVELS.includes(level)
}
