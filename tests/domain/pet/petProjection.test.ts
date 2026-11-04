import { describe, expect, it } from 'vitest'

import { replayPet } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

const base = { profileId: 'p1' }

describe('replayPet', () => {
  it('领养 → 孵化 → 状态就绪', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 2, type: 'pet-hatched' },
    ]
    const pet = replayPet(events, 'p1', 3)
    expect(pet.adopted).toBe(true)
    expect(pet.hatched).toBe(true)
    expect(pet.name).toBe('小蓝')
    expect(pet.stage).toBe('egg')
  })

  it('喂食扣背包、加 XP 与饱食度', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      ...Array.from({ length: 5 }, (_, i) => ({
        ...base, eventId: `ans-${i}`, occurredAt: 2 + i, type: 'answer-submitted' as const,
        sessionId: 's1', questionId: `q${i}`, submitted: '1', correct: true,
        usedHintLevel: 0, retryCount: 0, ms: 10,
      })),
      { ...base, eventId: 'b', occurredAt: 8, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
      { ...base, eventId: 'c', occurredAt: 9, type: 'pet-fed', itemId: 'seaweed-cookie' },
    ]
    const pet = replayPet(events, 'p1', 10)
    expect(pet.inventory['seaweed-cookie']).toBe(0)
    expect(pet.xp).toBe(8)
    expect(pet.points).toBe(0)
  })

  it('抚摸每天最多 5 次，超出不增加 XP', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      ...Array.from({ length: 7 }, (_, i) => ({ ...base, eventId: `p${i}`, occurredAt: i + 2, type: 'pet-petted' as const })),
    ]
    expect(replayPet(events, 'p1', 20).xp).toBe(10)
  })
})
