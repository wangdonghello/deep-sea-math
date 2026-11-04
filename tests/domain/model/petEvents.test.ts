import { describe, expect, it } from 'vitest'

import { EVENT_TYPES, type DomainEvent } from '@/domain/model/types'

describe('pet events', () => {
  it('事件类型表包含宠物与经济事件', () => {
    for (const type of ['pet-adopted', 'pet-hatched', 'pet-fed', 'pet-petted', 'pet-played', 'item-purchased']) {
      expect(EVENT_TYPES).toContain(type)
    }
  })

  it('宠物事件可赋给 DomainEvent 联合类型', () => {
    const events: DomainEvent[] = [
      { eventId: 'e1', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { eventId: 'e2', profileId: 'p1', occurredAt: 2, type: 'pet-hatched' },
      { eventId: 'e3', profileId: 'p1', occurredAt: 3, type: 'pet-fed', itemId: 'seaweed-cookie' },
      { eventId: 'e4', profileId: 'p1', occurredAt: 4, type: 'pet-petted' },
      { eventId: 'e5', profileId: 'p1', occurredAt: 5, type: 'pet-played', itemId: 'glow-ball' },
      { eventId: 'e6', profileId: 'p1', occurredAt: 6, type: 'item-purchased', itemId: 'glow-ball', price: 30 },
    ]
    expect(events).toHaveLength(6)
  })
})
