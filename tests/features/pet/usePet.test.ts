import { describe, expect, it } from 'vitest'

import { usePet } from '@/features/pet/usePet'
import type { DomainEvent } from '@/domain/model/types'

function memoryStore(initial: DomainEvent[] = []) {
  const events = [...initial]
  return {
    events,
    async listEvents() { return [...events] },
    async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return incoming },
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

describe('usePet', () => {
  it('首次加载自动补 pet-adopted 事件', async () => {
    const store = memoryStore()
    const pet = usePet({ store, profileId: 'p1', clock: () => 10, name: '小蓝' })
    await pet.load()
    expect(store.events.some((event) => event.type === 'pet-adopted')).toBe(true)
    expect(pet.state.value.name).toBe('小蓝')
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

  it('并发加载只补一条领养事件', async () => {
    // watch immediate 已经触发一次加载；再并发等两次 load，既不能重复补领养，
    // 也不能各写一条同 id 的 pet-adopted。
    const store = memoryStore()
    const pet = usePet({ store, profileId: 'p1', clock: () => 10 })
    await Promise.all([pet.load(), pet.load()])
    expect(store.events.filter((event) => event.type === 'pet-adopted')).toHaveLength(1)
  })

  it('迁移水位线：领养前的完成记录不触发孵化，领养后的才补 pet-hatched', async () => {
    const store = memoryStore([
      // v3 历史：这条 session-completed 发生在领养之前，不能算作「学会后的孵化条件」。
      { eventId: 'old-session', profileId: 'p1', occurredAt: 1, type: 'session-completed', sessionId: 's0', rewards: [] },
      { ...adoption, occurredAt: 100 },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 300 })
    await pet.load()
    expect(store.events.some((event) => event.type === 'pet-hatched')).toBe(false)
    expect(pet.state.value.hatched).toBe(false)

    store.events.push({
      eventId: 'new-session', profileId: 'p1', occurredAt: 200,
      type: 'session-completed', sessionId: 's1', rewards: [],
    })
    await pet.load()
    expect(store.events.some((event) => event.type === 'pet-hatched')).toBe(true)
    expect(pet.state.value.hatched).toBe(true)
  })

  it('同日喂食达 3 次后拒绝且不落事件', async () => {
    const store = memoryStore([
      adoption,
      { eventId: 'fed-1', profileId: 'p1', occurredAt: 2, type: 'pet-fed', itemId: 'seaweed-cookie' },
      { eventId: 'fed-2', profileId: 'p1', occurredAt: 3, type: 'pet-fed', itemId: 'seaweed-cookie' },
      { eventId: 'fed-3', profileId: 'p1', occurredAt: 4, type: 'pet-fed', itemId: 'seaweed-cookie' },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 5 })
    await pet.load()
    await expect(pet.feed('seaweed-cookie')).rejects.toThrow('今天已经喂过 3 次了')
    expect(store.events.filter((event) => event.type === 'pet-fed')).toHaveLength(3)
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
