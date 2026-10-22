import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { replayProjections } from '@/domain/eventLog/replay'
import type { DomainEvent, ThemeId } from '@/domain/model/types'
import { themePackById } from '@/data/content/themePacks'
import type { ThemeEntry } from '@/data/content/themePacks'

export interface ThemeCollectionItem {
  entry: ThemeEntry
  unlocked: boolean
}

export interface ThemeCollectionStore {
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
}

/** 主题图鉴：阶段 = 已完成题组数（封顶 4），条目按阶段解锁。 */
export function useThemeCollection(options: {
  store: ThemeCollectionStore
  profileId: MaybeRefOrGetter<string | null>
  themeId: MaybeRefOrGetter<ThemeId>
}) {
  const stage = ref(0)
  const loading = ref(false)
  const error = ref(false)
  let generation = 0
  const pack = computed(() => themePackById(toValue(options.themeId)))
  const items = computed<ThemeCollectionItem[]>(() => pack.value.entries.map((entry) => ({
    entry,
    unlocked: entry.stage <= stage.value,
  })))
  const noProfile = computed(() => toValue(options.profileId) === null)

  async function load(): Promise<void> {
    const profileId = toValue(options.profileId)
    const request = ++generation
    stage.value = 0
    error.value = false
    if (profileId === null) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const events = await options.store.listEvents(profileId)
      if (request !== generation) return
      replayProjections(events, { profileId })
      const completed = events.filter((event) => event.type === 'session-completed' && event.profileId === profileId).length
      stage.value = Math.min(completed, 4)
    } catch {
      if (request === generation) error.value = true
    } finally {
      if (request === generation) loading.value = false
    }
  }

  watch([() => toValue(options.profileId), () => toValue(options.themeId)], () => { void load() }, { immediate: true })
  return { pack, stage: computed(() => stage.value), items, loading, error, noProfile, load }
}
