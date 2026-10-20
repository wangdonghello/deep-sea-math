import { computed, ref } from 'vue'

import { replayProjections } from '@/domain/eventLog/replay'
import { QUIZ_TYPES, type DomainEvent, type MasteryLevel, type QuizType } from '@/domain/model/types'
import { QUIZ_TYPE_LABELS } from '@/shared/quizTypeLabel'
import { redact } from '@/shared/redact'

import type { ChildOverview, FamilyOverviewOptions } from './types'

/** 近 7 天窗口（与 `useParentPanel` 的 `7days` 口径一致）。 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 没有任何"待加强"题型时的中性提示。 */
const NEUTRAL_HINT = '近 7 天还没有足够的学习记录'

/** UTC 日期键（与 `eventLog/replay` 同一口径）。 */
function utcDayKey(occurredAt: number): string {
  return new Date(occurredAt).toISOString().slice(0, 10)
}

/** "需要加强"的掌握档位：未掌握与提示后掌握都还需要练。 */
const NEEDS_ATTENTION: readonly MasteryLevel[] = ['unmastered', 'hinted']

/**
 * 从题目级掌握投影按题型汇总"待加强"数量。
 *
 * `replayProjections` 的 `masteryByTopic` 存的是每条题型轨的**当前状态**（不是
 * 分档计数），因此最弱项要从 `masteryByQuestion` 逐题按题型归类后统计——与
 * `useParentPanel` 报告区同一口径，查不到题型的题目不计入。
 */
function attentionByTypeOf(
  masteryByQuestion: Readonly<Record<string, { readonly level: MasteryLevel }>>,
  questionTypeById?: Readonly<Record<string, QuizType>>,
): Partial<Record<QuizType, number>> {
  const counts: Partial<Record<QuizType, number>> = {}
  for (const [questionId, state] of Object.entries(masteryByQuestion)) {
    const type = questionTypeById?.[questionId]
    if (type === undefined || !NEEDS_ATTENTION.includes(state.level)) continue
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

/**
 * 挑出待加强最多的题型，拼一句"需要关注"。
 *
 * 只认"未掌握 + 提示后掌握"的数量：独立掌握/稳定掌握不需要家长介入。
 * 平票时按 {@link QUIZ_TYPES} 顺序取第一个，保证同一份事件总是同一句话
 * （总览卡片不能在两次刷新间换措辞）。
 */
function focusHintOf(attentionByType: Partial<Record<QuizType, number>>): string {
  let weakest: QuizType | null = null
  let weakestCount = 0
  for (const type of QUIZ_TYPES) {
    const attention = attentionByType[type] ?? 0
    if (attention > weakestCount) {
      weakest = type
      weakestCount = attention
    }
  }
  return weakest === null ? NEUTRAL_HINT : `需要关注：建议多练「${QUIZ_TYPE_LABELS[weakest]}」`
}

/** 算出单个孩子的近 7 天摘要。 */
function buildOverview(
  profile: { id: string; nickname: string; avatarId: string },
  events: readonly DomainEvent[],
  now: number,
  questionTypeById?: Readonly<Record<string, QuizType>>,
): ChildOverview {
  const start = now - WEEK_MS
  // 一次重放拿题型掌握；区间统计只对近 7 天的事件做一次遍历。
  const projections = replayProjections(events, { profileId: profile.id, questionTypeById })
  const completed = new Map<string, number>()
  const days = new Set<string>()
  for (const event of events) {
    if (event.profileId !== profile.id || event.occurredAt < start || event.occurredAt > now) continue
    if (event.type !== 'answer-submitted') continue
    days.add(utcDayKey(event.occurredAt))
    if (event.correct) completed.set(`${event.sessionId}:${event.questionId}`, event.ms)
  }
  const durations = [...completed.values()]
  const averageMs = durations.length === 0 ? 0 : Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length)
  return {
    profileId: profile.id,
    nickname: profile.nickname,
    avatarId: profile.avatarId,
    daysStudied: days.size,
    completedQuestions: completed.size,
    averageMs,
    focusHint: focusHintOf(attentionByTypeOf(projections.masteryByQuestion, questionTypeById)),
  }
}

/**
 * 家庭总览的派生逻辑。
 *
 * 每个孩子的两件派生（题型掌握 + 近 7 天区间统计）都在这里一次算好，组件只
 * 渲染 {@link ChildOverview}。事件各自的读取并发发出，避免 N 个孩子串行 I/O。
 */
export function useFamilyOverview(options: FamilyOverviewOptions) {
  const clock = options.clock ?? Date.now
  const children = ref<ChildOverview[]>([])
  const loading = ref(false)
  const errorMessage = ref('')

  const degraded = computed(() => options.store.degraded)

  async function load(): Promise<void> {
    loading.value = true
    errorMessage.value = ''
    try {
      const listed = await options.store.profiles.list()
      const now = clock()
      const results = await Promise.all(
        listed.map(async (profile) =>
          buildOverview(profile, await options.store.events.listByProfile(profile.id), now, options.questionTypeById),
        ),
      )
      children.value = results
    } catch (error) {
      errorMessage.value = '暂时无法读取家庭总览，请稍后重试。'
      options.logger?.(redact({ event: 'parent-overview-failed', error }))
    } finally {
      loading.value = false
    }
  }

  return { children, loading, errorMessage, degraded, load }
}
