import { ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { usePet } from '@/features/pet/usePet'
import type { DomainEvent } from '@/domain/model/types'

/**
 * 内存态 store：按生产语义模拟事件仓储。
 *
 * - `listEvents` 只返回**该档案**的日志（生产按 `by_profile` 索引读）；
 * - `appendEvents` 按 `eventId` 幂等去重，返回**合并后的全量日志**（生产
 *   `EventRepo.append` 的返回值），调用方必须用它覆盖本地视角。
 */
function memoryStore(initial: DomainEvent[] = []) {
  const events = [...initial]
  const calls: string[] = []
  return {
    events,
    calls,
    async listEvents(profileId: string) {
      calls.push(profileId)
      return events.filter((event) => event.profileId === profileId)
    },
    async appendEvents(incoming: readonly DomainEvent[]) {
      const known = new Set(events.map((event) => event.eventId))
      for (const event of incoming) {
        if (known.has(event.eventId)) continue
        known.add(event.eventId)
        events.push(event)
      }
      const owners = new Set(incoming.map((event) => event.profileId))
      return events.filter((event) => owners.has(event.profileId))
    },
  }
}

/** 已领养的基线事件；新用例只在它之上追加历史。 */
const adoption: DomainEvent = {
  eventId: 'adopt-seed',
  profileId: 'p1',
  occurredAt: 1,
  type: 'pet-adopted',
  petId: 'baby-whale',
  name: '小蓝',
}

/** 手动放行的门闩：用来卡住某个档案的读取，制造「切换档案时上一次加载仍在途」。 */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('usePet', () => {
  it('新档案首次加载不自动送宠物', async () => {
    const store = memoryStore()
    const pet = usePet({ store, profileId: 'p1', clock: () => 10, name: '小蓝' })
    await pet.load()
    expect(store.events.some((event) => event.type === 'pet-adopted')).toBe(false)
    expect(pet.state.value.adopted).toBe(false)
    expect(pet.state.value.pets['baby-whale']).toBeUndefined()
  })

  it('余额不足时购买抛错且不落事件', async () => {
    const store = memoryStore([
      { eventId: 'a', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 2 })
    await pet.load()
    await expect(pet.buy('glow-ball')).rejects.toThrow('积分不足')
    expect(store.events.some((event) => event.type === 'item-purchased')).toBe(false)
  })

  it('并发加载不会补领养事件', async () => {
    const store = memoryStore()
    const pet = usePet({ store, profileId: 'p1', clock: () => 10 })
    await Promise.all([pet.load(), pet.load()])
    expect(store.events.filter((event) => event.type === 'pet-adopted')).toHaveLength(0)
  })

  it('同一毫秒内的多次抚摸使用不同事件 id', async () => {
    const store = memoryStore([adoption])
    const pet = usePet({ store, profileId: 'p1', clock: () => 2 })
    await pet.load()
    await Promise.all([pet.pet(), pet.pet()])
    const ids = store.events.filter((event) => event.type === 'pet-petted').map((event) => event.eventId)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('并发购买不会透支余额', async () => {
    // 8 个整组完成 = 40 分，够买一次 30 分的发光球，不够两次。
    const earned = Array.from({ length: 8 }, (_, index): DomainEvent => ({
      eventId: `session-${index}`,
      profileId: 'p1',
      occurredAt: 2 + index,
      type: 'session-completed',
      sessionId: `s${index}`,
      rewards: [],
    }))
    const store = memoryStore([adoption, ...earned])
    const pet = usePet({ store, profileId: 'p1', clock: () => 20 })
    await pet.load()
    expect(pet.state.value.points).toBe(40)

    const results = await Promise.allSettled([pet.buy('glow-ball'), pet.buy('glow-ball')])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    // 串行化之后第二笔要么因「已经拥有」要么因「积分不足」被拦，不会两笔都成功。
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)

    expect(store.events.filter((event) => event.type === 'item-purchased')).toHaveLength(1)
    expect(pet.state.value.points).toBe(10)
    expect(pet.state.value.points).toBeGreaterThanOrEqual(0)
  })

  it('并发购买食物时第二笔因余额不足失败', async () => {
    const store = memoryStore([
      adoption,
      // 1 个整组完成 = 5 分，刚好够买一份 5 分的海藻饼干，不够两份。
      { eventId: 'session-0', profileId: 'p1', occurredAt: 2, type: 'session-completed', sessionId: 's0', rewards: [] },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 20 })
    await pet.load()
    expect(pet.state.value.points).toBe(5)

    const results = await Promise.allSettled([pet.buy('seaweed-cookie'), pet.buy('seaweed-cookie')])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(String(rejected[0].reason)).toContain('积分不足')

    expect(store.events.filter((event) => event.type === 'item-purchased')).toHaveLength(1)
    expect(pet.state.value.points).toBe(0)
  })

  it('切换档案后各自加载，不复用别人的 pending', async () => {
    const gate = deferred()
    const store = memoryStore([
      { eventId: 'p1-adopt', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { eventId: 'p2-adopt', profileId: 'p2', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '泡泡' },
    ])
    // 卡住 p1 的读取，确保切到 p2 时 p1 的加载仍在途。
    const listEvents = store.listEvents
    store.listEvents = async (profileId: string) => {
      if (profileId === 'p1') await gate.promise
      return listEvents(profileId)
    }
    const profileId = ref<string | null>('p1')
    const pet = usePet({ store, profileId, clock: () => 2 })

    const p1Load = pet.load()
    profileId.value = 'p2'
    const p2Load = pet.load()
    gate.resolve()
    await Promise.all([p1Load, p2Load])

    // p2 不能被 p1 的进行中加载挡住，必须真正读过自己的日志。
    expect(store.calls).toContain('p2')
    expect(pet.state.value.name).toBe('泡泡')
    // p1 的读取晚到，也不能覆盖已经切过去的档案状态。
    expect(pet.state.value.name).toBe('泡泡')
  })

  it('动作排队期间切换档案，仍写到入口捕获的档案', async () => {
    const store = memoryStore([
      { eventId: 'p1-adopt', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { eventId: 'p2-adopt', profileId: 'p2', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '泡泡' },
    ])
    const profileId = ref<string | null>('p1')
    const pet = usePet({ store, profileId, clock: () => 2 })
    await pet.load()

    const p1Action = pet.pet() // 入口捕获 p1；真正执行排在下一次微任务
    profileId.value = 'p2' // 在它开始执行之前就切档
    await p1Action

    const petted = store.events.filter((event) => event.type === 'pet-petted')
    expect(petted).toHaveLength(1)
    expect(petted[0].profileId).toBe('p1')
  })

  it('挂起期间切换档案：两笔动作各自落在入口捕获的档案上', async () => {
    const gate = deferred()
    const store = memoryStore([
      { eventId: 'p1-adopt', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { eventId: 'p2-adopt', profileId: 'p2', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '泡泡' },
    ])
    const appendEvents = store.appendEvents
    let blocked = false
    store.appendEvents = async (incoming) => {
      if (!blocked) {
        blocked = true
        await gate.promise
      }
      return appendEvents(incoming)
    }
    const profileId = ref<string | null>('p1')
    const pet = usePet({ store, profileId, clock: () => 2 })
    await pet.load()

    const p1Action = pet.pet()
    await Promise.resolve() // 让第一笔动作进入 append 并卡在门闩上
    profileId.value = 'p2'
    await pet.load()
    const p2Action = pet.pet()
    gate.resolve()
    await Promise.all([p1Action, p2Action])

    // 入口决定归属：第一笔 p1、第二笔 p2，不会出现 p1 的动作写到 p2。
    const petted = store.events.filter((event) => event.type === 'pet-petted')
    expect(petted).toHaveLength(2)
    expect(petted.filter((event) => event.profileId === 'p1')).toHaveLength(1)
    expect(petted.filter((event) => event.profileId === 'p2')).toHaveLength(1)
    expect(pet.state.value.name).toBe('泡泡')
  })

  it('导入档案带着历史完成记录时立即孵化；没有完成记录则仍是蛋', async () => {
    const imported = memoryStore([
      // v3 历史：早于领养事件，但孩子确实已经学过——导入后直接破壳。
      { eventId: 'old-session', profileId: 'p1', occurredAt: 1, type: 'session-completed', sessionId: 's0', rewards: [] },
      { ...adoption, occurredAt: 100 },
    ])
    const importedPet = usePet({ store: imported, profileId: 'p1', clock: () => 300 })
    await importedPet.load()
    expect(imported.events.some((event) => event.type === 'pet-hatched')).toBe(true)
    expect(importedPet.state.value.hatched).toBe(true)

    const fresh = memoryStore([{ ...adoption, occurredAt: 100 }])
    const freshPet = usePet({ store: fresh, profileId: 'p1', clock: () => 300 })
    await freshPet.load()
    expect(fresh.events.some((event) => event.type === 'pet-hatched')).toBe(false)
    expect(freshPet.state.value.hatched).toBe(false)
  })

  it('同日可以连续喂食，背包空了才拒绝', async () => {
    const store = memoryStore([
      adoption,
      ...Array.from({ length: 5 }, (_, i) => ({
        eventId: `buy-${i}`, profileId: 'p1', occurredAt: 2, type: 'item-purchased' as const,
        itemId: 'seaweed-cookie', price: 5,
      })),
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 5 })
    await pet.load()
    for (let i = 0; i < 5; i += 1) await pet.feed('seaweed-cookie')
    expect(store.events.filter((event) => event.type === 'pet-fed')).toHaveLength(5)
    await expect(pet.feed('seaweed-cookie')).rejects.toThrow('背包里没有这个食物')
  })

  it('已拥有的玩具再次购买抛「已经拥有」', async () => {
    const store = memoryStore([
      adoption,
      { eventId: 'buy-glow-ball', profileId: 'p1', occurredAt: 2, type: 'item-purchased', itemId: 'glow-ball', price: 30 },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 3 })
    await pet.load()
    expect(pet.state.value.owned).toContain('glow-ball')
    await expect(pet.buy('glow-ball')).rejects.toThrow('已经拥有')
    expect(store.events.filter((event) => event.type === 'item-purchased')).toHaveLength(1)
  })

  it('装饰不能当玩具玩，且不占每日次数', async () => {
    const store = memoryStore([
      adoption,
      { eventId: 'buy-decor', profileId: 'p1', occurredAt: 2, type: 'item-purchased', itemId: 'seaweed-nest', price: 40 },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 3 })
    await pet.load()
    // 装饰同样在 owned 里，若只查 owned 就会让这条请求通过。
    expect(pet.state.value.owned).toContain('seaweed-nest')
    await expect(pet.play('seaweed-nest')).rejects.toThrow('这不是玩具')
    expect(store.events.some((event) => event.type === 'pet-played')).toBe(false)
  })
})

describe('盲盒', () => {
  const day = 86_400_000
  it('完成两天得两张券；只出不同的宠物蛋', async () => {
    const store = memoryStore([
      { ...adoption, occurredAt: 1 },
      { eventId: 's1', profileId: 'p1', occurredAt: 2, type: 'session-completed', sessionId: 'a', rewards: [] },
      { eventId: 's2', profileId: 'p1', occurredAt: day + 2, type: 'session-completed', sessionId: 'b', rewards: [] },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => day * 2, random: () => 0.1 })
    await pet.load()
    expect(pet.state.value.tickets).toBe(2)

    const first = await pet.openBlindBox()
    expect(first.reward.id).toBe('companion-cat')
    expect(first.reward.kind).toBe('animal')
    expect(pet.state.value.ownedAnimals).toContain('companion-cat')
    expect(pet.state.value.tickets).toBe(1)

    const second = await pet.openBlindBox()
    expect(second.reward.id).toBe('companion-dog')
    expect(pet.state.value.ownedAnimals).toEqual(['companion-cat', 'companion-dog'])
    expect(pet.state.value.tickets).toBe(0)
  })

  it('新档案第一张券开盒时领养、孵化并设为主宠物', async () => {
    const store = memoryStore([
      { eventId: 's1', profileId: 'p1', occurredAt: 2, type: 'session-completed', sessionId: 'a', rewards: [] },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 3, random: () => 0.1 })
    await pet.load()
    expect(pet.state.value.adopted).toBe(false)
    expect(pet.state.value.tickets).toBe(1)
    const draw = await pet.openBlindBox()
    expect(draw.reward.id).toBe('companion-cat')
    expect(pet.state.value.adopted).toBe(true)
    expect(pet.state.value.pets['companion-cat']?.hatched).toBe(true)
    expect(pet.state.value.mainPetId).toBe('companion-cat')
    expect(store.events.filter((event) => event.type === 'pet-adopted')).toHaveLength(1)
  })

  it('没有券时拒绝开盒', async () => {
    const store = memoryStore([{ ...adoption, occurredAt: 1 }])
    const pet = usePet({ store, profileId: 'p1', clock: () => 2 })
    await pet.load()
    await expect(pet.openBlindBox()).rejects.toThrow('还没有盲盒券')
  })

  it('集齐全部伙伴后拒绝开盒', async () => {
    const ids = ['companion-cat', 'companion-dog', 'companion-hamster', 'companion-lion', 'companion-tiger', 'companion-dragon']
    const store = memoryStore([
      { ...adoption, occurredAt: 1 },
      ...ids.map((id, i) => ({ eventId: `b${i}`, profileId: 'p1', occurredAt: 2, type: 'blind-box-opened' as const, rewardId: id, rewardKind: 'animal' as const })),
      ...Array.from({ length: 7 }, (_, i) => ({ eventId: `s${i}`, profileId: 'p1', occurredAt: (i + 1) * day, type: 'session-completed' as const, sessionId: `s${i}`, rewards: [] })),
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 8 * day })
    await pet.load()
    await expect(pet.openBlindBox()).rejects.toThrow('伙伴已经集齐')
  })
})

describe('多宠物', () => {
  it('可以把已拥有的动物设为主宠物', async () => {
    const store = memoryStore([
      { ...adoption, occurredAt: 1 },
      { eventId: 'b1', profileId: 'p1', occurredAt: 2, type: 'blind-box-opened', rewardId: 'companion-cat', rewardKind: 'animal' },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 3 })
    await pet.load()
    expect(pet.state.value.ownedAnimals).toEqual(['companion-cat'])
    expect(pet.state.value.mainPetId).toBe('baby-whale')
    await pet.setMainPet('companion-cat')
    expect(pet.state.value.mainPetId).toBe('companion-cat')
  })

  it('未拥有的宠物不能设为主宠物', async () => {
    const store = memoryStore([{ ...adoption, occurredAt: 1 }])
    const pet = usePet({ store, profileId: 'p1', clock: () => 3 })
    await pet.load()
    await expect(pet.setMainPet('companion-dragon')).rejects.toThrow('还没有这只宠物')
  })
})
