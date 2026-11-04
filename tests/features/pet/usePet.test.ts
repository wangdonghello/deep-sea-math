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
})
