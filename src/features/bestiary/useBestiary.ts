import { computed, ref } from 'vue'

import { CREATURE_BANK } from '@/data/content'
import { replayProjections } from '@/domain/eventLog/replay'
import { BASE_ZONE, ZONES } from '@/features/home/zones'
import type { BestiaryItem, BestiaryStore, MapZoneItem } from './types'

/** Loads event-authoritative creature and zone unlocks for one profile. */
export function useBestiary(options: { store: BestiaryStore; profileId: string }) {
  const items = ref<readonly BestiaryItem[]>([])
  const zones = ref<readonly MapZoneItem[]>([])
  const loading = ref(true)
  const error = ref(false)
  const currentZoneId = computed(() => {
    if (loading.value || error.value) return null
    return zones.value.find((zone) => zone.current)?.id ?? BASE_ZONE.id
  })

  /** Rebuilds both views from the profile's full event history. */
  async function load(): Promise<void> {
    loading.value = true
    error.value = false
    try {
      const events = await options.store.listEvents(options.profileId)
      const unlocks = replayProjections(events, { profileId: options.profileId }).bestiaryUnlock
      items.value = CREATURE_BANK.creatures.map((creature) => ({
        creature,
        unlocked: unlocks[`creature:${creature.id}`] !== undefined,
      }))
      zones.value = mapZones(unlocks)
    } catch {
      error.value = true
      items.value = []
      zones.value = mapZones({})
    } finally {
      loading.value = false
    }
  }

  return { items, zones, loading, error, currentZoneId, load }
}

/** Selects the deepest explicitly unlocked zone; creature unlocks do not count. */
function mapZones(unlocks: Readonly<Record<string, unknown>>): MapZoneItem[] {
  const unlockedIds = new Set(ZONES.filter((zone) => unlocks[`zone:${zone.id}`] !== undefined).map((zone) => zone.id))
  const currentId = [...ZONES].reverse().find((zone) => unlockedIds.has(zone.id))?.id ?? BASE_ZONE.id
  return ZONES.map((zone) => ({
    ...zone,
    unlocked: unlockedIds.has(zone.id),
    current: zone.id === currentId,
  }))
}
