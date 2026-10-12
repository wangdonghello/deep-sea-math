import { computed, ref } from 'vue'

import { hashPin, verifyPin } from '@/domain/crypto/hashPin'
import { PIN_LENGTH, RETRY_MESSAGE } from '@/features/profileSelect/types'
import { usePinLock } from '@/features/profileSelect/usePinLock'
import type { Clock, PinStatus } from '@/features/profileSelect/types'
import { redact } from '@/shared/redact'

import { useParentSessionStore } from './parentSessionStore'
import type { ParentGateOptions } from './types'

/**
 * `src/features/parentPanel/useParentGate.ts` —— 家长区门禁的业务规则。
 *
 * 唯一规则来源（业务规则不写进组件）：组件只渲染本函数的状态、把按键事件发
 * 回来。与 `useProfileSelect` 的分工一致——PIN 的哈希/比对交给
 * `domain/crypto/hashPin`，本函数只决定"什么时候调用、调用后怎么反应"。
 *
 * 与孩子 PIN **同一套锁定口径**（spec `child-profiles` §PIN 错误）：连续 5 次
 * 错误锁定 60 秒，错误只说"再试一次"，锁定态改说"请等 N 秒"。这样孩子与家长
 * 两侧的限速行为不会漂移（阈值与时长定义在 `features/profileSelect/types.ts`，
 * 由 `usePinLock` 缺省取用）。
 *
 * 两种模式由"是否已设过家长 PIN"决定：
 * - **未设过**（`hasPin === false`）：进入设置模式，需要输入两次（PIN + 确认），
 *   两次一致才落库并解锁；不一致给中性文案并回到第一步。
 * - **已设过**：比对已存哈希，成功即解锁，失败走"再试一次"+ 锁定。
 *
 * 安全约束：PIN 明文只活在 `pin` 这个短生命周期 ref 里，提交后立刻清空；
 * 所有日志出口都经 `redact()`，且本函数从不主动把 PIN 明文或盐当字段写进日志。
 */

/** 默认时钟：浏览器定时器。 */
const systemClock: Clock = {
  now: () => Date.now(),
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (handle) => window.clearInterval(handle),
}

/** 默认随机盐来源：Web Crypto（16 字节随机盐）。 */
const secureRandomBytes = (size: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(size))

/** 把随机字节转成小写十六进制盐串。 */
const saltHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * 两次输入不一致时的中性文案。
 *
 * 刻意不写"密码错了"之类归因：设置阶段还没有"正确密码"这回事，说"不一致"
 * 就够指导操作，也不会把"两次没对上"误导成"校验失败"。
 */
const PIN_MISMATCH_MESSAGE = '两次输入不一致，请重新设置'

/**
 * 家长门禁的组合式逻辑。
 *
 * @param options 见 {@link ParentGateOptions}。
 */
export function useParentGate(options: ParentGateOptions) {
  const clock = options.clock ?? systemClock
  const logger = options.logger
  const session = useParentSessionStore()
  const lock = usePinLock(clock)

  /** 是否已设过家长 PIN（首次为 false → 走设置模式）。 */
  const hasPin = ref(false)
  /** 已输入的 PIN 数字串（最多 {@link PIN_LENGTH} 位）；MUST NOT 回显明文。 */
  const pin = ref('')
  /** 当前错误提示；无错为空串。 */
  const errorMessage = ref('')
  /** 当前状态：idle / verifying / success / error / locked。 */
  const status = ref<PinStatus>('idle')
  /** 设置模式的阶段：`enter`（首次输入）→ `confirm`（确认输入）。 */
  const stage = ref<'enter' | 'confirm'>('enter')
  /** 设置模式下第一次输入的值，仅在"确认"这一步存活。 */
  const pendingPin = ref('')
  /** 记录读取中。 */
  const loading = ref(false)

  /** 脱敏日志出口：PIN 明文与盐在任何情况下都不允许出现在日志里。 */
  function log(event: string, payload: Record<string, unknown>): void {
    logger?.({ event, ...redact(payload) })
  }

  /**
   * 当前模式（给视图选标题与提示用）。
   *
   * `create` = 首次设置第一步；`confirm` = 首次设置确认步；`verify` = 已设过
   * 家长 PIN，正常校验。
   */
  const mode = computed<'create' | 'confirm' | 'verify'>(() => {
    if (hasPin.value) return 'verify'
    return stage.value === 'confirm' ? 'confirm' : 'create'
  })

  /** 本次会话是否已解锁（路由守卫据此放行三个子路径）。 */
  const unlocked = computed(() => session.unlocked)

  /** 读取家长 PIN 记录，决定进入设置还是校验模式。 */
  async function load(): Promise<void> {
    loading.value = true
    errorMessage.value = ''
    try {
      hasPin.value = (await options.store.load()) !== undefined
      stage.value = 'enter'
      status.value = 'idle'
    } catch (error) {
      // 读取失败只给中性提示：具体错因进脱敏日志，且不放行。
      log('parent-guard-load-failed', { error })
      errorMessage.value = RETRY_MESSAGE
      status.value = 'error'
    } finally {
      loading.value = false
    }
  }

  /**
   * 输入一位数字。
   *
   * @param digit 单个 `0-9` 字符。多字符、空串、非 ASCII 数字一律忽略——输入
   *   合法性是 composable 自己的契约（键盘、掩码输入框、将来的物理键盘都可能
   *   绕开当前这套按键），放行非法字符只会让校验收到畸形 PIN 而静默失败。
   */
  function pushDigit(digit: string): void {
    if (lock.locked.value) return
    if (pin.value.length >= PIN_LENGTH) return
    if (!/^[0-9]$/.test(digit)) return
    pin.value += digit
    errorMessage.value = ''
  }

  /** 退格一位。 */
  function backspace(): void {
    if (lock.locked.value) return
    pin.value = pin.value.slice(0, -1)
    errorMessage.value = ''
  }

  /**
   * 整体赋值（掩码输入框的打字/粘贴路径）。
   *
   * 与 {@link pushDigit} 同一口径：先剥掉非数字，再截到 {@link PIN_LENGTH} 位；
   * 锁定期间不接收任何输入。剥而不拒是刻意的——输入框里打字时用户会先敲出
   * 半截内容，直接整体拒绝会让光标内容与内部状态分叉。
   */
  function setPin(value: string): void {
    if (lock.locked.value) return
    pin.value = value.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH)
    errorMessage.value = ''
  }

  /**
   * 失败分支的统一收口：计数、清空输入、给中性文案。
   *
   * 抽成函数是为了让"校验返回 false"与"校验抛错"两条路径行为完全一致——
   * 后者一旦漏掉计数，反复触发存储异常就成了绕过 5 次锁定策略的后门。
   */
  function fail(): void {
    lock.registerFailure()
    pin.value = ''
    // 达到锁定阈值时不写"再试一次"：那条指令已不可执行，留着只会与倒计时
    // 同时出现，叫人以为现在还能再试。
    errorMessage.value = lock.locked.value ? '' : RETRY_MESSAGE
    status.value = lock.statusAfterFailure()
  }

  /** 首次设置流程的一步：第一次输入 → 确认输入 → 落库并解锁。 */
  async function submitCreate(value: string): Promise<void> {
    if (stage.value === 'enter') {
      pendingPin.value = value
      stage.value = 'confirm'
      status.value = 'idle'
      return
    }
    if (value !== pendingPin.value) {
      pendingPin.value = ''
      stage.value = 'enter'
      errorMessage.value = PIN_MISMATCH_MESSAGE
      status.value = 'error'
      return
    }
    const salt = saltHex((options.randomBytes ?? secureRandomBytes)(16))
    const pinHash = await hashPin(value, salt, options.digest)
    await options.store.save({ id: 'parent', pinHash, salt })
    pendingPin.value = ''
    hasPin.value = true
    stage.value = 'enter'
    errorMessage.value = ''
    status.value = 'success'
    session.unlock()
  }

  /** 提交当前 PIN（设置模式下按阶段推进，校验模式下比对哈希）。 */
  async function submit(): Promise<void> {
    if (lock.locked.value) {
      status.value = 'locked'
      return
    }
    if (pin.value.length < PIN_LENGTH) return

    const value = pin.value
    status.value = 'verifying'
    errorMessage.value = ''
    try {
      if (!hasPin.value) {
        await submitCreate(value)
        return
      }

      const record = await options.store.load()
      if (record === undefined) {
        // 记录在加载后消失（例如另一标签页清了 PIN）：回到设置模式，而不是把
        // "没有 PIN"伪装成"PIN 错误"。
        hasPin.value = false
        stage.value = 'enter'
        status.value = 'idle'
        return
      }

      const ok = await verifyPin(value, record.salt, record.pinHash, options.digest)
      if (ok) {
        lock.release()
        errorMessage.value = ''
        status.value = 'success'
        session.unlock()
        return
      }

      fail()
    } catch (error) {
      // 校验/写入抛错按失败处理：异常信息 MUST NOT 带到 UI。
      log('parent-pin-submit-failed', { error })
      fail()
    } finally {
      // 明文只活在短生命周期输入里：无论成功失败，提交后立刻清空。
      pin.value = ''
    }
  }

  return {
    loading,
    hasPin,
    mode,
    pin,
    errorMessage,
    status,
    unlocked,
    locked: lock.locked,
    remainingSeconds: lock.remainingSeconds,
    load,
    pushDigit,
    backspace,
    setPin,
    submit,
  }
}
