/**
 * `src/app/questContext.ts` —— 答题页路由参数的装配（Task 17）。
 *
 * 由路由守卫在导航前装配并挂到路由 `meta` 上；答题页通过 props 读取
 * `meta.questContext`（见 `src/router/index.ts` 的 `props: route => ...`）。
 * 之所以走 `meta` 而不是模块缓存：`props` 函数在渲染期同步求值，而题组要读
 * 事件才知道；把"本次导航的上下文"挂在本次导航上，缓存失效问题就不存在了。
 */

import { QUESTION_BANK } from '../data/content'
import type { Question } from '../domain/model/types'
import { replayProjections } from '../domain/eventLog/replay'
import type { DomainEvent } from '../domain/model/types'
import { deriveQuestTargets } from './questTargets'

/**
 * UTC 日期键。
 *
 * 与 `useHomeQuest` / `replayProjections` 的 `dailyQuestIndex` 口径必须一致
 * （否则首页认定的"今天"与答题页认定的"今天"会分叉）。这里内联一份而不是
 * import：那个函数是首页 composable 的私有实现，装配层反向依赖它会把"改一下
 * 日界口径"放大成跨层修改。
 */
function utcDayKey(occurredAt: number): string {
  return new Date(occurredAt).toISOString().slice(0, 10)
}

/** 答题页所需的题组上下文（缺失字段由视图各自兜底）。 */
export interface QuestRouteContext {
  sessionId: string | null
  /** 题组题目（顺序与 `session-started.questionIds` 一致）。 */
  questions: readonly Question[]
  /** 相似题池（本组题目 `similarQuestionIds` 引到的题）。 */
  similarQuestionPool: readonly Question[]
  /** 本组对应的生物（题目包装里的主角），供答题完成时发放图鉴卡。 */
  creatureId?: string
  /** 本题组对应的下潜区域 id。 */
  zoneId?: string
}

/** 按 id 取题目；题库里没有对应条目时跳过（不渲染空槽）。 */
function pickQuestions(ids: readonly string[]): Question[] {
  return ids.flatMap((id) => {
    const question = QUESTION_BANK.questions.find((candidate) => candidate.id === id)
    return question === undefined ? [] : [question]
  })
}

/**
 * 由当前档案的**当日题组**装配答题页上下文。
 *
 * 题序的唯一权威是 `session-started.questionIds`（spec §刷新页面不换题），
 * 因此这里不重新抽题、不排序——守卫传入什么顺序就照什么顺序渲染。
 * 没有当日题组时返回 `sessionId: null`，路由据此把 `/quest` 打回首页。
 *
 * @param profileId 当前档案 id。
 * @param events 该档案的全量事件（调用方已按写入次序排好）。
 * @param now 判定"今天"的时间基准（Unix 毫秒）。
 * @param options.practiceIds 错题重练的题号（来自 `/quest?practice=`）。
 *   非空时**不进当日题组**：这些题目是孩子挑出来的错题，题序即点名顺序。
 *   此时会话 id 由本函数合成（没有对应的 `session-started`），因此重练
 *   完成不会重复发放当日题组的奖励——它该改善的是掌握状态，那是重放投影
 *   的事（`answer-submitted` 一律计入，与所属会话无关）。
 */
export function buildQuestContext(
  profileId: string,
  events: readonly DomainEvent[],
  now: number,
  options: { practiceIds?: readonly string[] } = {},
): QuestRouteContext {
  const practiceIds = options.practiceIds ?? []
  const projections = replayProjections(events, { profileId })
  const dailySessionId = projections.dailyQuestIndex[utcDayKey(now)] ?? null

  const isPractice = practiceIds.length > 0
  const sessionId = isPractice ? `practice-${practiceIds.join('-')}` : dailySessionId

  const rawIds = isPractice
    ? practiceIds
    : (events.find(
        (event) => event.type === 'session-started' && event.sessionId === dailySessionId,
      ) as { questionIds?: string[] } | undefined)?.questionIds ?? []
  const questions = pickQuestions(rawIds)

  const similarIds = new Set(questions.flatMap((question) => question.similarQuestionIds))
  const similarQuestionPool = QUESTION_BANK.questions.filter((question) =>
    similarIds.has(question.id),
  )

  const unlockedZoneIds = new Set(
    Object.keys(projections.bestiaryUnlock)
      .filter((key) => key.startsWith('zone:'))
      .map((key) => key.slice('zone:'.length)),
  )

  return {
    sessionId,
    questions,
    similarQuestionPool,
    ...deriveQuestTargets(questions, unlockedZoneIds),
  }
}
