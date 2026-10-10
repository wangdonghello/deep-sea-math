import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { CREATURE_BANK } from '@/data/content'
import { replayProjections } from '@/domain/eventLog/replay'
import { BASE_ZONE, ZONES } from '@/features/home/zones'
import type { BestiaryItem, BestiaryStore, MapZoneItem } from './types'

/** Loads event-authoritative creature and zone unlocks for one profile. */
export function useBestiary(options: { store: BestiaryStore; profileId: MaybeRefOrGetter<string | null> }) {
  const items = ref<readonly BestiaryItem[]>([])
  const zones = ref<readonly MapZoneItem[]>([])
  const loading = ref(false)
  const error = ref(false)
  let generation = 0
  const currentZoneId = computed(() => {
    if (loading.value || error.value) return null
    return zones.value.find((zone) => zone.current)?.id ?? BASE_ZONE.id
  })

  /**
   * True while no learning profile is selected.
   *
   * An absent profile must never be presented as "standing at the base": the map
   * keeps its content hidden until a profile is chosen.
   */
  const noProfile = computed(() => toValue(options.profileId) === null)

  /** Rebuilds both views from the profile's full event history. */
  async function load(): Promise<void> {
    const profileId = toValue(options.profileId)
    const request = ++generation
    items.value = []
    zones.value = []
    error.value = false
    if (profileId === null) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const events = await options.store.listEvents(profileId)
      if (request !== generation) return
      const unlocks = replayProjections(events, { profileId }).bestiaryUnlock
      items.value = CREATURE_BANK.creatures.map((creature) => ({
        creature,
        unlocked: unlocks[`creature:${creature.id}`] !== undefined,
      }))
      zones.value = mapZones(unlocks)
    } catch {
      if (request !== generation) return
      error.value = true
    } finally {
      if (request === generation) loading.value = false
    }
  }

  watch(() => toValue(options.profileId), () => { void load() }, { immediate: true })
  return { items, zones, loading, error, noProfile, currentZoneId, load }
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
