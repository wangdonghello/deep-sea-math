import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import type { DomainEvent } from '@/domain/model/types'
import { resolveDeepSeaProgress, type DeepSeaProgress } from './deepSeaProgress'

/** 只读事件能力；与图鉴/首页共用同一窄接口。 */
export interface DeepSeaProgressStore {
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
}

/**
 * 从事件日志读取“已完成每日题组数”，推算 10 关进度。
 *
 * 只把 `session-completed` 计入通关：练习、看答案、单题作答都不算。
 * 同一 sessionId 重复完成也只算一次（事件层是幂等的，这里再按 id 去重，
 * 防止历史数据里出现重复完成事件时把进度算多）。
 */
export function useDeepSeaProgress(options: {
  store: DeepSeaProgressStore
  profileId: MaybeRefOrGetter<string | null>
}) {
  const progress = ref<DeepSeaProgress>(resolveDeepSeaProgress(0))
  const loading = ref(false)
  const error = ref(false)
  let generation = 0

  async function load(): Promise<void> {
    const profileId = toValue(options.profileId)
    const request = ++generation
    error.value = false
    if (profileId === null) {
      progress.value = resolveDeepSeaProgress(0)
      loading.value = false
      return
    }
    loading.value = true
    try {
      const events = await options.store.listEvents(profileId)
      if (request !== generation) return
      const sessions = new Set(events.flatMap((event) =>
        event.type === 'session-completed' && event.profileId === profileId ? [event.sessionId] : [],
      ))
      progress.value = resolveDeepSeaProgress(sessions.size)
    } catch {
      if (request === generation) error.value = true
    } finally {
      if (request === generation) loading.value = false
    }
  }

  watch(() => toValue(options.profileId), () => { void load() }, { immediate: true })
  return { progress, loading, error, load }
}
