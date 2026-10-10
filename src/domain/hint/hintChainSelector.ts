import { FIVE_STEP_TYPES, type FiveStepType, type Question } from '../model/types'

/**
 * `src/domain/hint/hintChainSelector` —— 分层提示链选择。
 *
 * spec `hint-and-correction` §分层提示链：每道题固定 5 层提示，顺序即
 * 规格——审题提醒 → 已知/未知识别 → 数量关系 → 算式提示 → 讲解示例，
 * MUST 逐层展开、MUST NOT 一次全部显示。design §3 五步引导补充：五步
 * 「每一步可给该步专属提示」，且「步内答错不判负」。
 *
 * 因此本模块支持两种取法：
 * 1. **题级链（第 n 层）**：{@link revealHint}——同一题第 n 次取提示返回
 *    第 n 层，超过 5 层 clamp 住不再前进。逐层展开的语义就在这里落地：
 *    单次调用只返回一层，绝不多给。
 * 2. **步内链（某一步的第 m 层）**：{@link revealStepHint}——孩子卡在五步
 *    的某一步时，返回那一步的专属提示文案（取自该步自己的 `prompt`），
 *    与题级链分开，避免把后续步/整题解法的提示提前泄给孩子。
 *
 * 两条链都从 `Question` 读数（`hints` / `steps[].prompt`），本模块只做
 * 「选哪一层、取哪段文案」的纯函数，不持有任何可变的「已展开到第几层」
 * 状态——索引由调用方传入，函数因此无副作用、可重入（同一个 `used` 永远
 * 取到同一层，便于 Task 6 从事件重放出确定结果）。
 */

/**
 * 固定提示层数。spec 定为 5，写死成常量而非让各题自己声明层数：规格是
 * 「每道题 SHALL 提供 5 层提示」，层数是全局契约，不是题目可选配置。
 */
export const MAX_HINT_LAYERS = 5

/**
 * 5 层提示的固定标签，顺序即 spec §分层提示链。
 *
 * 作为 `as const` 元组声明，让运行时有一条可遍历的层序表；它应与题库每道
 * 题的 `hints` 数组逐层对齐（第 1 项对应「审题提醒」，第 5 项对应「讲解
 * 示例」）。仅用于 UI 徽标与测试断言层序，不参与取层计算——取层走
 * {@link revealHint}，按 `question.hints` 的数组下标取文案。
 */
export const HINT_LAYER_LABELS = [
  '审题提醒',
  '已知/未知识别',
  '数量关系',
  '算式提示',
  '讲解示例',
] as const

/** 一次取层的结果：取到第几层，以及该层要展示的文案。 */
export interface RevealedHint {
  /** 1 基层号（1..{@link MAX_HINT_LAYERS}）。 */
  readonly layer: number
  /** 该层要展示的文案，直接取自媒体数据，不做包装。 */
  readonly text: string
}

/**
 * 题级链：取「同一题第 n 次提示」对应的那一层。
 *
 * `used` 是该题此前**已展开**的层数（0 表示还没展开过）。第 `used + 1` 层
 * 即本次要展开的层，超过 {@link MAX_HINT_LAYERS} 时 clamp 住——规格
 * 「超过 5 层不再前进」，孩子反复点提示也不会拿到第 6 层。
 *
 * 层号与文案都从 `question.hints` 取：`hints` 的顺序即规格的 5 层顺序，
 * 这里只把「第 n 次」这个次数翻成 1 基下标。`used` 只用于算下标，函数本身
 * 无记忆，故同输入必得同层（Task 6 重放确定性）。
 *
 * @param question 目标题目（须有 `hints`）。
 * @param used 此前已展开的层数，MUST ≥ 0。
 * @returns `{ layer, text }`——只含一层，绝不合并多层。
 * @throws {Error} `question.hints` 层数与 {@link MAX_HINT_LAYERS} 不一致 ——
 *   规格要求每道题恰好 5 层，层数不符说明题库内容或规格已漂移，宁可在
 *   取层时炸掉，也不静默返回一个错层序的提示。
 */
export function revealHint(question: Question, used: number): RevealedHint {
  if (question.hints.length !== MAX_HINT_LAYERS) {
    throw new Error(
      `revealHint: 题目 ${question.id} 的提示层数应为 ${MAX_HINT_LAYERS}，实际为 ${question.hints.length}`,
    )
  }

  // clamp:used 越界（负数按 0、>5 按 4）都收敛到合法区间，层号恒在 1..5。
  const clampedUsed = Math.min(Math.max(used, 0), MAX_HINT_LAYERS - 1)
  const layer = clampedUsed + 1

  return { layer, text: question.hints[clampedUsed] }
}

/**
 * 五步某一步对应的「专属提示层」层号（1 基）。
 *
 * 五步（{@link FIVE_STEP_TYPES}）与 5 层提示链按环节一一对齐：
 * - known → 第 1 层（审题提醒：重读以找出已知条件）
 * - unknown → 第 2 层（已知/未知识别）
 * - relation → 第 3 层（数量关系）
 * - expression → 第 4 层（算式提示）
 * - answer → 第 5 层（讲解示例）
 *
 * 用「步骤在 {@link FIVE_STEP_TYPES} 中的位置」算层号，而不是另建一张
 * `step → layer` 表：步序是五步状态机的唯一真源，两张表早晚会漂移。
 * 层号只用于 UI 徽标与「不越到别的步」的校验，取文案走 {@link revealStepHint}。
 *
 * @param step 五步之一。
 * @returns 1..5 的层号。
 * @throws {Error} `step` 不在标准五步链上 —— 越界步骤没有对应层，返回一个
 *   凭空的层号会让 UI 指向一层不存在的提示。
 */
export function stepHintLayer(step: FiveStepType): number {
  const index = FIVE_STEP_TYPES.indexOf(step)
  if (index === -1) {
    throw new Error(`stepHintLayer: 未知步骤类型 "${step}"`)
  }
  return index + 1
}

/**
 * 步内链：取「某一步的专属提示」。
 *
 * 文案取自该步自己的 `steps[].prompt`（model/types 定义为「该步向孩子展示
 * 的引导语」）——它就是这一步的专属文案，与题级链的 `hints` 分开：题级链
 * 是「孩子直接要提示」时的逐层脚手架，步内链是「孩子卡在某一步」时只回
 * 到那一步的最小引导（design §3「只给该步提示，不扣进度」）。两者混用会
 * 把后续步甚至整题解法的提示提前泄给孩子。
 *
 * `layer` 仍按 {@link stepHintLayer} 给出该步对应的层号，供 UI 标注「这
 * 条提示属于第几层」，但不据此越界去取 `hints`——步内提示不复用题级链文案。
 *
 * @param question 目标题目，须是五步题（`requiresFiveStep` 且带 `steps`）。
 * @param step 孩子当前卡住的五步之一。
 * @returns `{ layer, text }`——text 为该步 prompt。
 * @throws {Error} 题目不带五步（基础题直答，无步内提示）或该步没有对应
 *   `steps` 条目 —— 步内提示依附于步骤模板，缺了就是内容缺陷。
 */
export function revealStepHint(question: Question, step: FiveStepType): RevealedHint {
  const layer = stepHintLayer(step)
  const template = question.steps?.find((candidate) => candidate.type === step)
  if (template === undefined) {
    throw new Error(`revealStepHint: 题目 ${question.id} 没有步骤 "${step}" 的专属提示`)
  }

  return { layer, text: template.prompt }
}
