import { describe, expect, it } from 'vitest'

import { findUnlockedCreature } from '@/app/unlockedCreature'
import type { DomainEvent } from '@/domain/model/types'

/** 只产 `session-completed`（不产 `unlock-granted`）的事件流。 */
function completions(count: number): DomainEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    eventId: `completed-${index}`,
    profileId: 'profile-a',
    occurredAt: index + 1,
    type: 'session-completed' as const,
    sessionId: `session-${index}`,
    rewards: [],
  }))
}

function stores(events: readonly DomainEvent[]) {
  return { quiz: { async listEvents() { return events } } }
}

/**
 * 回归：观察舱守卫必须与图鉴列表共用“通关即解锁”的口径。
 *
 * 事故表现：完成今天的题后，图鉴里的新关卡标签亮起，但点卡片会被守卫
 * 重定向回图鉴，看起来就是“点不进去”。
 */
describe('findUnlockedCreature 与十关进度对齐', () => {
  it('完成 3 组题后，第 3 关的座头鲸可以进入观察舱', async () => {
    const creature = await findUnlockedCreature(stores(completions(3)) as never, 'profile-a', 'humpback-whale')
    expect(creature?.id).toBe('humpback-whale')
  })

  it('还没通关的第 4 关仍然拒绝进入', async () => {
    const creature = await findUnlockedCreature(stores(completions(3)) as never, 'profile-a', 'blue-whale')
    expect(creature).toBeNull()
  })

  it('不存在的生物 id 返回 null，而不是抛错', async () => {
    const creature = await findUnlockedCreature(stores(completions(10)) as never, 'profile-a', 'not-a-creature')
    expect(creature).toBeNull()
  })
})
