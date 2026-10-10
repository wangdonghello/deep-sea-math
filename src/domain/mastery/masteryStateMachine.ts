import { MASTERY_LEVELS, type AnswerEvent, type MasteryLevel, type MasteryState } from '../model/types'

/**
 * `src/domain/mastery/masteryStateMachine` —— 掌握状态机（题目级 + 题型级双轨）。
 *
 * design §3 的迁移图：
 * ```
 * 未掌握 ──首次独立答对──▶ 独立掌握
 *    │                        │
 *    └──提示后答对──▶ 提示后掌握 ──连续3次同题型独立答对──▶（题型级）稳定掌握
 *    └──看答案──────▶ 提示后掌握（不得计独立掌握）
 * ```
 *
 * 三条贯穿本模块的约定：
 * 1. **双轨同构**：题目级与题型级跑的是同一套迁移逻辑，唯一差别是题型级
 *    多一个「连击满 3 进稳定」的门槛——「稳定掌握是题型级而非题目级」
 *    （design §3），题目轨永不进 stable。因此本模块对外只暴露一个核心
 *    函数 {@link applyMasteryTransition}，双轨靠可选的
 *    `stableStreakThreshold` 参数区分，而不是复制两份 if 分支。
 * 2. **等级只升不降**：答错、看答案、用提示后答对都会归零「独立连击」，
 *    但**不**把已有等级拉低。这与 design §3「答错绝不回退已解锁内容」的
 *    追加型语义一致——掌握等级是学习成果的估计，擦掉它等于惩罚孩子曾经的
 *    成功。归零连击 + 保留等级，正是「断了就是断了，但成果不抹」的落点。
 * 3. **连击与等级同一次产出**：`MasteryState.independentStreak` 与 `level`
 *    必须由同一次迁移算出（见 `model/types` 的 JSDoc），本模块所有导出都
 *    返回完整的新 `MasteryState`，绝不就地改写入参。
 */

/**
 * 由一条答题事件归一出的「迁移信号」。
 *
 * 之所以先归一再查表：一条 `AnswerEvent` 里混着判断维度（`correct` /
 * `usedHintLevel` / `retryCount`），先收敛成一个语义信号，后面的迁移逻辑
 * 就能完全脱离事件结构，只面对 5 个确定的取值。
 */
export type MasterySignal =
  /** 首次独立答对：未用提示、首次提交即对（与 `quiz/difficulty` 口径一致）。 */
  | 'independent'
  /** 提示后答对：展开了提示但仍答对。 */
  | 'hinted'
  /** 答错（含重试后才答对——改过错才算会，不计首次独立答对）。 */
  | 'wrong'
  /** 直接看答案。 */
  | 'reveal'
  /** 相似题订正完成。 */
  | 'correction'

/**
 * 迁移表的一行：某信号对应的目标等级与该信号是否推进「独立连击」。
 *
 * 纯数据，不含任何判断分支——等级被降级风险由 {@link applyMasteryTransition}
 * 里「只取更高秩」的收敛逻辑兜底，这里只声明「这次事件想达到哪、连击怎么走」。
 */
export interface MasteryTransition {
  /** 该信号欲达到的等级（实际生效等级再经只升不降收敛）。 */
  readonly target: MasteryLevel
  /** true 表示独立连击 +1；false 表示归零。 */
  readonly advancesStreak: boolean
}

/**
 * 掌握状态迁移表（spec `daily-math-quest` §掌握状态判定 的声明式固化）。
 *
 * 把它抽成纯数据结构而不是散落的 if 分支，理由有二：
 * 1. **一处真源**：五条迁移规则一眼看全，新增/调整信号只改这张表，不会
 *    漏改某条 if；
 * 2. **可测**：测试可直接断言表内容（见 masteryStateMachine.test.ts 的
 *    「MASTERY_TRANSITIONS 是纯数据」），把「规则本身」与「执行规则的代码」
 *    分开锁定。
 */
export const MASTERY_TRANSITIONS: Readonly<Record<MasterySignal, MasteryTransition>> = {
  independent: { target: 'independent', advancesStreak: true },
  hinted: { target: 'hinted', advancesStreak: false },
  wrong: { target: 'unmastered', advancesStreak: false },
  reveal: { target: 'hinted', advancesStreak: false },
  correction: { target: 'hinted', advancesStreak: false },
}

/**
 * 等级的有序刻度，用于「只升不降」比较。
 *
 * 用 {@link MASTERY_LEVELS}（`model/types` 的运行时真源）派生下标而不是另写
 * 一个数字映射：等级集合只有一处定义，`types.ts` 若调整语序，这里的秩会
 * 同步跟着变，不会悄悄和 union 类型脱钩。
 */
const LEVEL_RANK: Readonly<Record<MasteryLevel, number>> = MASTERY_LEVELS.reduce(
  (rank, level, index) => {
    rank[level] = index
    return rank
  },
  {} as Record<MasteryLevel, number>,
)

/**
 * 题型级「稳定掌握」门槛：同一题型连续 3 次独立答对。
 *
 * 取 3 对应 spec §掌握状态判定「连续 3 次独立答对同一题型」。之所以在
 * 题型级而不是题目级累计：题目被独立答对一次后就会被 `buildDailyQuest`
 * 排除（spec §每日题组生成），单题不可能也不应该靠重复刷到 3——把门槛放
 * 在题型级，孩子必须真正拿下三道同题型的不同题才算稳定，避免同一题反复
 * 刷分（design §3 原话）。
 */
export const STABLE_STREAK_THRESHOLD = 3

/**
 * 把一条答题事件归一为迁移信号；非答题/非迁移事件返回 `null`。
 *
 * **与 `quiz/difficulty` 的判定刻意保持一致**：`usedHintLevel === 0 &&
 * retryCount === 0 && correct` 才算独立答对。`retryCount > 0` 的「改过错
 * 才对」与 `answer-revealed` 都归为使连击断掉的信号——否则孩子会学到
 * 「乱填到对也算会」。
 *
 * `hint-used` 是流程事件（只是展开了一层提示，不是成败信号），返回 `null`
 * 让调用方跳过；`correction-done` 只作用于原题（见 {@link applyMasteryTransition}
 * 对相似题的说明），这里归一为 `correction` 信号。
 *
 * @param event 一条答题流程事件。
 * @returns 迁移信号，或 `null`（该事件不驱动掌握迁移）。
 */
export function classifyAnswerSignal(event: AnswerEvent): MasterySignal | null {
  switch (event.type) {
    case 'answer-submitted':
      if (event.correct !== true) {
        return 'wrong'
      }
      // 用提示后答对：展开了提示仍答对。与独立答对互斥，先判它。
      if (event.usedHintLevel > 0) {
        return 'hinted'
      }
      // 首次、未用提示、仍答对 → 独立答对；retryCount > 0 说明并非「一次就对」，
      // 归为 wrong（连击归零、不计独立）。
      return event.retryCount === 0 ? 'independent' : 'wrong'
    case 'answer-revealed':
      return 'reveal'
    case 'correction-done':
      return 'correction'
    case 'hint-used':
      // 展开提示是流程动作，不构成成败信号。
      return null
  }
}

/**
 * 核心迁移：给定当前状态与一个迁移信号，产出新的 {@link MasteryState}。
 *
 * 三步，全部由 {@link MASTERY_TRANSITIONS} 驱动、无散落分支：
 * 1. **查表**得目标等级与连击走向；
 * 2. **算连击**：`advancesStreak` 则 +1，否则归零；
 * 3. **收敛等级**：只取「当前」与「目标」中更高的一档（只升不降），再在
 *    题型轨上判定连击是否够进稳定。
 *
 * 「相似题只记录原题」在这里落地：`correction` 信号只把**当前这条轨道**
 * （调用方传入的原题轨）推到提示后掌握；`similarQuestionId` 指向的相似题
 * 状态由调用方（Task 6 重放）单独维护，本函数不替它做决定——spec §相似题
 * 订正明确「相似题状态单独记录，不受原题状态影响」。
 *
 * @param current 迁移前的状态；`undefined` 视为未掌握起步（新题/新题型）。
 * @param signal 迁移信号。
 * @param stableStreakThreshold 题型级「进稳定」的连击门槛；
 *    **题目级不传**（或传 `undefined`），题目轨永不进 stable——这是
 *    「稳定掌握是题型级而非题目级」的唯一开关。题型级传
 *    {@link STABLE_STREAK_THRESHOLD}。
 * @returns 全新的 {@link MasteryState}；`current` 不被修改。
 */
export function applyMasteryTransition(
  current: MasteryState | undefined,
  signal: MasterySignal,
  stableStreakThreshold?: number,
): MasteryState {
  const from = current ?? { level: 'unmastered', independentStreak: 0 }
  const transition = MASTERY_TRANSITIONS[signal]

  const independentStreak = transition.advancesStreak ? from.independentStreak + 1 : 0

  // 只升不降：目标秩不高于当前时保留当前等级。
  let level = LEVEL_RANK[transition.target] > LEVEL_RANK[from.level] ? transition.target : from.level

  // 题型轨专属：连击够门槛且当前停在「独立掌握」时，晋升稳定掌握。
  // 已经 stable 的不必重复晋升（stable 秩最高，只升不降已保证它留着）。
  if (
    stableStreakThreshold !== undefined &&
    transition.advancesStreak &&
    independentStreak >= stableStreakThreshold &&
    level === 'independent'
  ) {
    level = 'stable'
  }

  return { level, independentStreak }
}

/** 题目级掌握迁移：cap 在独立掌握，永不进稳定掌握。 */
export function advanceQuestionMastery(current: MasteryState | undefined, event: AnswerEvent): MasteryState {
  const signal = classifyAnswerSignal(event)
  // signal 为 null（如 hint-used）时原样返回，保证「读了一条不迁移的事件」
  // 也得到一个新对象而非共享引用。
  return signal === null ? { ...(current ?? { level: 'unmastered', independentStreak: 0 }) } : applyMasteryTransition(current, signal)
}

/** 题型级掌握迁移：连击满 {@link STABLE_STREAK_THRESHOLD} 次独立答对进稳定掌握。 */
export function advanceTopicMastery(current: MasteryState | undefined, event: AnswerEvent): MasteryState {
  const signal = classifyAnswerSignal(event)
  return signal === null
    ? { ...(current ?? { level: 'unmastered', independentStreak: 0 }) }
    : applyMasteryTransition(current, signal, STABLE_STREAK_THRESHOLD)
}
