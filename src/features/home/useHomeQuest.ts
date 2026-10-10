/**
 * `features/home/useHomeQuest.ts` —— 首页的全部数据获取与状态推导。
 *
 * design §4 组件边界的落地形态：**组件不包含业务规则判断**。`HomeView` 只渲染
 * 本函数返回的状态，`MapPanel` / `QuestCard` 只消费 props；「今天有没有题组」
 * 「进度是多少」「该显示哪个按钮」这类判定全部收在这里。
 *
 * 数据流（与 design §2「事件是唯一事实来源」对齐）：
 * ```
 * store.listEvents ──► replayProjections(events) ──► dailyQuestIndex[today]
 *                                                   └─► questProgress[sessionId]
 * ```
 * 首页不自己维护任何进度缓存：刷新后重新读一次事件即可复现，因此本 composable
 * 没有任何持久态（Pinia 都不需要，会话态在 T11 的 `profileSessionStore`）。
 *
 * 领取题组时经 Task 4 的 `buildDailyQuest` 生成，并把
 * `session-started`（+ 可能的 `difficulty-fallback`）通过 `store.appendEvents`
 * 落库——MUST NOT 只在内存里摆一个题组，否则刷新即丢（spec §刷新页面不换题）。
 */

import { computed, ref } from 'vue'

import { redact } from '@/shared/redact'
import { buildDailyQuest } from '@/domain/quiz/buildDailyQuest'
import { replayProjections } from '@/domain/eventLog/replay'
import type { Projections, QuestProgress } from '@/domain/eventLog/replay'
import type { DomainEvent, Settings } from '@/domain/model/types'

import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { DEMO_QUESTION_POOL } from './fixtures'
import type { HomeProfile, HomeQuestOptions, HomeStore } from './types'

/** 默认时钟：宿主当前时间（仅"今天是哪一天"需要它）。 */
const systemClock: () => number = () => Date.now()

/** 默认 ID 发生器：Web Crypto 随机 UUID（调用时才解析，见 `buildDailyQuest`）。 */
const systemIdGenerator: () => string = () => globalThis.crypto.randomUUID()

/** 任务卡所需的全部展示数据（组件按它渲染，不做任何推导）。 */
export type QuestCardModel =
  /** 无当日题组：没有题组可下潜，`sessionId` 必然为 `null`。 */
  | QuestCardBase & { state: 'empty'; sessionId: null }
  /** 有未完成题组：一定有 `sessionId` 可下潜。 */
  | QuestCardBase & { state: 'active'; sessionId: string }
  /** 当日题组已完成：ID 保留供 Task 14/16 的报告与详情引用。 */
  | QuestCardBase & { state: 'done'; sessionId: string }

/** 三种状态共有的展示字段。 */
interface QuestCardBase {
  /** 当前档案昵称（卡片标题用）。 */
  nickname: string
  /** 已完成题数。 */
  answered: number
  /** 总题数（家长设置的三类数量之和；有题组时取题组实际长度）。 */
  total: number
  /** 预计用时（分钟），由题量推导。 */
  estimatedMinutes: number
  /** 目标奖励文案（完成整组可解锁的内容）。 */
  rewardLabel: string
}

/** 一次首页读取得到的快照（`load` 与 `claimToday` 共用，读存储只此一处）。 */
interface HomeSnapshot {
  /** 当日（按注入时钟的 UTC 日界）题组的 sessionId；无题组为 `null`。 */
  sessionId: string | null
  /** 当日题组进度；无题组为 `undefined`。 */
  progress: QuestProgress | undefined
  /** 家长设置推导出的总题数（`settings` 三类数量之和）。 */
  total: number
  /** 读取到的家长设置。 */
  settings: Settings
  /** 读取到的全量事件。 */
  events: readonly DomainEvent[]
  /** 全量事件重放出的投影（`claimToday` 还要用 `masteryByQuestion`）。 */
  projections: Projections
}

/** UTC 日期键：与 `replayProjections` 的 `dailyQuestIndex` 口径必须一致。 */
function utcDayKey(occurredAt: number): string {
  return new Date(occurredAt).toISOString().slice(0, 10)
}

/**
 * 首页的组合式逻辑（design §4 `HomeView` 的唯一规则来源）。
 *
 * 分层职责：
 * - 本 composable **不**判断"该不该解锁"（那是 `domain/reward` 的事，Task 7），
 *   也不重新实现组题/投影——它只决定"何时调用 `buildDailyQuest`、何时读事件"；
 * - 组件（`MapPanel` / `QuestCard` / `DepthScale` / `TabBar`）只渲染这里返回的
 *   状态并转发事件，因此首页可在无 IndexedDB 的测试环境里完整跑通。
 *
 * @param options 见 {@link HomeQuestOptions}。
 */
export function useHomeQuest(options: HomeQuestOptions) {
  const store: HomeStore = options.store
  const clock = options.clock ?? systemClock
  const idGenerator = options.idGenerator ?? systemIdGenerator

  const session = useProfileSessionStore()

  /** 当前档案（来自 T11 的会话态；未登录为 `null`）。 */
  const profile = computed<HomeProfile | null>(() => session.projection)

  /** 任务卡模型；未加载完成时为 `null`（视图据此渲染占位）。 */
  const card = ref<QuestCardModel | null>(null)
  /** 首次加载中。 */
  const loading = ref(false)
  /** 领取题组中（防重复点击：同一小时组两次会留下两条当日题组）。 */
  const claiming = ref(false)
  /** 读取/写入失败时的中性提示；具体错因只进脱敏日志，不上屏。 */
  const errorMessage = ref('')

  /** 脱敏日志出口：失败原因可能带路径与库名，一律经 `redact()` 后送出。 */
  function log(event: string, error: unknown): void {
    options.logger?.({ event, ...redact({ error }) })
  }

  /**
   * 预计用时：按题量粗估（每题 1.5 分钟，向上取整），再按家长设置的时长上限
   * 收敛。
   *
   * 之所以由 composable 算而不是组件算：`maxMinutes` 是家长设的**上限**而不是
   * 估值，「5+3+1 每题 1.5 分钟」这类口径一旦写进模板，家长区（Task 16）改
   * 设置时就无人同步。真实耗时在 Task 13 答题时计量，届时可改为按 `ms` 汇总。
   *
   * `max(min(estimate, maxMinutes), 1)` 的次序是刻意的（RETRO R19 的口径）：
   * - **先 min 后 max**：上限被设成 0（家长想关掉时长提示）时预估收敛到 1，
   *   而不是 0——"0 分钟"会让孩子以为这组题不用做；
   * - **外层的 max** 兜的是"上限为 0 或负数"，不是"题量算出来是 0"；
   * - **只有上限缺省**（旧档案还没有 `settings-updated` 事件）才不设限，退回
   *   原估值。缺省与 0 是两件事：前者是"家长没表态"，后者是"家长表态了"。
   *
   * @param total 题数（有题组时取题组实际长度）。
   * @param maxMinutes 家长设置的时长上限；`undefined` 表示缺省（不设限）。
   */
  function estimateMinutes(total: number, maxMinutes?: number): number {
    const estimate = Math.max(1, Math.ceil(total * 1.5))
    if (maxMinutes === undefined) return estimate
    return Math.max(Math.min(estimate, maxMinutes), 1)
  }

  /**
   * 目标奖励文案。
   *
   * 数据来源（T8 前的过渡口径）：spec creature-bestiary §解锁与奖励发放 规定
   * 「完成整组 SHALL 解锁对应生物图鉴卡与区域下潜」，而"对应哪只生物"由图鉴
   * 内容（Task 8/14）决定。这里因此给一句固定文案，**不**内联一份生物表——
   * 那会让首页在图鉴落地前就持有一份必然漂移的清单。T14 接入
   * `bestiaryUnlock` 投影后，改为展示下一只待解锁生物的条目。
   */
  function rewardLabel(): string {
    return '下一区图鉴卡 + 徽章'
  }

  /**
   * 读一次存储快照：设置 + 全量事件 + 重放投影 + 当日题组定位。
   *
   * `load` 与 `claimToday` 都要这三样（后者还要 `masteryByQuestion`），抽成
   * 一处是为了让"给谁读、读什么、怎么定位当日题组"只有一个口径——分两处写
   * 的话，任一处漏了 `profileId` 过滤或日期键口径，两边的当日题组就会不一致。
   *
   * 两次读用 `Promise.all` 并行（Constitution Check·异步非阻塞）：设置与事件
   * 互不依赖，串行会让首页多等一次存储往返。
   */
  async function readSnapshot(profileId: string): Promise<HomeSnapshot> {
    const [settings, events] = await Promise.all([
      store.readSettings(profileId),
      store.listEvents(profileId),
    ])
    const projections = replayProjections(events, { profileId })
    const sessionId = projections.dailyQuestIndex[utcDayKey(clock())] ?? null
    return {
      sessionId,
      progress: sessionId === null ? undefined : projections.questProgress[sessionId],
      total: settings.basicCount + settings.appliedCount + settings.probeCount,
      settings,
      events,
      projections,
    }
  }

  /**
   * 读事件 → 重放投影 → 推出任务卡状态。
   *
   * 一次 `listEvents` 取全量后在内存 reduce（Constitution Check·避免循环内
   * I/O）；投影不落任何缓存，刷新即重建（spec §投影可由事件重建）。
   *
   * 无会话态时直接置空态：**没有当前档案就不读存储**——"给谁读"没有答案，
   * 读出来也无法归属，只会把别的档案的事件暴露在错误的视图里。
   */
  async function load(): Promise<void> {
    const current = profile.value
    if (current === null) {
      card.value = null
      return
    }

    loading.value = true
    errorMessage.value = ''
    try {
      card.value = await buildCard(current, await readSnapshot(current.profileId))
    } catch (error) {
      card.value = null
      errorMessage.value = '今日任务打不开，请稍后再试'
      log('home-load-failed', error)
    } finally {
      loading.value = false
    }
  }

  /** 把快照翻译成任务卡模型（纯函数，不碰存储）。 */
  function buildCard(current: HomeProfile, snapshot: HomeSnapshot): QuestCardModel {
    const { sessionId, progress, total, settings } = snapshot
    if (sessionId === null || progress === undefined) {
      // 当日题组不存在（新一天 / 新档案）：总题数以家长设置为准
      return {
        state: 'empty',
        nickname: current.nickname,
        answered: 0,
        total,
        estimatedMinutes: estimateMinutes(total, settings.maxMinutes),
        rewardLabel: rewardLabel(),
        sessionId: null,
      }
    }

    // 总题数取题组实际长度而非设置现值：家长改设置后当日题组保持不变
    // （spec §题量被家长调整），进度分母必须与孩子正在做的那一组一致。
    const questTotal = progress.questionIds.length || total
    return {
      // 题组已完成就不再给「开始下潜」：同一组题重复进入只会让孩子原地打转，
      // 继续练习的入口由图鉴/错题本（Task 14）与「开始新的一天」提供。
      state: progress.completedAt === null ? 'active' : 'done',
      nickname: current.nickname,
      answered: progress.answeredQuestionIds.length,
      total: questTotal,
      estimatedMinutes: estimateMinutes(questTotal, settings.maxMinutes),
      rewardLabel: rewardLabel(),
      sessionId,
    }
  }

  /**
   * 领取今日任务：生成当日题组并落库，然后刷新任务卡。
   *
   * 三步都不可省：
   * 1. **先重放事件**查当日题组——`buildDailyQuest` 自己不知道"今天有没有题"，
   *    重复调用会再生成一组同题量的题（spec §刷新页面不换题的防线在这里）；
   * 2. **难度历史喂全量事件**（`computeCurrentDifficulty` 要的是事件流而非
   *    摘要，见 `difficulty.ts` 的说明），`now` 由注入时钟给出，保证同一天
   *    重复领取得到同一档位；
   * 3. **写库后 reload** 而不是就地拼状态——写完立刻 reload 才能证明"刷新
   *    后看到同一组题"这条路真的通（返回的事件里 projection 尚未重建）。
   */
  async function claimToday(): Promise<void> {
    const current = profile.value
    if (current === null || claiming.value) return

    claiming.value = true
    errorMessage.value = ''
    try {
      const snapshot = await readSnapshot(current.profileId)

      // 已有当日题组：不重抽，直接进入。防线必须落在 composable 而不是调用方——
      // `buildDailyQuest` 自己不知道"今天有没有题"，重复调用会再写一条
      // `session-started`，spec §刷新页面不换题 就被打破了。
      if (snapshot.sessionId !== null) {
        card.value = buildCard(current, snapshot)
        return
      }

      const quest = buildDailyQuest({
        profileId: current.profileId,
        settings: snapshot.settings,
        // 难度历史喂**全量事件**而不是摘要：`computeCurrentDifficulty` 要的是
        // 事件流（见 `difficulty.ts` 对 `DifficultyHistory` 的说明）。
        history: { profileId: current.profileId, events: snapshot.events, now: clock() },
        pool: options.pool ?? DEMO_QUESTION_POOL,
        masteryByQuestion: snapshot.projections.masteryByQuestion,
        clock,
        idGenerator,
      })

      await store.appendEvents([quest.sessionStartedEvent, ...quest.fallbackEvents])
      // 写完必须重新读一遍：不能就地拼状态——就地拼等于绕过投影，"刷新后看到
      // 同一组题"这条路径就再没被验证过，写库失败也会被静默吞掉。
      await load()
    } catch (error) {
      errorMessage.value = '今日任务领取失败，请稍后再试'
      log('home-claim-failed', error)
    } finally {
      claiming.value = false
    }
  }

  return {
    profile,
    card,
    loading,
    claiming,
    errorMessage,
    load,
    claimToday,
  }
}

