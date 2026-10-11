import type { DomainEvent } from '../model/types'

/**
 * `src/domain/eventLog/appendEvents` —— 事件日志的幂等追加（去重）。
 *
 * 承担 spec `offline-event-log` §事件记录与 ID 幂等 的两条规则：
 * 1. **eventId 去重**：同一 `eventId` 只保留一条（网络/界面原因导致的重复
 *    写入被吞掉）；
 * 2. **逻辑组合去重**：同一逻辑操作不得产生两条语义重复事件——即便两次写入
 *    拿到了不同的 `eventId`（重试时客户端先本地生成 id、后补发），也要按
 *    design §2 的组合键判为同一次操作。
 *
 * 与「重放」的分工：本模块只回答「这条事件该不该进日志」，不关心事件被折叠成
 * 什么投影（那是 `eventLog/replay` 的事）。因此它零依赖、可被仓储层在写入前
 * 直接调用。
 */

/**
 * 计算一条事件的**逻辑组合键**；返回 `null` 表示该事件没有逻辑组合键，
 * 只能按 `eventId` 去重。
 *
 * 组合键口径（design §2）：
 * - `answer-submitted`：`sessionId + questionId + retryCount + level`，
 *   其中 `level` 取该事件的 `usedHintLevel`（提交时的提示层级）；
 * - `hint-used`：`sessionId + questionId + level`；
 * - `answer-revealed`：**没有 `level` 字段**，因此组合键收敛为
 *   `sessionId + questionId` —— 同一题组的同一题最多只记录一次「看答案」，
 *   重复看答案语义上仍是同一次求助，不构成新的学习行为；
 * - `correction-done`：`sessionId + questionId + similarQuestionId`
 *   （同一原题可以订正多条相似题，每条是一次操作）；
 * - `session-started` / `session-completed`：`sessionId`（一次题组一条）；
 * - `difficulty-fallback`：`sessionId + category`（一次组题每类最多一条）；
 * - `unlock-granted`：`kind + targetId`（解锁是追加型，同一目标不得发两次）；
 * - `profile-created`：`profileId`（一个档案只建档一次）；
 * - `settings-updated`：`null` —— 家长可以合法地多次修改设置，每次都是
 *   独立的一次配置操作，没有「同一逻辑操作」可言，只能靠 `eventId` 去重。
 *
 * 键统一带事件类型前缀：`hint-used`（level 1）与 `answer-submitted`
 * （usedHintLevel 1）对同一题是两类不同事件，去掉前缀会让它们互相吞掉。
 *
 * @param event 任意一条领域事件。
 * @returns 逻辑组合键；该事件不参与逻辑去重时返回 `null`。
 */
export function logicalEventKey(event: DomainEvent): string | null {
  switch (event.type) {
    case 'answer-submitted':
      return `answer-submitted|${event.sessionId}|${event.questionId}|${event.retryCount}|${event.usedHintLevel}`
    case 'hint-used':
      return `hint-used|${event.sessionId}|${event.questionId}|${event.level}`
    case 'answer-revealed':
      return `answer-revealed|${event.sessionId}|${event.questionId}`
    case 'correction-done':
      return `correction-done|${event.sessionId}|${event.questionId}|${event.similarQuestionId}`
    case 'session-started':
      return `session-started|${event.sessionId}`
    case 'session-completed':
      return `session-completed|${event.sessionId}`
    case 'difficulty-fallback':
      return `difficulty-fallback|${event.sessionId}|${event.category}`
    case 'unlock-granted':
      return `unlock-granted|${event.kind}|${event.targetId}`
    case 'profile-created':
      return `profile-created|${event.profileId}`
    case 'settings-updated':
      return null
  }
}

/**
 * 幂等追加事件：把 `incoming` 合并进 `existing`，按 {@link logicalEventKey}
 * 的规则去重，返回**全新的日志数组**。
 *
 * 三条语义：
 * 1. **先到者胜**：重复事件的判定基准是「日志里已有的第一条」。因此同一
 *    `eventId`（或同一逻辑组合）被写入多次时，保留的是最早那条，其后的都
 *    被吞——重放结果因此与写入次数无关。
 * 2. **入参数组不被修改**：`existing` 与 `incoming` 都只读，合并结果写进
 *    新数组。事件对象本身按引用共享（事件是不可变值对象，见
 *    `model/types` 的说明），不做深拷贝。
 * 3. **既有残留也会被收敛**：即使 `existing` 里已经躺着两条语义重复的事件
 *    （例如早期版本写坏的日志），这次合并也只会保留第一条——调用方可以把它
 *    当作「日志归一化」用。
 *
 * 单趟合并、两次 Set 查找，不在循环里做线性扫描（日志规模随使用天数线性
 * 增长，O(n²) 的 `includes` 会在几个月后变成可感知的卡顿）。
 *
 * @param existing 既有事件日志（只读）。
 * @param incoming 待追加的事件（只读，通常是本批次新产生的若干条）。
 * @returns 合并后的新日志数组；不修改任何入参。
 */
export function appendEvents(
  existing: readonly DomainEvent[],
  incoming: readonly DomainEvent[],
): DomainEvent[] {
  const seenEventIds = new Set<string>()
  const seenLogicalKeys = new Set<string>()
  const merged: DomainEvent[] = []

  const keepIfNew = (event: DomainEvent): void => {
    const logicalKey = logicalEventKey(event)
    if (seenEventIds.has(event.eventId)) {
      return
    }
    if (logicalKey !== null && seenLogicalKeys.has(logicalKey)) {
      return
    }
    seenEventIds.add(event.eventId)
    if (logicalKey !== null) {
      seenLogicalKeys.add(logicalKey)
    }
    merged.push(event)
  }

  for (const event of existing) {
    keepIfNew(event)
  }
  for (const event of incoming) {
    keepIfNew(event)
  }

  return merged
}
