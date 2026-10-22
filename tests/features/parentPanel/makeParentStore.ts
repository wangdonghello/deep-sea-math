import type { DomainEvent, Profile, Settings } from '@/domain/model/types'
import type { ParentStore } from '@/features/parentPanel/types'

/**
 * 家长区测试用的内存态 `ParentStore` fake。
 *
 * 三个家长区页面（总览 / 设置报告 / 档案管理）测试共用同一份，避免每个测试
 * 文件各抄一遍存储桩——复制出来的第二份迟早与真实契约漂移（少一个
 * `removeByProfile` 转折，测试就再也测不到"删档清事件"）。
 */
export interface ParentStoreFake {
  store: ParentStore
  /** 档案表（键为档案 id）。 */
  profiles: Map<string, Profile>
  /** 设置表（键为档案 id）。 */
  settings: Map<string, Settings>
  /** 事件日志（可读）。 */
  events: DomainEvent[]
  /** 追加过的事件批次（扁平）。 */
  appended: DomainEvent[]
  /** 各段删除记录（`profile` / `events` / `settings` / `bestiary`）。 */
  removed: string[]
}

/** 造一份内存态家长区存储。 */
export function makeParentStore(
  options: { events?: DomainEvent[]; profiles?: Profile[]; degraded?: boolean } = {},
): ParentStoreFake {
  const profiles = new Map<string, Profile>((options.profiles ?? []).map((profile) => [profile.id, profile]))
  const settings = new Map<string, Settings>()
  const events = [...(options.events ?? [])]
  const appended: DomainEvent[] = []
  const removed: string[] = []
  const store: ParentStore = {
    degraded: options.degraded ?? false,
    degradedReason: options.degraded === true ? 'storage unavailable' : null,
    profiles: {
      list: async () => [...profiles.values()],
      get: async (id) => profiles.get(id),
      save: async (profile) => { profiles.set(profile.id, profile) },
      remove: async (id) => { profiles.delete(id); removed.push('profile') },
    },
    events: {
      listByProfile: async (id) => events.filter((event) => event.profileId === id),
      append: async (batch) => { appended.push(...batch); events.push(...batch); return [...batch] },
      removeByProfile: async () => { removed.push('events') },
    },
    settings: {
      get: async (id) => settings.get(id) ?? { basicCount: 4, appliedCount: 4, probeCount: 1, maxMinutes: 15 },
      save: async (id, value) => { settings.set(id, value) },
      remove: async () => { removed.push('settings') },
    },
    bestiary: { remove: async () => { removed.push('bestiary') } },
  }
  return { store, profiles, settings, events, appended, removed }
}
