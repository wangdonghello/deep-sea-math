/**
 * `src/domain/reward/unlockRules` —— 解锁与奖励规则（design §3 解锁规则）。
 *
 * spec 原文（`creature-bestiary` §解锁与奖励发放、`daily-math-quest`
 * §整组完成与解锁）：
 * - 完成整组题组 SHALL 解锁对应生物图鉴卡与区域下潜，必得徽章；
 * - 首次独立答对数 ≥ **总题数**的 60% 额外得「独立掌握徽章」；
 * - 答错 MUST NOT 撤销已解锁内容或清除已有经验 → 因此本模块所有产出都是
 *   **追加型**：只描述「要发什么」，没有任何“收回/撤销”语义的出口；
 * - 奖励 MUST NOT 依赖随机付费或抽卡 → 本模块不引入任何随机源，同一入参
 *   反复求值必得同一结果（Task 6 事件重放可复现）。
 *
 * 规则被抽成**可声明的 `RewardRule[]`**：每条规则是「条件（`when`）→ 奖励
 * （`grant`）」的纯数据描述，求值器 {@link evaluateRewardRules} 按序执行，
 * 自身不含任何 if 分支。调整奖励口径 = 改这张表，不必碰执行代码；测试亦可
 * 直接断言表结构（见 tests/domain/reward/unlockRules.test.ts）。
 */

/**
 * 奖励的三种发放形态（spec：宠物成长、图鉴观察权限、徽章）。
 *
 * `badge` 只落进 `session-completed` 事件的 `rewards` 字段；`creature` /
 * `zone` 会另产 `unlock-granted` 事件（`model/types` 里该事件的 kind 恰好
 * 只有这两种取值）。三者的差别在发放通道，不在“是不是奖励”。
 */
export const REWARD_KINDS = ['badge', 'creature', 'zone'] as const

/** 奖励发放形态，与 {@link REWARD_KINDS} 一一对应。 */
export type RewardKind = (typeof REWARD_KINDS)[number]

/**
 * 徽章 id 全集。
 *
 * 与 {@link REWARD_KINDS} 同一模式：`as const` 元组作为运行时真源，徽章 id
 * 只有一处定义，`rewardGrant` 装配 `rewards` 字段与测试断言都引用它。
 */
export const BADGE_IDS = ['quest-complete', 'independent-mastery'] as const

/** 徽章 id 字面量，与 {@link BADGE_IDS} 一一对应。 */
export type BadgeId = (typeof BADGE_IDS)[number]

/**
 * 「独立掌握徽章」的独立答对率门槛：总题数的 60%。
 *
 * 对应 design §3「首次独立答对数 ≥ 总题数的 60%」。写成常量而非散落的魔法
 * 数字：门槛是教学策略（可能随学段调整），要在测试里被显式钉住。
 */
export const INDEPENDENT_MASTERY_THRESHOLD = 0.6

/** 单个待发放的奖励描述（纯数据，不含事件字段；事件装配在 `rewardGrant`）。 */
export interface RewardGrant {
  /** 发放形态：徽章 / 图鉴卡 / 区域。 */
  readonly kind: RewardKind
  /** 奖励标识：徽章 id（{@link BADGE_IDS}）、生物 id 或区域 id。 */
  readonly targetId: string
  /** 面向孩子的展示名（UnlockOverlay 与家长报告共用）。 */
  readonly label: string
}

/**
 * 规则求值上下文：一次题组完成后的成绩快照（纯数据）。
 *
 * 只放「判定奖励需要什么」，不放事件结构——求值因此与 Task 6 的事件流解耦，
 * 也让「分母用哪个数」这类策略在调用方一次性决定后留下单一出处。
 */
export interface RewardContext {
  /** 总题数（去重后的题组长度），**60% 门槛的分母**。 */
  readonly totalQuestions: number
  /** 已完成（提交过）的题目数，仅用于诊断展示，不参与奖励判定。 */
  readonly answeredQuestions: number
  /** 首次独立答对数（未用提示、未看答案、未重试即答对，按去重题计）。 */
  readonly independentCorrect: number
  /** 整组是否已完成——**所有解锁的前置条件**。 */
  readonly questCompleted: boolean
  /** 本题组对应的图鉴生物 id；缺省表示调用方未提供目标生物。 */
  readonly creatureId?: string
  /** 完成后下潜到的区域 id；缺省表示调用方未提供目标区域。 */
  readonly zoneId?: string
}

/**
 * 一条可声明的奖励规则：「条件 → 奖励」的纯数据描述。
 *
 * `when` 与 `grant` 都是**纯函数**：只读 `context`、不碰随机源/时钟/全局，
 * 也不修改入参。`grant` 返回数组而不是单个奖励，是为了让「完成整组」这一
 * 次完成同时发放图鉴卡 + 徽章 + 区域下潜，而不必拆成三条共享同一条件的
 * 规则——条件是“整组完成”，不是“完成整组且要发徽章”。
 */
export interface RewardRule {
  /** 规则标识（稳定，供日志与家长报告归因）。 */
  readonly id: string
  /** 条件：返回 true 表示该规则此次生效。 */
  readonly when: (context: RewardContext) => boolean
  /** 奖励：条件成立时发放的全部奖励。 */
  readonly grant: (context: RewardContext) => readonly RewardGrant[]
}

/** 「整组完成」徽章展示名。 */
const QUEST_COMPLETE_LABEL = '整组完成徽章'

/** 「独立掌握」徽章展示名。 */
const INDEPENDENT_MASTERY_LABEL = '独立掌握徽章'

/** 图鉴卡的通道级展示名（具体生物名由 UI 层按 `targetId` 查表补齐）。 */
const CREATURE_LABEL = '生物图鉴卡'

/** 区域下潜的通道级展示名（具体区域名由 UI 层按 `targetId` 查表补齐）。 */
const ZONE_LABEL = '深海区域'

/**
 * 奖励规则表：spec §解锁与奖励发放 + design §3 的声明式固化。
 *
 * 按声明顺序求值，顺序即展示顺序（家长报告与解锁动画都按此序）。
 *
 * 两条规则的分工：
 * 1. `quest-complete`：整组完成的**基础奖励**——徽章 + 图鉴卡 + 区域下潜。
 *    三者共用同一个条件「整组完成」，因为它们是「完成一次题组」这一个教学
 *    动作的三种反馈通道，不是三个独立判定；
 * 2. `independent-mastery`：在基础奖励之上的**额外奖励**——独立答对率达到
 *    总题数 60% 才发。
 *
 * 表里没有任何“收回”条目：`model/types` 的 `EVENT_TYPES` 不含撤销类事件，
 * 奖励一旦发放只追加不回退（design §3「答错绝不回退」）。
 */
export const REWARD_RULES: readonly RewardRule[] = [
  {
    id: 'quest-complete',
    when: (context) => context.questCompleted,
    grant: (context) => {
      const grants: RewardGrant[] = [
        { kind: 'badge', targetId: 'quest-complete', label: QUEST_COMPLETE_LABEL },
      ]
      // 目标生物/区域由调用方提供（题组配置决定今天探索谁）。缺省时该通道
      // 不产奖励——本模块绝不凭空编一个生物或区域 id。
      if (context.creatureId !== undefined) {
        grants.push({ kind: 'creature', targetId: context.creatureId, label: CREATURE_LABEL })
      }
      if (context.zoneId !== undefined) {
        grants.push({ kind: 'zone', targetId: context.zoneId, label: ZONE_LABEL })
      }
      return grants
    },
  },
  {
    id: 'independent-mastery',
    // 前置条件同为「整组完成」：答对率再高，题组没做完就一个都不发
    // （tests：答对率再高，未完成整组也不发独立掌握徽章）。
    when: (context) =>
      context.questCompleted &&
      // 总题数为 0 时除法会得到 NaN（NaN >= 0.6 恒为 false，但显式短路更直白），
      // 且空题组本身没有任何“掌握”可言。
      context.totalQuestions > 0 &&
      context.independentCorrect / context.totalQuestions >= INDEPENDENT_MASTERY_THRESHOLD,
    grant: () => [
      { kind: 'badge', targetId: 'independent-mastery', label: INDEPENDENT_MASTERY_LABEL },
    ],
  },
]

/**
 * 按 {@link REWARD_RULES} 的声明顺序求值，返回本次应发放的全部奖励。
 *
 * 求值器本身不含任何奖励口径判断（“完成没完成”“够不够 60%”全在规则里），
 * 只做一件事：顺序扫描、条件成立就收集该规则的奖励。新增一种奖励（如宠物
 * 成长）只需往表里加一条规则，不必改本函数。
 *
 * **未完成整组时返回空数组**：没有任何规则的 `when` 会为真（两条规则都以
 * `questCompleted` 为前置），因此调用方拿不到任何可发放项。
 *
 * @param context 成绩快照，见 {@link RewardContext}。
 * @returns 待发放奖励数组，按规则声明顺序排列；入参不被修改。
 */
export function evaluateRewardRules(context: RewardContext): readonly RewardGrant[] {
  const grants: RewardGrant[] = []
  for (const rule of REWARD_RULES) {
    if (rule.when(context)) {
      grants.push(...rule.grant(context))
    }
  }
  return grants
}
