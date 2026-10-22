/**
 * `features/profileSelect/` 的类型与规格常量。
 *
 * 只放类型与**从规格逐字抄下来的常量**（5 次锁定、60 秒、4 位 PIN），不放
 * 业务逻辑。之所以让常量住在这里而不是散落在实现里：spec `child-profiles`
 * 对这几个数字有明确要求，集中一处后“改行为”与“改规格”不会互相冒充。
 *
 * 与实现分开文件（而不是塞进 `useProfileSelect.ts`）的理由：组件（`.vue`）
 * 与 composable 都要引用 `ProfileSummary` / `PIN_LENGTH`，若类型住在
 * composable 里，组件为了一个 import 就会把整个状态机拖进编译单元。
 */

/** 档案的**可展示**字段。 */
export interface ProfileSummary {
  id: string
  /** 昵称（虚拟昵称，MUST NOT 是真实姓名）。 */
  nickname: string
  /** 头像素材键。 */
  avatarId: string
  /** 年级；第一版旧档案缺省 3 年级。 */
  grade?: 1 | 2 | 3
  /** 主兴趣主题；第一版旧档案缺省深海。 */
  themeId?: 'deep-sea' | 'dinosaur' | 'space'
}

/** 登录成功后载入的档案投影（当前档案的会话态）。 */
export interface ProfileProjection {
  profileId: string
  nickname: string
  avatarId: string
  grade?: 1 | 2 | 3
  themeId?: 'deep-sea' | 'dinosaur' | 'space'
}

/**
 * 档案选择所需的全部数据能力 —— 本功能与外部存储之间的**窄接口**。
 *
 * 之所以是窄接口而不是直接依赖 T9 的仓储类型：本 task（Task 11）只关心
 * 「列出档案」与「校验 PIN」两件事，而 T9 的 `ProfileRepo` 只有
 * `save/get/list/remove` —— **没有 `verify()`**（PIN 比对属于
 * `domain/crypto`，不是仓储职责）。所以直接 `useProfileSelect({ store:
 * profileRepo })` 会因为缺 `verify` 而类型不成立。
 *
 * 合并时的对接方式（由适配器完成，不是"直接传入"）：
 * ```ts
 * import { createProfileSelectStore } from '@/features/profileSelect/createProfileSelectStore'
 *
 * useProfileSelect({ store: createProfileSelectStore(profileRepo) })
 * ```
 * `createProfileSelectStore` 以**结构式**最小面（`get` / `list`）依赖 T9，
 * 不 import 它的文件，因此两个并行开发的 task 互不阻塞、合并无冲突。
 */
export interface ProfileStore {
  /** 列出本机全部档案；失败时抛出，由调用方转成中性提示。 */
  list(): Promise<ProfileSummary[]>

  /**
   * 校验 PIN，仅返回布尔值。
   *
   * 刻意**不**在返回值里区分「PIN 错」「档案不存在」「存储损坏」等错因：
   * spec `child-profiles` §PIN 错误要求系统 MUST NOT 展示具体错因，把归因
   * 留在接口里就等于把泄露面留在了接口里。需要排查时看仓储层自己的日志
   * （且那条日志必须经 `redact()` 脱敏后才允许输出）。
   */
  verify(profileId: string, pin: string): Promise<boolean>
}

/** {@link useProfileSelect} 的输入选项。 */
export interface ProfileSelectOptions {
  /** 数据能力窄接口；Task 9 的 `profileRepo` 落地后直接传入实现。 */
  store: ProfileStore
  /** 时钟；锁定倒计时需要，测试注入假时钟。缺省用浏览器定时器。 */
  clock?: Clock
  /** 登录成功后的导航；缺省为不导航（由 Task 17 装配时替换）。 */
  navigate?: (path: string) => void
  /** 日志出口；发出的对象会先经 `redact()` 脱敏。 */
  logger?: (entry: Record<string, unknown>) => void
}

/** `setInterval` / `clearInterval` / `now` 的最小时钟接口。 */
export interface Clock {
  now(): number
  setInterval(handler: () => void, ms: number): number
  clearInterval(handle: number): void
}

/** 锁定 UI 状态。 */
export type PinStatus = 'idle' | 'verifying' | 'success' | 'error' | 'locked'

/** 指向 Home 的路由路径（Task 17 挂路由时保持一致）。 */
export const HOME_PATH = '/home'

/** 锁定阈值：连续失败 5 次（spec `child-profiles` §PIN 错误）。 */
export const MAX_PIN_FAILURES = 5

/** 锁定时长：60 秒（spec `child-profiles` §PIN 错误）。 */
export const LOCK_SECONDS = 60

/** PIN 位数：4 位（spec `child-profiles` §档案创建与 PIN 切换）。 */
export const PIN_LENGTH = 4

/** 错误提示的唯一文案。 */
export const RETRY_MESSAGE = '再试一次'
