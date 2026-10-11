import { describe, expect, it } from 'vitest'

import {
  createMemoryBestiaryRepo,
  createMemoryEventRepo,
  createMemoryProfileRepo,
  createMemorySettingsRepo,
} from '../../../src/data/memoryFallback'
import { DEFAULT_SETTINGS } from '../../../src/data/repositories/settingsRepo'
import {
  NOW,
  PROFILE_A,
  PROFILE_B,
  answerSubmittedEvent,
  makeProfile,
  makeSettings,
  profileCreatedEvent,
  sameMillisecondHints,
  settingsUpdatedEvent,
  sessionStartedEvent,
} from '../fixtures'

/**
 * 内存态仓储与 IndexedDB 态仓储的**契约对齐**。
 *
 * 降级的意义是"换介质不换行为"：上层拿到的接口完全相同， Assert 的行为也必须
 * 相同。这里用与 `tests/data/repositories/*` 同一批夹具、同一组断言跑内存态
 * 实现——哪天内存的语义漂移了（例如某天给它加了排序、或漏了档案隔离），
 * 这个文件会先红，而不是等到用户在隐私模式下踩到。
 *
 * 另锁一件内存态特有的事：读回的是**副本**，改调用方手里的对象不会污染库里
 * 那份（IndexedDB 态靠结构化克隆天然做到，内存态必须自己做）。
 */
describe('memoryFallback: 与 IndexedDB 态同契约', () => {
  it('profileRepo：save/get/list/remove 与覆盖写', async () => {
    const repo = createMemoryProfileRepo()
    const profile = makeProfile(PROFILE_A)

    await repo.save(profile)
    expect(await repo.get(PROFILE_A)).toEqual(profile)
    expect(await repo.list()).toEqual([profile])

    await repo.save({ ...profile, nickname: '小潜' })
    expect(await repo.list()).toHaveLength(1)
    expect((await repo.list())[0].nickname).toBe('小潜')

    expect(await repo.get('missing')).toBeUndefined()
    await repo.save(makeProfile(PROFILE_B))
    await repo.remove(PROFILE_A)
    expect(await repo.get(PROFILE_A)).toBeUndefined()
    expect(await repo.list()).toEqual([makeProfile(PROFILE_B)])
  })

  it('profileRepo：读回的是副本，改调用方对象不污染库内数据', async () => {
    const repo = createMemoryProfileRepo()
    await repo.save(makeProfile(PROFILE_A))

    const read = await repo.get(PROFILE_A)
    if (read === undefined) {
      throw new Error('档案应当存在')
    }
    read.nickname = '被改坏了'

    expect((await repo.get(PROFILE_A))?.nickname).toBe('小深')
  })

  it('eventRepo：写入后读回一致，且按 occurredAt 排序', async () => {
    const repo = createMemoryEventRepo()

    await repo.append([profileCreatedEvent(PROFILE_A), sessionStartedEvent(PROFILE_A)])

    expect(await repo.listByProfile(PROFILE_A)).toEqual([
      profileCreatedEvent(PROFILE_A),
      sessionStartedEvent(PROFILE_A),
    ])
  })

  it('eventRepo：同一 eventId 重复写入只留一条（含跨批次）', async () => {
    const repo = createMemoryEventRepo()
    const event = answerSubmittedEvent(PROFILE_A)

    await repo.append([event])
    await repo.append([{ ...event }])

    expect(await repo.listByProfile(PROFILE_A)).toHaveLength(1)
    expect(await repo.countByProfile(PROFILE_A)).toBe(1)
  })

  it('eventRepo：换 eventId 但同一逻辑组合不落两条（复用 appendEvents 的口径）', async () => {
    const repo = createMemoryEventRepo()
    const first = answerSubmittedEvent(PROFILE_A, 'a')
    const retried = { ...first, eventId: 'b' }

    await repo.append([first])
    await repo.append([retried])

    expect(await repo.countByProfile(PROFILE_A)).toBe(1)
  })

  it('eventRepo：按档案隔离，removeByProfile 只清目标档案', async () => {
    const repo = createMemoryEventRepo()
    await repo.append([profileCreatedEvent(PROFILE_A)])
    await repo.append([profileCreatedEvent(PROFILE_B)])

    await repo.removeByProfile(PROFILE_A)

    expect(await repo.listByProfile(PROFILE_A)).toEqual([])
    expect(await repo.listByProfile(PROFILE_B)).toEqual([profileCreatedEvent(PROFILE_B)])
  })

  it('eventRepo：空批次不写库，未知档案读回空数组', async () => {
    const repo = createMemoryEventRepo()

    expect(await repo.append([])).toEqual([])
    expect(await repo.listByProfile(PROFILE_A)).toEqual([])
    expect(await repo.countByProfile(PROFILE_A)).toBe(0)
  })

  it('settingsRepo：缺省即可用，写后读回一致，按档案隔离', async () => {
    const repo = createMemorySettingsRepo()

    expect(await repo.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)
    await repo.save(PROFILE_A, makeSettings())
    expect(await repo.get(PROFILE_A)).toEqual(makeSettings())
    expect(await repo.get(PROFILE_B)).toEqual(DEFAULT_SETTINGS)
  })

  it('settingsRepo：remove 回落默认且不影响其他档案（删档清理用）', async () => {
    const repo = createMemorySettingsRepo()

    await repo.save(PROFILE_A, makeSettings())
    await repo.save(PROFILE_B, makeSettings())

    await repo.remove(PROFILE_A)

    expect(await repo.get(PROFILE_A)).toEqual(DEFAULT_SETTINGS)
    expect(await repo.get(PROFILE_B)).toEqual(makeSettings())
    // 再写一次可以正常覆盖，说明 remove 真删了行而不是打了个标记。
    await repo.save(PROFILE_A, { ...makeSettings(), basicCount: 2 })
    expect((await repo.get(PROFILE_A)).basicCount).toBe(2)
  })

  it('bestiaryRepo：未写过为 undefined，覆盖写，clear 回到 undefined', async () => {
    const repo = createMemoryBestiaryRepo()

    expect(await repo.load(PROFILE_A)).toBeUndefined()
    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })
    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['b'] })
    expect(await repo.load(PROFILE_A)).toEqual({ profileId: PROFILE_A, unlockedCreatureIds: ['b'] })

    await repo.clear(PROFILE_A)
    expect(await repo.load(PROFILE_A)).toBeUndefined()
  })

  it('bestiaryRepo：按档案隔离', async () => {
    const repo = createMemoryBestiaryRepo()

    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })
    await repo.save({ profileId: PROFILE_B, unlockedCreatureIds: ['b'] })

    expect(await repo.load(PROFILE_A)).toEqual({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })
    expect(await repo.load(PROFILE_B)).toEqual({ profileId: PROFILE_B, unlockedCreatureIds: ['b'] })
  })

  it('bestiaryRepo：读回的是副本，改调用方数组不污染库内缓存', async () => {
    const repo = createMemoryBestiaryRepo()
    await repo.save({ profileId: PROFILE_A, unlockedCreatureIds: ['a'] })

    const cache = await repo.load(PROFILE_A)
    cache?.unlockedCreatureIds.push('被改坏了')

    expect((await repo.load(PROFILE_A))?.unlockedCreatureIds).toEqual(['a'])
  })

  it('eventRepo：追加 settings-updated 这类无逻辑组合键的事件只按 eventId 去重', async () => {
    const repo = createMemoryEventRepo()
    const first = settingsUpdatedEvent(PROFILE_A, 's-1')
    const second = settingsUpdatedEvent(PROFILE_A, 's-2')

    await repo.append([first, second])

    expect(await repo.countByProfile(PROFILE_A)).toBe(2)
  })

  it('eventRepo：混档批次抛错，与 IndexedDB 态同一口径', async () => {
    const repo = createMemoryEventRepo()

    await expect(
      repo.append([profileCreatedEvent(PROFILE_A), profileCreatedEvent(PROFILE_B)]),
    ).rejects.toThrow('同属一个档案')

    expect(await repo.countByProfile(PROFILE_A)).toBe(0)
    expect(await repo.countByProfile(PROFILE_B)).toBe(0)
  })

  it('eventRepo：同毫秒事件按写入次序返回，与 IndexedDB 态同口径', async () => {
    const repo = createMemoryEventRepo()
    // eventId 字典序与写入序相反（z3/z2/z1），level 各不同以避开逻辑去重。
    const batch = sameMillisecondHints(3, NOW, ['z3', 'z2', 'z1'])

    await repo.append(batch)

    expect((await repo.listByProfile(PROFILE_A)).map((event) => event.eventId)).toEqual([
      'z3',
      'z2',
      'z1',
    ])
  })
})
