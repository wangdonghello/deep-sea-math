import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShopView from '@/views/ShopView.vue'
import type { DomainEvent } from '@/domain/model/types'

const adopted: DomainEvent = {
  eventId: 'a', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝',
}

/** 模拟生产仓储：按 eventId 去重，返回合并后的全量日志。 */
function makeStore(seed: readonly DomainEvent[]) {
  let events = [...seed]
  return {
    async listEvents(profileId: string) {
      return events.filter((event) => event.profileId === profileId)
    },
    async appendEvents(incoming: readonly DomainEvent[]) {
      const known = new Set(events.map((event) => event.eventId))
      events = [...events, ...incoming.filter((event) => !known.has(event.eventId))]
      return events.filter((event) => event.profileId === incoming[0]?.profileId)
    },
  }
}

function richStore(): ReturnType<typeof makeStore> {
  return makeStore([
    adopted,
    ...Array.from({ length: 30 }, (_, i) => ({
      eventId: `ans-${i}`, profileId: 'p1', occurredAt: i + 2, type: 'answer-submitted' as const,
      sessionId: 's1', questionId: `q${i}`, submitted: '1', correct: true,
      usedHintLevel: 0, retryCount: 0, ms: 10,
    })),
  ])
}

describe('ShopView', () => {
  it('余额不足时购买按钮禁用', async () => {
    const view = mount(ShopView, {
      props: { profileId: 'p1', store: makeStore([adopted]), clock: () => 2 },
    })
    await flushPromises()
    expect(view.get('[data-testid="buy-glow-ball"]').attributes('disabled')).toBeDefined()
    expect(view.get('[data-testid="shop-points"]').text()).toContain('0')
  })

  it('余额足够时购买成功并显示已拥有', async () => {
    const view = mount(ShopView, {
      props: { profileId: 'p1', store: richStore(), clock: () => 100 },
    })
    await flushPromises()
    expect(view.get('[data-testid="shop-points"]').text()).toContain('30')
    await view.get('[data-testid="buy-glow-ball"]').trigger('click')
    await flushPromises()
    expect(view.get('[data-testid="buy-glow-ball"]').text()).toContain('已拥有')
  })

  it('买食物后进入背包并显示数量', async () => {
    const view = mount(ShopView, {
      props: { profileId: 'p1', store: richStore(), clock: () => 100 },
    })
    await flushPromises()
    await view.get('[data-testid="buy-seaweed-cookie"]').trigger('click')
    await flushPromises()
    expect(view.get('[data-testid="shop-bag"]').text()).toContain('海藻饼干 ×1')
  })
})
