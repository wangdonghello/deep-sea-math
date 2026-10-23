import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { CREATURE_BANK } from '@/data/content'
import { replayProjections } from '@/domain/eventLog/replay'
import { BASE_ZONE, ZONES } from '@/features/home/zones'
import { resolveZoneProgress, zoneIdsFromUnlockKeys } from './zoneProgress'
import { unlockedCreatureIdSet } from './unlockAccess'
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
      const unlockedCreatureIds = unlockedCreatureIdSet(unlocks)
      items.value = CREATURE_BANK.creatures.map((creature) => ({
        creature,
        unlocked: unlockedCreatureIds.has(creature.id),
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

/**
 * 把解锁投影翻成区域视图：当前所在 = 深度最大的已解锁区。
 *
 * 口径已抽到 {@link resolveZoneProgress}（首页地图也用它）——此前这里是
 * 唯一一份实现，首页另有一套 0/1 估算，两套在孩子完成过不止一组题时给出
 * 互相矛盾的"当前所在"。
 */
function mapZones(unlocks: Readonly<Record<string, unknown>>): MapZoneItem[] {
  const unlockedIds = zoneIdsFromUnlockKeys(Object.keys(unlocks))
  const currentId = resolveZoneProgress(unlockedIds).currentZoneId
  return ZONES.map((zone) => ({
    ...zone,
    unlocked: unlockedIds.has(zone.id),
    current: zone.id === currentId,
  }))
}
