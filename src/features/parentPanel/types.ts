import type { DomainEvent, MasteryLevel, Profile, QuizType, Settings } from '@/domain/model/types'
import type { DigestFn } from '@/domain/crypto/hashPin'

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
