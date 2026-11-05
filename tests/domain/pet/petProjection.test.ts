import { describe, expect, it } from 'vitest'

import { decayedHunger } from '@/domain/pet/growth'
import { replayPet } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

const base = { profileId: 'p1' }
const hour = 3_600_000
const day = 86_400_000

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
    // 买装饰给 20 XP；装饰不能当玩具玩，所以没有额外的玩耍成长。
    expect(pet.xp).toBe(20)
  })

  it('购买未知商品既不进库存也不进拥有列表', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 2, type: 'item-purchased', itemId: 'mystery-box', price: 10 },
    ]
    const pet = replayPet(events, 'p1', 3)
    expect(pet.owned).toEqual([])
    expect(pet.inventory['mystery-box']).toBeUndefined()
  })

  it('喂食每天最多 3 次，跨天重置', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'adopt', occurredAt: 0, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      ...Array.from({ length: 5 }, (_, i) => ({
        ...base, eventId: `buy-${i}`, occurredAt: 1, type: 'item-purchased' as const,
        itemId: 'seaweed-cookie', price: 5,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        ...base, eventId: `feed-${i}`, occurredAt: 2 + i, type: 'pet-fed' as const,
        itemId: 'seaweed-cookie',
      })),
    ]
    const sameDay = replayPet(events, 'p1', 6)
    expect(sameDay.xp).toBe(24)
    expect(sameDay.inventory['seaweed-cookie']).toBe(2)
    // 第 4 次喂食没有生效，锚点仍停在第 3 次。
    expect(sameDay.lastUpdatedAt).toBe(4)

    const nextDay = replayPet(
      [...events, { ...base, eventId: 'feed-next', occurredAt: day + 1, type: 'pet-fed', itemId: 'seaweed-cookie' }],
      'p1',
      day + 2,
    )
    expect(nextDay.xp).toBe(32)
    expect(nextDay.inventory['seaweed-cookie']).toBe(1)
  })

  it('缺货喂食不消耗、不加 XP，也不推进衰减锚点', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 5, type: 'pet-fed', itemId: 'seaweed-cookie' },
    ]
    const pet = replayPet(events, 'p1', 10)
    expect(pet.xp).toBe(0)
    expect(pet.hunger).toBe(70)
    expect(pet.lastUpdatedAt).toBe(1)
  })

  it('同一 UTC 日第二次 session-completed 不重复加 XP', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 2, type: 'session-completed', sessionId: 's1', rewards: [] },
      { ...base, eventId: 'c', occurredAt: 3, type: 'session-completed', sessionId: 's2', rewards: [] },
    ]
    expect(replayPet(events, 'p1', 4).xp).toBe(15)
  })

  it('抚摸与玩耍按 UTC 日重置次数', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 0, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'toy', occurredAt: 1, type: 'item-purchased', itemId: 'glow-ball', price: 30 },
      ...Array.from({ length: 6 }, (_, i) => ({
        ...base, eventId: `pet-${i}`, occurredAt: 2 + i, type: 'pet-petted' as const,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        ...base, eventId: `play-${i}`, occurredAt: 10 + i, type: 'pet-played' as const,
        itemId: 'glow-ball',
      })),
    ]
    const firstDay = replayPet(events, 'p1', 13)
    // 买玩具 +10、抚摸 5×2 + 玩耍 2×6；超出的次数不生效。
    expect(firstDay.xp).toBe(32)
    expect(firstDay.mood).toBe(100)

    const secondDay = replayPet(
      [
        ...events,
        { ...base, eventId: 'pet-next', occurredAt: day + 1, type: 'pet-petted' },
        { ...base, eventId: 'play-next', occurredAt: day + 2, type: 'pet-played', itemId: 'glow-ball' },
      ],
      'p1',
      day + 3,
    )
    // 次日各再计 1 次。
    expect(secondDay.xp).toBe(40)
  })

  it('事件顺序不影响重放结果', () => {
    const adoption: DomainEvent = {
      ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝',
    }
    const purchase: DomainEvent = {
      ...base, eventId: 'b', occurredAt: 2, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5,
    }
    const feed: DomainEvent = { ...base, eventId: 'c', occurredAt: 3, type: 'pet-fed', itemId: 'seaweed-cookie' }

    const forward = replayPet([adoption, purchase, feed], 'p1', 4)
    const reversed = replayPet([feed, purchase, adoption], 'p1', 4)
    expect(forward.xp).toBe(8)
    expect(forward.inventory['seaweed-cookie']).toBe(0)
    expect(reversed).toEqual(forward)
  })

  it('只结算领养之后的事件，v3 历史不补发奖励', () => {
    const legacy: DomainEvent[] = Array.from({ length: 30 }, (_, i): DomainEvent[] => [
      {
        ...base, eventId: `ans-${i}`, occurredAt: (i + 1) * day, type: 'answer-submitted',
        sessionId: `s${i}`, questionId: `q${i}`, submitted: '1', correct: true,
        usedHintLevel: 0, retryCount: 0, ms: 10,
      },
      {
        ...base, eventId: `done-${i}`, occurredAt: (i + 1) * day + 1, type: 'session-completed',
        sessionId: `s${i}`, rewards: [],
      },
    ]).flat()

    const adopted: DomainEvent = {
      ...base, eventId: 'adopt', occurredAt: 31 * day, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝',
    }
    const afterAdoption: DomainEvent[] = [
      {
        ...base, eventId: 'ans-after', occurredAt: 31 * day + 1, type: 'answer-submitted',
        sessionId: 's-after', questionId: 'q-after', submitted: '1', correct: true,
        usedHintLevel: 0, retryCount: 0, ms: 10,
      },
      {
        ...base, eventId: 'done-after', occurredAt: 31 * day + 2, type: 'session-completed',
        sessionId: 's-after', rewards: [],
      },
    ]

    const pet = replayPet([...legacy, adopted, ...afterAdoption], 'p1', 32 * day)
    expect(pet.adopted).toBe(true)
    // 30 天的历史完成不会补发 450 XP，只算领养后的首次完成 +15。
    expect(pet.xp).toBe(15)
    // 领养后：答对 +1、整组 +5、正确率 ≥80% +3。
    expect(pet.points).toBe(9)
  })

  it('没有领养事件时积分与 XP 均为 0', () => {
    const events: DomainEvent[] = [
      {
        ...base, eventId: 'ans', occurredAt: 1, type: 'answer-submitted',
        sessionId: 's1', questionId: 'q1', submitted: '1', correct: true,
        usedHintLevel: 0, retryCount: 0, ms: 10,
      },
      { ...base, eventId: 'done', occurredAt: 2, type: 'session-completed', sessionId: 's1', rewards: [] },
    ]
    const pet = replayPet(events, 'p1', 3)
    expect(pet.adopted).toBe(false)
    expect(pet.xp).toBe(0)
    expect(pet.points).toBe(0)
  })

  it('领养发生在 0 时锚点保持 0，不被 now 兜底覆盖', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 0, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
    ]
    expect(replayPet(events, 'p1', 100).lastUpdatedAt).toBe(0)
  })

  it('owned 按字典序返回', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 2, type: 'item-purchased', itemId: 'glow-ball', price: 30 },
      { ...base, eventId: 'c', occurredAt: 3, type: 'item-purchased', itemId: 'coral-rattle', price: 45 },
    ]
    expect(replayPet(events, 'p1', 4).owned).toEqual(['coral-rattle', 'glow-ball'])
  })
})

describe('replayPet 盲盒', () => {
  const day = 86_400_000
  const adopted: DomainEvent = {
    eventId: 'adopt', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝',
  }

  it('每完成一天得一张券，开盒扣一张', () => {
    const events: DomainEvent[] = [
      adopted,
      { eventId: 's1', profileId: 'p1', occurredAt: 2, type: 'session-completed', sessionId: 'a', rewards: [] },
      { eventId: 's2', profileId: 'p1', occurredAt: day + 2, type: 'session-completed', sessionId: 'b', rewards: [] },
    ]
    expect(replayPet(events, 'p1', day * 2).tickets).toBe(2)
    events.push({ eventId: 'b1', profileId: 'p1', occurredAt: day * 2, type: 'blind-box-opened', rewardId: 'seaweed-cookie', rewardKind: 'snack' })
    const pet = replayPet(events, 'p1', day * 2)
    expect(pet.tickets).toBe(1)
    expect(pet.inventory['seaweed-cookie']).toBe(1)
  })

  it('经验与动物奖励生效，动物不重复', () => {
    const events: DomainEvent[] = [
      adopted,
      { eventId: 's1', profileId: 'p1', occurredAt: 2, type: 'session-completed', sessionId: 'a', rewards: [] },
      { eventId: 'b1', profileId: 'p1', occurredAt: 3, type: 'blind-box-opened', rewardId: 'xp-bonus', rewardKind: 'xp' },
      { eventId: 'b2', profileId: 'p1', occurredAt: 4, type: 'blind-box-opened', rewardId: 'companion-cat', rewardKind: 'animal' },
      { eventId: 'b3', profileId: 'p1', occurredAt: 5, type: 'blind-box-opened', rewardId: 'companion-cat', rewardKind: 'animal' },
    ]
    const pet = replayPet(events, 'p1', 10)
    expect(pet.xp).toBe(15 + 25)
    expect(pet.ownedAnimals).toEqual(['companion-cat'])
  })
})

describe('replayPet 成长来源', () => {
  const adopted: DomainEvent = {
    eventId: 'adopt', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝',
  }

  it('买玩具/装饰、订正错题都会增加 XP', () => {
    const events: DomainEvent[] = [
      adopted,
      { eventId: 'buy-toy', profileId: 'p1', occurredAt: 2, type: 'item-purchased', itemId: 'glow-ball', price: 30 },
      { eventId: 'buy-decor', profileId: 'p1', occurredAt: 3, type: 'item-purchased', itemId: 'seaweed-nest', price: 40 },
      ...Array.from({ length: 7 }, (_, i) => ({
        eventId: `fix-${i}`, profileId: 'p1', occurredAt: 4 + i, type: 'correction-done' as const,
        sessionId: 's1', questionId: `q${i}`, similarQuestionId: `s${i}`,
      })),
    ]
    // 玩具 +10、装饰 +20、订正每天最多 5 次 × 5 = 25。
    expect(replayPet(events, 'p1', 100).xp).toBe(10 + 20 + 25)
  })
})

describe('replayPet 多宠物各自成长', () => {
  it('喂不同宠物分别加各自的 XP', () => {
    const events: DomainEvent[] = [
      { eventId: 'a', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { eventId: 'h', profileId: 'p1', occurredAt: 2, type: 'pet-hatched', petId: 'baby-whale' },
      { eventId: 'c1', profileId: 'p1', occurredAt: 3, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
      { eventId: 'c2', profileId: 'p1', occurredAt: 4, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
      { eventId: 'cat', profileId: 'p1', occurredAt: 5, type: 'blind-box-opened', rewardId: 'companion-cat', rewardKind: 'animal' },
      { eventId: 'f1', profileId: 'p1', occurredAt: 6, type: 'pet-fed', itemId: 'seaweed-cookie', petId: 'baby-whale' },
      { eventId: 'f2', profileId: 'p1', occurredAt: 7, type: 'pet-fed', itemId: 'seaweed-cookie', petId: 'companion-cat' },
    ]
    const pet = replayPet(events, 'p1', 8)
    expect(pet.pets['baby-whale']?.xp).toBe(8)
    // 动物从 Lv1（40 XP）开始，再吃一份 +8。
    expect(pet.pets['companion-cat']?.xp).toBe(48)
    expect(pet.xp).toBe(8)
  })
})
