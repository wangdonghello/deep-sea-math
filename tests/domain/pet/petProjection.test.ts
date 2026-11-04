import { describe, expect, it } from 'vitest'

import { decayedHunger } from '@/domain/pet/growth'
import { replayPet } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

const base = { profileId: 'p1' }
const hour = 3_600_000

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

  it('lastUpdatedAt 取最近宠物事件时间，供展示层计算饱食度衰减', () => {
    const fedAt = 2
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: fedAt, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
      { ...base, eventId: 'c', occurredAt: fedAt, type: 'pet-fed', itemId: 'seaweed-cookie' },
    ]
    const now = fedAt + 5 * hour
    const pet = replayPet(events, 'p1', now)
    expect(pet.hunger).toBe(100)
    expect(pet.lastUpdatedAt).toBe(fedAt)
    expect(decayedHunger(pet.hunger, pet.lastUpdatedAt, now)).toBe(90)
  })

  it('答题、购买等非宠物事件不推进衰减锚点', () => {
    const fedAt = 10
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 9, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
      { ...base, eventId: 'c', occurredAt: fedAt, type: 'pet-fed', itemId: 'seaweed-cookie' },
      {
        ...base, eventId: 'd', occurredAt: fedAt + 5 * hour, type: 'answer-submitted',
        sessionId: 's1', questionId: 'q0', submitted: '1', correct: true,
        usedHintLevel: 0, retryCount: 0, ms: 10,
      },
    ]
    const now = fedAt + 10 * hour
    const pet = replayPet(events, 'p1', now)
    expect(pet.lastUpdatedAt).toBe(fedAt)
    expect(decayedHunger(pet.hunger, pet.lastUpdatedAt, now)).toBe(80)
  })

  it('已拥有装饰也不能当玩具玩耍', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 2, type: 'item-purchased', itemId: 'seaweed-nest', price: 40 },
      { ...base, eventId: 'c', occurredAt: 3, type: 'pet-played', itemId: 'seaweed-nest' },
    ]
    const pet = replayPet(events, 'p1', 4)
    expect(pet.owned).toContain('seaweed-nest')
    expect(pet.xp).toBe(0)
  })

  it('购买未知商品既不进库存也不进拥有列表', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'item-purchased', itemId: 'mystery-box', price: 10 },
    ]
    const pet = replayPet(events, 'p1', 2)
    expect(pet.owned).toEqual([])
    expect(pet.inventory['mystery-box']).toBeUndefined()
  })
})
