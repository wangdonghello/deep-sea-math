import type { DomainEvent, MasteryLevel, Profile, QuizType, Settings } from '@/domain/model/types'
import type { DigestFn } from '@/domain/crypto/hashPin'
import type { Clock } from '@/features/profileSelect/types'

/** Task 16 所需的本地存储窄接口；组件不依赖 IndexedDB。 */
export interface ParentStore {
  readonly degraded: boolean
  readonly degradedReason: string | null
  profiles: {
    list(): Promise<Profile[]>
    get(id: string): Promise<Profile | undefined>
    save(profile: Profile): Promise<void>
    remove(id: string): Promise<void>
  }
  events: {
    listByProfile(profileId: string): Promise<DomainEvent[]>
    append(events: readonly DomainEvent[]): Promise<DomainEvent[]>
    removeByProfile(profileId: string): Promise<void>
  }
  settings: {
    get(profileId: string): Promise<Settings>
    save(profileId: string, settings: Settings): Promise<void>
    remove(profileId: string): Promise<void>
  }
  bestiary: { remove(profileId: string): Promise<void> }
}

export interface ParentReport {
  completedQuestions: number
  averageMs: number
  hintCount: number
  masteryByTopic: Readonly<Record<QuizType, Partial<Record<MasteryLevel, number>>>>
  /**
   * 题型掌握分布是否可用：注入了非空 `questionTypeById` 才有归属口径。
   *
   * 缺表时各题型分布只能是静默的 0（没有任何 `masteryByQuestion` 的题目
   * 能被归属到题型），界面据此显示占位提示而不是一排假 0。缺省视为可用
   * （`undefined` 时保持既有渲染），由 {@link useParentPanel} 始终显式赋值。
   */
  topicMasteryAvailable?: boolean
}

export interface ParentPanelOptions {
  store: ParentStore
  profileId: string | null
  clock?: () => number
  idGenerator?: () => string
  randomBytes?: (size: number) => Uint8Array
  digest?: DigestFn
  questionTypeById?: Readonly<Record<string, QuizType>>
  logger?: (entry: Record<string, unknown>) => void
}

/**
 * `guard` 库那条家长 PIN 记录在**本功能边界**的类型。
 *
 * 刻意不 import `@/data/db` 的 `GuardRecord`：`features/` 不得依赖 `data/`
 * （见 `src/README.md` 的分层）。这里用结构式最小面描述门禁真正用到的字段，
 * `GuardRepo` 结构上满足它，装配时一行接线即可。
 */
export interface ParentGuardRecord {
  /** 固定为 `'parent'`：家长 PIN 全场只有一条。 */
  id: 'parent'
  /** PIN 的 SHA-256 十六进制哈希。 */
  pinHash: string
  /** 该 PIN 专属的加盐值。 */
  salt: string
}

/** 家长门禁所需的窄接口（`GuardRepo` 的结构式最小面）。 */
export interface ParentGuardStore {
  /** 读取家长 PIN 记录；未设置过返回 `undefined`。 */
  load(): Promise<ParentGuardRecord | undefined>
  /** 覆盖写入家长 PIN 记录。 */
  save(record: ParentGuardRecord): Promise<void>
}

/** {@link useParentGate} 的输入选项。 */
export interface ParentGateOptions {
  /** 家长 PIN 数据能力窄接口。 */
  store: ParentGuardStore
  /** 时钟；5 次锁定倒计时需要，测试注入假时钟。缺省用浏览器定时器。 */
  clock?: Clock
  /** 随机盐来源；缺省走 Web Crypto。测试注入确定性实现。 */
  randomBytes?: (size: number) => Uint8Array
  /** 摘要算法；缺省走 `hashPin` 的 Web Crypto 分支。 */
  digest?: DigestFn
  /** 日志出口；发出的对象会先经 `redact()` 脱敏。 */
  logger?: (entry: Record<string, unknown>) => void
}
