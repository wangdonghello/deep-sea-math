import { appendEvents } from '../domain/eventLog/appendEvents'
import type { DomainEvent, Profile, Settings } from '../domain/model/types'
import type { BestiaryCache, BestiaryRepo } from './repositories/bestiaryRepo'
import type { EventRepo } from './repositories/eventRepo'
import type { ProfileRepo } from './repositories/profileRepo'
import type { SettingsRepo } from './repositories/settingsRepo'
import { DEFAULT_SETTINGS } from './repositories/settingsRepo'

/**
 * `src/data/memoryFallback.ts` —— 存储降级：IndexedDB 不可用时的内存态实现。
 *
 * 触发场景（design §5 + spec `offline-event-log` §存储降级与家长提示）：
 * 隐私模式、存储超限、用户拒绝授权。此时系统 MUST 继续可用，并在家长区
 * 提示"进度不会被保存，请退出隐私模式"——内存态把数据留在当前会话里，
 * 既不静默丢弃，也不冒充持久化（刷新后仍在的是 IndexedDB 那条路）。
 *
 * 四个仓储与 `repositories/` 的 IndexedDB 态**同一份接口**：上层（features/
 * views）只依赖接口，不关心背后是库还是 Map，因此降级不需要任何调用方改动。
 */

/**
 * 深拷贝。
 *
 * 内存态之所以不能直接存调用方给的对象引用：上层会拿着读回的档案继续改
 * （改昵称、存表单草稿），共享引用会让"库里那份"跟着变，下次读回的就不是
 * 当初写进去的值。IndexedDB 态天然按值拷贝（结构化克隆过边界），内存态
 * 必须自己补齐这个语义，两个实现的行为才一致。
 */
function clone<T>(value: T): T {
  return structuredClone(value)
}

/** 内存态档案仓储（`Map<id, Profile>`）。 */
export function createMemoryProfileRepo(): ProfileRepo {
  const profiles = new Map<string, Profile>()

  return {
    async save(profile) {
      profiles.set(profile.id, clone(profile))
    },
    get(id) {
      const found = profiles.get(id)
      return Promise.resolve(found === undefined ? undefined : clone(found))
    },
    async list() {
      return [...profiles.values()].map((profile) => clone(profile))
    },
    async remove(id) {
      profiles.delete(id)
    },
  }
}

/** 内存态事件仓储（`Map<profileId, DomainEvent[]>`，去重复用 `appendEvents`）。 */
export function createMemoryEventRepo(): EventRepo {
  const logs = new Map<string, DomainEvent[]>()

  return {
    async append(incoming) {
      if (incoming.length === 0) {
        return []
      }
      const profileId = incoming[0].profileId
      if (!incoming.every((event) => event.profileId === profileId)) {
        // 与 IndexedDB 态同一口径：混档批次抛错，不猜档案。
        throw new Error('eventRepo.append: 一次追加的事件必须同属一个档案')
      }
      const merged = [...appendEvents(logs.get(profileId) ?? [], incoming)].sort(
        (left, right) => left.occurredAt - right.occurredAt,
      )
      logs.set(profileId, merged)
      return merged.map((event) => clone(event))
    },
    async listByProfile(profileId) {
      return (logs.get(profileId) ?? []).map((event) => clone(event))
    },
    async countByProfile(profileId) {
      return logs.get(profileId)?.length ?? 0
    },
    async removeByProfile(profileId) {
      logs.delete(profileId)
    },
  }
}

/** 内存态设置仓储（`Map<profileId, Settings>`，读缺省与 IndexedDB 态同口径）。 */
export function createMemorySettingsRepo(): SettingsRepo {
  const records = new Map<string, Settings>()

  return {
    async get(profileId) {
      const record = records.get(profileId)
      return record === undefined ? { ...DEFAULT_SETTINGS } : { ...record }
    },
    async save(profileId, settings) {
      records.set(profileId, { ...settings })
    },
    async remove(profileId) {
      records.delete(profileId)
    },
  }
}

/** 内存态图鉴仓储（`Map<profileId, BestiaryCache>`）。 */
export function createMemoryBestiaryRepo(): BestiaryRepo {
  const caches = new Map<string, BestiaryCache>()

  return {
    load(profileId) {
      const found = caches.get(profileId)
      return Promise.resolve(found === undefined ? undefined : clone(found))
    },
    async save(cache) {
      caches.set(cache.profileId, {
        profileId: cache.profileId,
        unlockedCreatureIds: [...cache.unlockedCreatureIds],
      })
    },
    async clear(profileId) {
      caches.delete(profileId)
    },
  }
}
