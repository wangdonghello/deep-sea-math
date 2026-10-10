/**
 * `src/features/unlock/useUnlockFeedback.ts` —— 整组完成后的解锁反馈（Task 17）。
 *
 * 设计约束（design §4「组件不包含业务规则判断」）：**判断全部在这里**，
 * `UnlockOverlay` 只渲染本函数给出的奖励清单。「什么算一次新的解锁」的判据是
 * 事件日志里出现了一条**本会话还没见过**的 `session-completed` —— 而不是某个
 * 组件自己喊"我完成了"。因此答题页不需要改一行代码：它把
 * `session-completed` 落库，本 composable 轮询到它，反馈自然出现。
 *
 * 为什么是轮询而不是事件回调：写库的是 `useQuizSession`（答题页内部），而
 * 反馈是**全局**的（切到图鉴/观察舱也要能看到）。跨组件事件总线会把答题页
 * 与反馈层耦合起来；轮询 event log 则是"重新读一次事实来源"，与 spec
 * §投影可由事件重建 同一立场——刷新页面后该看到的反馈依然看得到（只是不会
 * 为历史完成记录再弹一次）。
 */

import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'

import { redact } from '@/shared/redact'
import type { DomainEvent, SessionCompletedEvent, UnlockGrantedEvent } from '@/domain/model/types'

import { rewardLabel } from './rewardLabels'

/** 一条待展示的奖励（标识 + 给孩子看的名字）。 */
export interface UnlockReward {
  /** 发放通道；徽章没有对应事件，仅用于选择展示文案。 */
  readonly kind: 'badge' | 'creature' | 'zone'
  /** 奖励标识（徽章 id / 生物 id / 区域 id）。 */
  readonly targetId: string
  /** 展示名。 */
  readonly label: string
}

/** 解锁反馈所需的全部数据能力（窄接口：只读事件）。 */
export interface UnlockFeedbackStore {
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
}

/** {@link useUnlockFeedback} 的输入。 */
export interface UnlockFeedbackOptions {
  /** 数据能力窄接口。 */
  store: UnlockFeedbackStore
  /** 当前档案 id；没有会话时不读存储也不弹反馈。 */
  profileId: MaybeRefOrGetter<string | null>
  /** 轮询间隔（毫秒）；测试注入小值或 0 + 手动 `check()`。 */
  pollIntervalMs?: number
  /** 日志出口；发出的对象先经 `redact()` 脱敏。 */
  logger?: (entry: Record<string, unknown>) => void
}

/** 默认轮询间隔：1 秒。答题落库到反馈出现最多这么久，孩子无感知。 */
const DEFAULT_POLL_MS = 1000

/**
 * 装配解锁反馈（全局单例语义：由 `App.vue` 持有）。
 *
 * @param options 见 {@link UnlockFeedbackOptions}。
 */
export function useUnlockFeedback(options: UnlockFeedbackOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS
  const visible = ref(false)
  const rewards = ref<readonly UnlockReward[]>([])
  /**
   * 已经展示过的那次完成的 sessionId。
   *
   * `undefined` = 尚未初始化（首轮只记录基线，绝不为历史记录弹反馈）；
   * `null` = 当前档案在应用启动前没有任何完成记录。
   */
  let seenSessionId: string | null | undefined
  /**
   * 应用启动时刻：早于它的完成记录属于历史，绝不复播。
   *
   * 初值取 `Infinity` 而不是 0：`start()` 之前（例如首次导航触发的 check 抢先
   * 于 `onMounted`）任何完成都不算"新"，否则刷新后会复播一次昨天的解锁。
   */
  let startedAt = Number.POSITIVE_INFINITY
  let timer: ReturnType<typeof setInterval> | null = null
  let checking = false
  /** 读取期间又有人来问：这次读完后立刻补查一次，不丢事件。 */
  let recheckRequested = false

  /** 脱敏日志出口：失败原因可能带库名与路径。 */
  function log(event: string, error: unknown): void {
    options.logger?.({ event, ...redact({ error }) })
  }

  /** 从一次完成事件组装奖励清单：徽章在前，图鉴卡/区域按事件顺序。 */
  function buildRewards(
    completion: SessionCompletedEvent,
    events: readonly DomainEvent[],
  ): UnlockReward[] {
    const badges: UnlockReward[] = completion.rewards.map((targetId) => ({
      kind: 'badge' as const,
      targetId,
      label: rewardLabel('badge', targetId),
    }))
    const unlocks: UnlockReward[] = events
      .filter(
        (event): event is UnlockGrantedEvent =>
          event.type === 'unlock-granted' && event.reason === completion.sessionId,
      )
      .map((event) => ({
        kind: event.kind,
        targetId: event.targetId,
        label: rewardLabel(event.kind, event.targetId),
      }))
    return [...badges, ...unlocks]
  }

  /**
   * 读一次事件，判断是否出现了新的整组完成。
   *
   * 三条纪律：
   * 1. **只认启动之后的完成**：`startedAt` 之前落库的完成属于历史，绝不复播
   *    （否则每次刷新都弹一次昨天的解锁）。这条时间线同时消掉了"启动瞬间
   *    的竞态"——首轮 `listEvents` 还没回来时孩子就做完了题，那次完成依然
   *    会被下一轮轮询捕捉到，而不是被误当成基线吞掉；
   * 2. **并发去重**：上一次轮询还没回来就跳过这次，慢存储不会叠出一串请求；
   * 3. **失败只进日志**：读失败不弹反馈、不抛错，答题页该干什么干什么。
   */
  async function check(): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) {
      // 退出登录/删档：立刻收起源反馈，并把基线重置（下次登录重新建基线）。
      seenSessionId = undefined
      visible.value = false
      return
    }
    if (checking) {
      // 上一轮还没读完：记一笔，等它读完立刻补查。直接丢弃会让"答题完成瞬间
      // 恰好赶上一次慢读取"的反馈晚一个轮询周期（默认 1 秒）——孩子已经
      // 看到完成的画面，反馈却迟迟不来。
      recheckRequested = true
      return
    }
    checking = true
    try {
      const events = await options.store.listEvents(profileId)
      // 仓储按 occurredAt 升序返回，最后一条 `session-completed` 即最近一次完成。
      const completions = events.filter(
        (event): event is SessionCompletedEvent => event.type === 'session-completed',
      )
      const latest = completions.at(-1)
      // 应用启动后新落库的完成（含首轮读取途中写入的那次）。
      const fresh = completions.filter((event) => event.occurredAt >= startedAt).at(-1)

      if (fresh !== undefined) {
        if (seenSessionId === undefined || fresh.sessionId !== seenSessionId) {
          seenSessionId = fresh.sessionId
          rewards.value = buildRewards(fresh, events)
          // 没有可展示奖励时不弹空壳（全部发过的重复完成走幂等，不会到这里）。
          visible.value = rewards.value.length > 0
        }
        return
      }

      // 启动前就有完成记录：只建基线，不弹反馈。
      seenSessionId = latest?.sessionId ?? null
    } catch (error) {
      log('unlock-feedback-check-failed', error)
    } finally {
      checking = false
      // 有人在这轮读取期间来问过：立刻补查（只补一次，避免无限递归）。
      if (recheckRequested) {
        recheckRequested = false
        void check()
      }
    }
  }

  /** 开始轮询（挂载时调用一次）；同刻打点"应用启动时刻"。 */
  function start(): void {
    if (timer !== null) return
    startedAt = Date.now()
    void check()
    if (pollIntervalMs <= 0) return
    timer = setInterval(() => void check(), pollIntervalMs)
  }

  /** 停止轮询（卸载时调用）。 */
  function stop(): void {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  /** 关闭反馈（孩子点"知道了"）。 */
  function dismiss(): void {
    visible.value = false
  }

  return {
    visible,
    rewards: computed(() => rewards.value),
    check,
    start,
    stop,
    dismiss,
  }
}
