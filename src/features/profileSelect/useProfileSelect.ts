import { computed, ref } from 'vue'

import { redact } from '@/shared/redact'

import { useProfileSessionStore } from './profileSessionStore'
import { usePinLock } from './usePinLock'
import {
  HOME_PATH,
  PIN_LENGTH,
  RETRY_MESSAGE,
  type Clock,
  type ProfileSelectOptions,
  type ProfileSummary,
  type PinStatus,
} from './types'

/** 默认时钟：浏览器定时器。 */
const systemClock: Clock = {
  now: () => Date.now(),
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (handle) => window.clearInterval(handle),
}

/**
 * 档案选择 + PIN 校验的组合式逻辑（design §4 `ProfileSelectView` 的唯一规则来源）。
 *
 * 分层职责（design §4 组件边界）：
 * - 本 composable **不**做 PIN 哈希/比对 —— 那是 `domain/crypto/hashPin.ts`
 *   的事（Task 2）；它只决定“什么时候调用、调用后怎么反应”。
 * - 组件（`ProfileCard` / `PinPad` / `ProfileSelectView`）只渲染本函数返回的
 *   状态并发回事件，不含任何业务判断。
 *
 * 与 Task 9 的解耦：数据能力经 `ProfileStore` 窄接口注入（见
 * `options.store`），本文件不 import 任何仓储实现。T9 的 `profileRepo` 落地后
 * 由调用方直接传入：`useProfileSelect({ store: profileRepo })`。
 *
 * 安全约束：所有日志出口都经 `redact()` 脱敏；UI 只可能出现
 * "再试一次" 这一句中性文案。
 */
export function useProfileSelect(options: ProfileSelectOptions) {
  const clock = options.clock ?? systemClock
  const navigate = options.navigate ?? (() => undefined)
  const logger = options.logger
  const session = useProfileSessionStore()
  const lock = usePinLock(clock)

  /** 档案列表。 */
  const profiles = ref<ProfileSummary[]>([])
  /** 已输入的 PIN 数字串（最多 {@link PIN_LENGTH} 位）。 */
  const pin = ref('')
  /** 当前错误提示；无错为空串。 */
  const errorMessage = ref('')
  /** 当前状态：idle / verifying / success / error / locked。 */
  const status = ref<PinStatus>('idle')
  /** 列表读取中。 */
  const loading = ref(false)

  /** 当前选中档案 ID；未选中为 `null`。 */
  const selectedId = ref<string | null>(null)

  /** 选中档案的投影（供视图渲染昵称/头像，不含任何 PIN 相关字段）。 */
  const selectedProfile = computed<ProfileSummary | null>(
    () => profiles.value.find((item) => item.id === selectedId.value) ?? null,
  )

  /** 脱敏日志出口：PIN 明文与盐在任何情况下都不允许出现在日志里。 */
  function log(event: string, payload: Record<string, unknown>): void {
    logger?.({ event, ...redact(payload) })
  }

  /** 载入档案列表，默认选中第一个。 */
  async function load(): Promise<void> {
    loading.value = true
    errorMessage.value = ''
    try {
      profiles.value = await options.store.list()
      selectedId.value = profiles.value[0]?.id ?? null
      status.value = 'idle'
    } catch (error) {
      // 列表读取失败同样只给中性提示：具体错因只进脱敏日志。
      log('profile-list-failed', { error })
      errorMessage.value = RETRY_MESSAGE
      status.value = 'error'
    } finally {
      loading.value = false
    }
  }

  /** 切换选中档案：清空输入与错误提示。 */
  function selectProfile(profileId: string): void {
    selectedId.value = profileId
    pin.value = ''
    errorMessage.value = ''
    status.value = 'idle'
  }

  /**
   * 输入一位数字。
   *
   * @param digit 单个 `0-9` 字符。多字符、空串、非数字一律忽略 —— 输入合法性
   *   是 composable 自己的契约（它才是「什么算一位有效 PIN 输入」的规则来源），
   *   不能推给组件：调用方或将来新增的物理键盘、无障碍输入都可能绕开
   *   当前这九个按钮。放行非数字只会让 `verify` 收到畸形 PIN 而静默失败，
   *   反而把「输入不对」伪装成「密码错了」。
   *
   * 满 {@link PIN_LENGTH} 位后同样忽略（不覆盖已输入内容）。
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
   * 锁定期间不接收任何输入。**剥而不拒**是刻意的——在输入框里打字时用户会先
   * 敲出半截内容，整段拒绝会让框里的显示与内部状态对不上；剥掉非法字符后
   * 框里剩下的就是真正生效的值。
   *
   * @param value 输入框当前的完整字符串。
   */
  function setPin(value: string): void {
    if (lock.locked.value) return
    pin.value = value.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH)
    errorMessage.value = ''
  }

  /**
   * 失败分支的统一收口：计数、清空输入、给中性文案。
   *
   * 抽成函数是为了让「verify 返回 false」与「verify 抛错」两条路径行为完全
   * 一致 —— 后者更容易被漏掉（ catch 里只 log 不计数），而一旦漏掉，
   * 反复触发存储异常就成了绕过 5 次锁定策略的后门。
   */
  function fail(): void {
    lock.registerFailure()
    pin.value = ''
    /*
     * 达到锁定阈值时**不写**"再试一次"：锁定期那条指令已不可执行，留着它只会
     * 与倒计时文案同时出现，既冗余又误导（孩子会以为现在还能再试一次）。
     * 此时唯一该说的是"请等 N 秒"，那句由 `PinPad` 依据 locked 状态渲染。
     */
    errorMessage.value = lock.locked.value ? '' : RETRY_MESSAGE
    status.value = lock.statusAfterFailure()
  }

  /** 提交当前 PIN 进行校验。 */
  async function submit(): Promise<void> {
    if (lock.locked.value) {
      status.value = 'locked'
      return
    }
    if (selectedId.value === null) return
    if (pin.value.length < PIN_LENGTH) return

    status.value = 'verifying'
    errorMessage.value = ''
    try {
      const ok = await options.store.verify(selectedId.value, pin.value)
      if (ok) {
        // 成功：清零失败计数与输入、写会话态、进入 Home。
        // PIN 也要清空：留着上一轮的明文在内存里没有意义，而本页即将被卸载，
        // 万一导航失败（例如路由未就绪），残留输入会让下一次提交静默复发。
        lock.release()
        pin.value = ''
        errorMessage.value = ''
        status.value = 'success'
        session.setActive({
          profileId: selectedId.value,
          nickname: selectedProfile.value?.nickname ?? '',
          avatarId: selectedProfile.value?.avatarId ?? '',
        })
        navigate(HOME_PATH)
        return
      }

      fail()
    } catch (error) {
      // verify 抛错按失败处理：异常信息 MUST NOT 带到 UI。
      log('pin-verify-failed', { error })
      fail()
    }
  }

  return {
    profiles,
    selectedId,
    selectedProfile,
    pin,
    errorMessage,
    status,
    loading,
    locked: lock.locked,
    remainingSeconds: lock.remainingSeconds,
    failureCount: lock.failureCount,
    load,
    selectProfile,
    pushDigit,
    backspace,
    setPin,
    submit,
  }
}
