import type { DomainEvent } from '@/domain/model/types'

/** 基础分：独立答对一道题，每天每题最多一次。 */
const POINTS_PER_INDEPENDENT_CORRECT = 1
/** 整组完成的固定奖励。 */
const POINTS_PER_COMPLETION = 5
/** 订正一道相似题的奖励（每天有题数上限）。 */
const POINTS_PER_CORRECTION = 2

/** 准确率奖励阈值：整组独立正确率达到该比例才发奖励。 */
const ACCURACY_THRESHOLD = 0.8
/** 准确率达标时的额外奖励。 */
const ACCURACY_BONUS = 3

/** 每日上限：订正只有前 5 题计分。 */
const MAX_CORRECTIONS_PER_DAY = 5

export interface Ledger {
  readonly balance: number
  readonly earned: number
  readonly spent: number
}

/** 积分按「UTC 日（本地 08:00 重置）+ 题目」维度记账，因此用日期键而不是完整时间戳。 */
function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/** 独立答对：答对、未展开提示、无重试。用提示或重试的答对不计基础分。 */
function independentAnswer(event: DomainEvent): boolean {
  return (
    event.type === 'answer-submitted' &&
    event.correct &&
    event.usedHintLevel === 0 &&
    event.retryCount === 0
  )
}

/** 单个题组的正确率统计。 */
interface SessionAccuracy {
  /** `session-started` 声明的题数（题序去重后的大小）；缺省为 0。 */
  declared: number
  /** 实际作答过的题目集合，用作缺少 `session-started` 时的分母兜底。 */
  attempted: Set<string>
  /** 独立答对的题目集合，即正确率分子。 */
  independentCorrect: Set<string>
}

/**
 * 汇总每个题组的正确率数据。
 *
 * 单独扫一遍而不是在 `session-completed` 处即时统计，是因为重放拿到的事件
 * 顺序不保证严格等于发生顺序（旧日志、合并导入都可能乱序）；先收齐再判定，
 * 正确率就不会因「完成事件先于最后一条作答出现」而少算。
 */
function collectSessionAccuracy(scoped: readonly DomainEvent[]): Map<string, SessionAccuracy> {
  const bySession = new Map<string, SessionAccuracy>()

  const statsFor = (sessionId: string): SessionAccuracy => {
    let stats = bySession.get(sessionId)
    if (!stats) {
      stats = { declared: 0, attempted: new Set(), independentCorrect: new Set() }
      bySession.set(sessionId, stats)
    }
    return stats
  }

  for (const event of scoped) {
    if (event.type === 'session-started') {
      statsFor(event.sessionId).declared = new Set(event.questionIds).size
    }
    if (event.type === 'answer-submitted') {
      const stats = statsFor(event.sessionId)
      stats.attempted.add(event.questionId)
      if (independentAnswer(event)) stats.independentCorrect.add(event.questionId)
    }
  }

  return bySession
}

/**
 * 从事件推导积分余额；购买价格以事件为准。
 *
 * 纯函数：不改写入参，不读时钟、不读商品目录价——重放同一段事件永远得到同一
 * 个余额。全部规则集中在这一次遍历里，事件日志是唯一事实来源。
 *
 * **余额不做 clamp**：若事件日志异常（命令层校验曾被绕过、或导入了旧数据），
 * 可能出现 `earned < spent` 的负余额。这里如实返回，把矛盾暴露出来，而不是
 * 静默归零改数；购买是否可用、余额是否足够，由商店层在写入事件前拦截。
 *
 * `session-completed` 按 `sessionId` 只计一次：同一题组重复落完成事件（即使
 * `eventId` 不同）也不会重复发完成分与准确率奖励。
 */
export function resolveLedger(events: readonly DomainEvent[], profileId: string): Ledger {
  const scoped = events.filter((event) => event.profileId === profileId)
  const accuracy = collectSessionAccuracy(scoped)
  const answered = new Set<string>()
  const completedSessions = new Set<string>()
  const correctionsByDay = new Map<string, number>()
  let earned = 0
  let spent = 0

  for (const event of scoped) {
    if (event.type === 'answer-submitted' && independentAnswer(event)) {
      const key = `${dayKey(event.occurredAt)}:${event.questionId}`
      if (!answered.has(key)) {
        answered.add(key)
        earned += POINTS_PER_INDEPENDENT_CORRECT
      }
    }
    if (event.type === 'session-completed' && !completedSessions.has(event.sessionId)) {
      completedSessions.add(event.sessionId)
      earned += POINTS_PER_COMPLETION
      const stats = accuracy.get(event.sessionId)
      // 分母优先用组题时声明的题数；没有 `session-started` 时退回实际作答
      // 的题目数（去重），否则整组完成却拿不到正确率奖励。
      const total = stats ? Math.max(stats.declared, stats.attempted.size) : 0
      const correct = stats ? stats.independentCorrect.size : 0
      if (total > 0 && correct / total >= ACCURACY_THRESHOLD) earned += ACCURACY_BONUS
    }
    if (event.type === 'correction-done') {
      const day = dayKey(event.occurredAt)
      const used = correctionsByDay.get(day) ?? 0
      if (used < MAX_CORRECTIONS_PER_DAY) {
        correctionsByDay.set(day, used + 1)
        earned += POINTS_PER_CORRECTION
      }
    }
    if (event.type === 'item-purchased') spent += event.price
  }

  return { balance: earned - spent, earned, spent }
}

/**
 * 单个题组的积分（答对题数 + 完成 + 正确率加成）。
 *
 * 与 {@link resolveLedger} 共用同一份正确率口径：分母取「声明题数」与「实际
 * 作答去重题数」的较大者，缺少 `session-started` 时也能算出正确率。用于结算
 * 反馈里展示“这一组赚了多少”，不参与余额累积。
 */
export function sessionPoints(
  events: readonly DomainEvent[],
  profileId: string,
  sessionId: string,
): number {
  const scoped = events.filter((event) => event.profileId === profileId)
  const stats = collectSessionAccuracy(scoped).get(sessionId)
  if (stats === undefined) return 0
  const total = Math.max(stats.declared, stats.attempted.size)
  const correct = stats.independentCorrect.size
  const bonus = total > 0 && correct / total >= ACCURACY_THRESHOLD ? ACCURACY_BONUS : 0
  return correct * POINTS_PER_INDEPENDENT_CORRECT + POINTS_PER_COMPLETION + bonus
}
