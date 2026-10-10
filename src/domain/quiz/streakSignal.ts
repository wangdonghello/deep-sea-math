import type { DomainEvent } from '../model/types'

/**
 * `src/domain/quiz/streakSignal` —— 答题流的「连续成败」信号真源。
 *
 * `masteryStateMachine`（掌握状态机的题型级连击）与 `quiz/difficulty`
 * （难度自适应的独立连击 / 提示连击）都要回答同一个问题：这条答题事件
 * 对「连续独立答对」这条连击而言，是推进、打断，还是不参与。若两处各写
 * 一套 if，口径必然漂移——Task 6 的 `replayProjections` 同时消费这两套定义
 * 时会正面相撞。因此抽出这一处纯函数作为唯一真源。
 *
 * 四种取值：
 * - `independent`：首次、未用提示、一次就对 —— 推进连击（+1）。
 * - `hinted`：用了提示但仍答对 —— 算「提示后连击」，打断「独立连击」。
 * - `breaker`：答错、看答案、改错后才对、订正完成 —— 打断连击（归零）。
 * - `ignored`：非答题事件（展开提示、建档、开始题组、设置变更等）——
 *   既不推进也不打断，读了当没读到。
 *
 * **`correction-done` 归为 `breaker` 而非 `ignored`**：一条订正只可能在
 * 同题已答错之后发生，而那次答错早已把连击归零，所以正常流里再断一次是
 * 空操作；但若事件流乱序或单条重放，`breaker` 能保证两套连击对「订正过
 * 的题不算独立」这一点永远一致。这与本模块一贯的保守口径相同：凡不是
 * 「一次独立答对」，宁可归零也不给连击记功（对比 `retryCount > 0` 的
 * 改错后才对，同样归 `breaker`）。
 */

/** 「连续独立答对」连击的一次迁移判定结果。 */
export type StreakSignal =
  /** 首次、未用提示、一次提交即对：推进连击。 */
  | 'independent'
  /** 展开提示后答对：算提示后连击，不推进独立连击。 */
  | 'hinted'
  /** 打断连击（归零）：答错 / 看答案 / 改错后才对 / 订正完成。 */
  | 'breaker'
  /** 与连击无关的流程事件：不推进也不打断。 */
  | 'ignored'

/**
 * 把任意一条领域事件归一为连击信号。
 *
 * `answer-submitted` 的判定顺序刻意与 `quiz/difficulty` 原先的三段式等
 * 价：先排除答错，再看是否用了提示（`usedHintLevel > 0` → hinted），最后
 * 才判断是否「一次就对」（`retryCount === 0`）。顺序很重要——`correct` 且
 * `usedHintLevel > 0` 即便 `retryCount > 0` 也算 `hinted` 而非 `breaker`，
 * 这与 `computeCurrentDifficulty` 里 `isHintedCorrect` 优先于清零分支一致，
 * 改动它会让「连续提示后答对降档」的既有语义悄悄变化。
 *
 * @param event 任意领域事件（含非答题事件）。
 * @returns 该事件对「连续独立答对」连击的信号。
 */
export function classifyStreakSignal(event: DomainEvent): StreakSignal {
  if (event.type !== 'answer-submitted') {
    // 答错之外，看答案与订正完成都是「没独立做出来」的硬打断；其余流程事件
    // （hint-used / session-* / profile-* / settings-* / unlock-* /
    // difficulty-fallback）不构成成败信号，一律 ignored。
    return event.type === 'answer-revealed' || event.type === 'correction-done' ? 'breaker' : 'ignored'
  }

  if (event.correct !== true) {
    return 'breaker'
  }
  if (event.usedHintLevel > 0) {
    return 'hinted'
  }
  return event.retryCount === 0 ? 'independent' : 'breaker'
}
