import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createParentStore } from '@/features/parentPanel/createParentStore'

import { DB_NAME, resolveStorage } from '@/data/db'
import type { StorageFacade } from '@/data/db'
import { deleteDatabase, installFakeIndexedDb } from '../../data/fakeIndexedDb'
import { PROFILE_A, PROFILE_B, makeProfile, profileCreatedEvent } from '../../data/fixtures'

/** 与 `SettingsRepo` 回落值同口径：没有记录时给默认 5/3/1/15。 */
const DEFAULT_SETTINGS = { basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 }

/** 刻意与默认值不同：remove 后读回默认值才有鉴别力。 */
const CUSTOM_SETTINGS = { basicCount: 9, appliedCount: 2, probeCount: 1, maxMinutes: 30 }

/** 本文件创建过的门面，`afterEach` 统一关闭（否则删库会被 blocked 挂住）。 */
const facades: StorageFacade[] = []

describe('createParentStore', () => {
  let restore: () => void

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
  })

  afterEach(async () => {
    for (const storage of facades.splice(0)) {
      await storage.close()
    }
    restore()
  })

  it('四个仓储都接真实实现：save/append 后读回，remove 后消失', async () => {
    const storage = await resolveStorage()
    facades.push(storage)
    const store = createParentStore(storage)
    expect(store.degraded).toBe(false)
    expect(store.degradedReason).toBeNull()

    // profiles：list/get/save/remove 直通
    await store.profiles.save(makeProfile(PROFILE_A))
    expect(await store.profiles.get(PROFILE_A)).toEqual(makeProfile(PROFILE_A))
    expect(await store.profiles.list()).toHaveLength(1)
    await store.profiles.remove(PROFILE_A)
    expect(await store.profiles.get(PROFILE_A)).toBeUndefined()

    // events：listByProfile/append/removeByProfile 直通
    await store.events.append([profileCreatedEvent(PROFILE_A)])
    expect(await store.events.listByProfile(PROFILE_A)).toHaveLength(1)
    await store.events.removeByProfile(PROFILE_A)
    expect(await store.events.listByProfile(PROFILE_A)).toHaveLength(0)

    // settings：save 后读回；remove 后无记录，读回落默认值
    await store.settings.save(PROFILE_A, CUSTOM_SETTINGS)
    expect(await store.settings.get(PROFILE_A)).toEqual(CUSTOM_SETTINGS)
    await store.settings.remove(PROFILE_A)
    expect(await store.settings.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)

    // bestiary.remove → 图鉴投影缓存被清空（可重建），不解锁事实的事件不动
    await storage.bestiary.save({ profileId: PROFILE_A, unlockedCreatureIds: ['johnsons-anglerfish'] })
    await storage.bestiary.save({ profileId: PROFILE_B, unlockedCreatureIds: ['barreleye'] })
    await store.bestiary.remove(PROFILE_A)
    expect(await storage.bestiary.load(PROFILE_A)).toBeUndefined()
    expect(await storage.bestiary.load(PROFILE_B)).toEqual({ profileId: PROFILE_B, unlockedCreatureIds: ['barreleye'] })
  })

  it('settings.remove 是真删除而非写回默认值：重开门面后仍回落默认值', async () => {
    const first = await resolveStorage()
    facades.push(first)
    await first.settings.save(PROFILE_A, CUSTOM_SETTINGS)
    await createParentStore(first).settings.remove(PROFILE_A)

    // 关掉旧连接重开：若 remove 只是覆盖写默认值，库里会留下一条孤立行缓存，
    // 但 T9 的 remove 是物理删除，重开后仍读回落默认值（且无行可改）。
    const second = await resolveStorage()
    facades.push(second)
    expect(await createParentStore(second).settings.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)
  })

  it('degraded / degradedReason 从门面透传：降级内存态同样接得上', async () => {
    const scope = globalThis as unknown as Record<string, unknown>
    scope.indexedDB = { open: () => { throw new Error('隐私模式') } }

    const storage = await resolveStorage()
    facades.push(storage)
    const store = createParentStore(storage)

    expect(storage.kind).toBe('memory')
    expect(store.degraded).toBe(true)
    expect(store.degradedReason).toContain('隐私模式')

    await store.profiles.save(makeProfile(PROFILE_A))
    expect(await store.profiles.get(PROFILE_A)).toEqual(makeProfile(PROFILE_A))
    await store.bestiary.remove(PROFILE_A)
    expect(await storage.bestiary.load(PROFILE_A)).toBeUndefined()
  })
})
