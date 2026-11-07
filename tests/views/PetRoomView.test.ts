import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PetRoomView from '@/views/PetRoomView.vue'
import type { DomainEvent } from '@/domain/model/types'

const baseEvents: readonly DomainEvent[] = [
  { eventId: 'a', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
  { eventId: 'b', profileId: 'p1', occurredAt: 2, type: 'pet-hatched' },
  { eventId: 'c', profileId: 'p1', occurredAt: 3, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
  ...Array.from({ length: 6 }, (_, i) => ({
    eventId: `ans-${i}`, profileId: 'p1', occurredAt: 4 + i, type: 'answer-submitted' as const,
    sessionId: 's1', questionId: `q${i}`, submitted: '1', correct: true,
    usedHintLevel: 0, retryCount: 0, ms: 10,
  })),
]

/** 每个用例一份独立事件流，避免喂食用例污染展示用例。 */
function makeStore(seed: readonly DomainEvent[] = baseEvents) {
  const events = [...seed]
  return {
    async listEvents() { return [...events] },
    async appendEvents(incoming: readonly DomainEvent[]) {
      const known = new Set(events.map((event) => event.eventId))
      events.push(...incoming.filter((event) => !known.has(event.eventId)))
      return events.filter((event) => event.profileId === (incoming[0]?.profileId ?? 'p1'))
    },
  }
}

describe('PetRoomView', () => {
  it('展示宠物、积分与喂食按钮', async () => {
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(), clock: () => 10 } })
    await flushPromises()
    expect(view.get('[data-testid="pet-name"]').text()).toContain('小蓝')
    expect(view.get('[data-testid="pet-points"]').text()).toContain('1')
    expect(view.find('[data-testid="feed-seaweed-cookie"]').exists()).toBe(true)
    expect(view.get('[data-testid="pet-room"]').attributes('data-decor')).toBe('plain')
  })

  it('点喂食后食物数量减少、XP 增加', async () => {
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(), clock: () => 20 } })
    await flushPromises()
    await view.get('[data-testid="feed-seaweed-cookie"]').trigger('click')
    await flushPromises()
    expect(view.get('[data-testid="pet-xp"]').text()).toContain('8')
    expect(view.get('[data-testid="pet-reaction"]').text()).toContain('+8 XP')
    expect(view.get('[data-testid="pet-hunger"]').text()).toContain('饥饿值 0/100')
  })

  it('把饱食度反着展示成饥饿值', async () => {
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(), clock: () => 10 } })
    await flushPromises()
    // 饱食度 70、离线 8ms 后几乎不衰减 → 饥饿值 30，且界面不再出现「饱食度」字样。
    expect(view.get('[data-testid="pet-hunger"]').text()).toContain('饥饿值 30/100')
    expect(view.text()).not.toContain('饱食度')
    expect(view.get('[data-testid="pet-room"]').attributes('data-decor')).toBe('plain')
  })

  it('已孵化时把 Lv0 的蛋阶段画成幼体', async () => {
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(), clock: () => 10 } })
    await flushPromises()
    expect(view.get('svg[data-stage]').attributes('data-stage')).toBe('baby')
    expect(view.find('[data-testid="hatch-hint"]').exists()).toBe(false)
  })

  it('未孵化时只显示蛋与孵化提示，不显示互动按钮', async () => {
    const seed = baseEvents.filter((event) => event.type !== 'pet-hatched')
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(seed), clock: () => 10 } })
    await flushPromises()
    expect(view.get('[data-testid="hatch-hint"]').text()).toContain('完成一组题后孵化')
    expect(view.get('svg[data-stage]').attributes('data-stage')).toBe('egg')
    expect(view.find('[data-testid="feed-seaweed-cookie"]').exists()).toBe(false)
    expect(view.find('[data-testid="pet-pet"]').exists()).toBe(false)
  })

  it('按珊瑚 > 灯 > 巢的优先级切换房间装饰', async () => {
    const decor = (itemId: string, price: number, occurredAt: number): DomainEvent => ({
      eventId: `decor-${itemId}`, profileId: 'p1', occurredAt, type: 'item-purchased', itemId, price,
    })
    const nest = mount(PetRoomView, {
      props: { profileId: 'p1', store: makeStore([...baseEvents, decor('seaweed-nest', 40, 10)]), clock: () => 20 },
    })
    await flushPromises()
    expect(nest.get('[data-testid="pet-room"]').attributes('data-decor')).toBe('nest')

    const lamp = mount(PetRoomView, {
      props: {
        profileId: 'p1',
        store: makeStore([...baseEvents, decor('seaweed-nest', 40, 10), decor('shell-lamp', 55, 11)]),
        clock: () => 20,
      },
    })
    await flushPromises()
    expect(lamp.get('[data-testid="pet-room"]').attributes('data-decor')).toBe('lamp')

    const coral = mount(PetRoomView, {
      props: {
        profileId: 'p1',
        store: makeStore([
          ...baseEvents,
          decor('seaweed-nest', 40, 10),
          decor('shell-lamp', 55, 11),
          decor('coral-backdrop', 80, 12),
        ]),
        clock: () => 20,
      },
    })
    await flushPromises()
    expect(coral.get('[data-testid="pet-room"]').attributes('data-decor')).toBe('coral')
  })

  it('没有玩具时引导去商店，没有食物时不显示喂食按钮', async () => {
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(), clock: () => 10 } })
    await flushPromises()
    expect(view.text()).toContain('还没有玩具')
    expect(view.text()).toContain('去商店买玩具')

    const noFood = baseEvents.filter((event) => event.type !== 'item-purchased')
    const empty = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(noFood), clock: () => 10 } })
    await flushPromises()
    expect(empty.find('[data-testid="feed-seaweed-cookie"]').exists()).toBe(false)
    expect(empty.text()).toContain('背包里没有食物了')
  })

  it('喂食不再受每日次数限制', async () => {
    const purchases = Array.from({ length: 4 }, (_, i) => ({
      eventId: `buy-${i}`, profileId: 'p1', occurredAt: 10 + i, type: 'item-purchased' as const,
      itemId: 'seaweed-cookie', price: 5,
    }))
    const feeds = Array.from({ length: 3 }, (_, i) => ({
      eventId: `fed-${i}`, profileId: 'p1', occurredAt: 13 + i, type: 'pet-fed' as const,
      itemId: 'seaweed-cookie',
    }))
    const feed = mount(PetRoomView, {
      props: { profileId: 'p1', store: makeStore([...baseEvents, ...purchases, ...feeds]), clock: () => 20 },
    })
    await flushPromises()
    expect(feed.get('[data-testid="feed-seaweed-cookie"]').attributes('disabled')).toBeUndefined()
    expect(feed.text()).toContain('已喂 3 次')

    const pets = Array.from({ length: 5 }, (_, i) => ({
      eventId: `pet-${i}`, profileId: 'p1', occurredAt: 10 + i, type: 'pet-petted' as const,
    }))
    const pet = mount(PetRoomView, {
      props: { profileId: 'p1', store: makeStore([...baseEvents, ...pets]), clock: () => 20 },
    })
    await flushPromises()
    expect(pet.get('[data-testid="pet-pet"]').attributes('disabled')).toBeDefined()
    expect(pet.text()).toContain('今天摸够 5 次啦')

    const toyPurchase: DomainEvent = {
      eventId: 'toy', profileId: 'p1', occurredAt: 10, type: 'item-purchased', itemId: 'glow-ball', price: 30,
    }
    const plays = Array.from({ length: 2 }, (_, i) => ({
      eventId: `play-${i}`, profileId: 'p1', occurredAt: 11 + i, type: 'pet-played' as const,
      itemId: 'glow-ball',
    }))
    const play = mount(PetRoomView, {
      props: { profileId: 'p1', store: makeStore([...baseEvents, toyPurchase, ...plays]), clock: () => 20 },
    })
    await flushPromises()
    expect(play.get('[data-testid="play-glow-ball"]').attributes('disabled')).toBeDefined()
    expect(play.text()).toContain('今天已经玩够 2 次啦')
  })

  it('把开始探险、打开商店与返回首页转成事件', async () => {
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(), clock: () => 10 } })
    await flushPromises()
    await view.get('[data-testid="start-quest"]').trigger('click')
    await view.get('[data-testid="open-shop"]').trigger('click')
    await view.get('[data-testid="switch-profile"]').trigger('click')
    expect(view.emitted('start-quest')).toHaveLength(1)
    expect(view.emitted('open-shop')).toHaveLength(1)
    expect(view.emitted('back-home')).toHaveLength(1)
  })

  it('没有档案时只显示引导', async () => {
    const view = mount(PetRoomView, {
      props: { profileId: null, store: makeStore(), clock: () => 10 },
    })
    await flushPromises()
    expect(view.text()).toContain('请先选择学习档案')
    expect(view.find('[data-testid="pet-name"]').exists()).toBe(false)
  })
})

describe('盲盒入口', () => {
  it('有券时可开盒并关闭结果', async () => {
    const seed = [
      ...baseEvents,
      { eventId: 'done', profileId: 'p1', occurredAt: 5, type: 'session-completed' as const, sessionId: 's1', rewards: [] },
    ]
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(seed), clock: () => 20 } })
    await flushPromises()
    expect(view.get('[data-testid="blind-box-tickets"]').text()).toContain('1')
    await view.get('[data-testid="open-blind-box"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="blind-box-overlay"]').exists()).toBe(true)
    const close = view.find('[data-testid="blind-box-close"]')
    if (close.exists()) await close.trigger('click')
    expect(view.find('[data-testid="blind-box-overlay"]').exists()).toBe(false)
  })
})

describe('多宠物切换', () => {
  it('可在小鲸鱼与动物之间切换，并设为主宠物', async () => {
    const seed = [
      ...baseEvents,
      { eventId: 'cat', profileId: 'p1', occurredAt: 6, type: 'blind-box-opened' as const, rewardId: 'companion-cat', rewardKind: 'animal' as const },
    ]
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(seed), clock: () => 20 } })
    await flushPromises()
    expect(view.find('[data-testid="pet-option-companion-cat"]').exists()).toBe(true)
    await view.get('[data-testid="pet-option-companion-cat"]').trigger('click')
    expect(view.get('[data-testid="pet-name"]').text()).toContain('小猫')
    expect(view.find('[data-testid="animal-avatar"]').exists()).toBe(true)
    expect(view.get('[data-testid="pet-xp"]').text()).toContain('Lv.1')
    await view.get('[data-testid="set-main-pet"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="set-main-pet"]').exists()).toBe(false)
  })
})
