import { onScopeDispose } from 'vue'
import { computed, ref } from 'vue'

import { LOCK_SECONDS, MAX_PIN_FAILURES, type Clock, type PinStatus } from './types'

/**
 * 锁定与 60 秒倒计时逻辑（Task 11 REFACTOR 的落点）。
 *
 * 之所以从 `useProfileSelect` 里拆出来：倒计时是一个**自含的状态机**
 * （失败计数 → 锁定 → 逐秒递减 → 解锁），与「校验 PIN」没有任何逻辑耦合。
 * 拆开后组件与主 composable 都不再关心 `setInterval` 句柄的生命周期，
 * `useProfileSelect` 只需要问一句“现在能不能提交”。
 *
 * 时钟注入点：`setInterval` / `now` 都由参数 `clock` 提供，因此测试里推进
 * 虚拟时间即可断言倒计时全过程，真实环境下则退化为浏览器定时器。
 *
 * 倒计时的值是**从 `clock.now()` 推导**而不是每 tick 减 1：后台标签页里
 * `setInterval` 会被浏览器节流成每分钟几次，逐 tick 递减会让界面上的
 * 倒计时越走越慢、与真实解锁时刻脱钩。按时间戳推导则不管 tick 被吞掉多少
 * 次，读到的都是真实剩余秒数；`setInterval` 在这里退化为“定期叫醒界面刷新”
 * 的哨兵，不再是计数的真相来源。
 *
 * **已知局限（规格未要求持久化，Task 17 跟进）**：`failureCount` / `unlockAt`
 * 都只在内存里，**刷新页面即归零**——也就是说"刷新绕过锁定"在当前实现下是
 * 成立的。规格（`child-profiles` §PIN 错误）只规定"连续 5 次错误后锁定 60 秒"，
 * 未要求跨会话保持，故此处不作为缺陷修复。Task 17 装配时应把这两个值落到
 * IndexedDB（T9 仓储），使锁定跨刷新仍然有效。
 *
 * **时钟跳变的影响（已确认不构成拒绝服务）**：`unlockAt` 是绝对时间戳，
 * 因此用户把系统时间**往前**拨时，下一次 tick 就会立即解锁（锁定被缩短，
 * 但不锁死）；**往后**拨时最坏情况是 `Math.ceil` 让剩余秒数略微多算
 * （如负差被 `Math.max(0, …)` 收敛到 0），同样是尽早解锁而非永久锁死。
 * 两个方向都不会把孩子关在页面外。
 *
 * @param clock 注入的时钟。
 * @param failureLimit 触发锁定的连续失败次数，默认取
 *   {@link MAX_PIN_FAILURES}（spec `child-profiles` §PIN 错误的“5 次”）。
 * @param lockedSeconds 锁定时长（秒），默认 {@link LOCK_SECONDS}（60 秒）。
 */
export function usePinLock(
  clock: Clock,
  failureLimit: number = MAX_PIN_FAILURES,
  lockedSeconds: number = LOCK_SECONDS,
) {
  /** 连续失败次数；达到阈值即锁定。 */
  const failureCount = ref(0)
  /** 是否处于锁定期。 */
  const locked = ref(false)
  /** 解锁时刻（`clock.now()` 的毫秒时间戳）；未锁定时为 `null`。 */
  const unlockAt = ref<number | null>(null)
  let timerHandle: number | null = null

  /** 供 computed 订阅的“心跳”：每次 tick 自增，触发倒计时重新求值。 */
  const tick = ref(0)

  /** 剩余解锁秒数；未锁定时为 0。 */
  const remainingSeconds = computed(() => {
    // 读 tick 以建立依赖：不订阅它，`setInterval` 叫醒时 computed 不会重算。
    void tick.value
    if (unlockAt.value === null) return 0
    return Math.max(0, Math.ceil((unlockAt.value - clock.now()) / 1000))
  })

  function clearTimer(): void {
    if (timerHandle !== null) {
      clock.clearInterval(timerHandle)
      timerHandle = null
    }
  }

  /** 记录一次失败；达到阈值时进入锁定并启动每秒一次的刷新哨兵。 */
  function registerFailure(): void {
    failureCount.value += 1
    if (failureCount.value < failureLimit) return

    locked.value = true
    unlockAt.value = clock.now() + lockedSeconds * 1000
    clearTimer()
    timerHandle = clock.setInterval(() => {
      tick.value += 1
      if (unlockAt.value !== null && clock.now() >= unlockAt.value) {
        release()
      }
    }, 1000)
  }

  /** 立即解锁并清零计数（成功登录或手动重置时调用）。 */
  function release(): void {
    clearTimer()
    locked.value = false
    unlockAt.value = null
    failureCount.value = 0
  }

  /**
   * 失败之后应有的状态标签。
   *
   * 只回答一个问题：「刚刚失败了一次，界面上该是什么状态」——锁定了就显示
   * 倒计时并禁用提交，否则显示“再试一次”。
   *
   * 刻意**不**带 `errorActive` 参数、也不返回 `'idle'`：本函数仅在 `fail()`
   * 里被调用（恒为“刚刚失败”），此前的 `errorActive` 形参在真实调用链上永远
   * 为真，`'idle'` 分支随之不可达。留着它会让这个函数看起来能表达全部状态，
   * 实际只有一条路径走得到 —— 那是多余 API 面，比多一个参数更糟（调用方会
   * 误以为可以问出“现在是不是空闲”）。空闲态由 `useProfileSelect` 自己的
   * `status` ref 管理（`selectProfile` / 成功时置 `'idle'`）。
   */
  function statusAfterFailure(): PinStatus {
    return locked.value ? 'locked' : 'error'
  }

  /*
   * 组件卸载时兜底清理：倒计时进行中离开页面不应留下悬挂定时器。
   *
   * `failSilently = true`：这个 composable 也可能在单元测试里脱离组件直接
   * 调用（没有 effect scope），此时不应因为“找不到 scope”而刷一屏警告。
   */
  onScopeDispose(clearTimer, true)

  return {
    failureCount: computed(() => failureCount.value),
    locked: computed(() => locked.value),
    remainingSeconds,
    registerFailure,
    release,
    statusAfterFailure,
  }
}
