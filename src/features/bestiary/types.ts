import type { DomainEvent } from '@/domain/model/types'
import type { CreatureContent } from '@/data/content/schema'
export type { CreatureContent } from '@/data/content/schema'

/** Minimal event-history capability required by bestiary and map views. */
export interface BestiaryStore {
  /** Reads the complete event stream for one profile; projections remain derived. */
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
}

/** A content-bank creature paired with its replay-derived unlock state. */
export interface BestiaryItem {
  readonly creature: CreatureContent
  readonly unlocked: boolean
}

/** Zone display data with unlock state derived only from zone unlock entries. */
export interface MapZoneItem {
  readonly id: string
  readonly name: string
  readonly depthLabel: string
  readonly unlocked: boolean
  readonly current: boolean
}
