import type { Answer, ChoiceOption, DomainEvent, MasteryLevel, QuizType } from '@/domain/model/types'
import type { MistakeEntry } from '@/domain/eventLog/replay'

/** Question-bank fields consumed by the mistake book, independent of its storage format. */
export interface MistakeQuestionMetadata {
  readonly type: QuizType
  readonly story?: { readonly title: string; readonly body?: string }
  readonly options?: readonly ChoiceOption[]
  readonly answer?: Answer
  readonly hints?: readonly string[]
  readonly similarQuestionIds: readonly string[]
}

/** Narrow catalog injection contract; a missing entry remains displayable by question ID. */
export type MistakeQuestionCatalog = Readonly<Record<string, MistakeQuestionMetadata | undefined>>

/** A mistake projection enriched only with presentation metadata. */
export interface MistakeBookItem extends MistakeEntry {
  readonly type: QuizType | null
  readonly title?: string
  readonly questionMasteryLevel: MasteryLevel
  readonly topicMasteryLevel: MasteryLevel | null
}

/** `all` is a view-only option and is never a domain mastery level or quiz type. */
export interface MistakeFilterState {
  readonly type: QuizType | 'all'
  readonly masteryLevel: MasteryLevel | 'all'
}

/** Events needed to rebuild the active profile's mistake projection. */
export interface MistakeBookStore {
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
}
