import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BadgesView from '@/views/BadgesView.vue'
import type { DomainEvent, ThemeId } from '@/domain/model/types'

function completedSession(index: number, themeId: ThemeId = 'deep-sea'): DomainEvent[] {
  const sessionId = `s-${themeId}-${index}`
  return [
    {
      eventId: `started-${sessionId}`, profileId: 'p1', occurredAt: index * 2,
      type: 'session-started', sessionId, questionIds: [], difficultyTrace: [], themeId,
    },
    {
      eventId: `completed-${sessionId}`, profileId: 'p1', occurredAt: index * 2 + 1,
      type: 'session-completed', sessionId, rewards: ['quest-complete'],
    },
  ]
}

function store(events: readonly DomainEvent[]) {
  return { async listEvents(profileId: string) { return events.filter((event) => event.profileId === profileId) } }
}

describe('BadgesView', () => {
  it('展示主题 / 学习 / 错题三组徽章，并标出已获得与未获得', async () => {
    const events = [
      ...[0, 1, 2].flatMap((index) => completedSession(index)),
      {
        eventId: 'practice', profileId: 'p1', occurredAt: 50, type: 'answer-submitted',
        sessionId: 'practice-q1', questionId: 'q1', submitted: '7', correct: true,
        usedHintLevel: 0, retryCount: 0, ms: 100,
      } satisfies DomainEvent,
    ]
    const view = mount(BadgesView, {
      props: { profileId: 'p1', themeId: 'deep-sea', store: store(events) },
    })
    await flushPromises()

    expect(view.get('[data-testid="badges-summary"]').text()).toContain('已获得 4 / 23')
    expect(view.get('[data-testid="badge-deep-sea-twilight"]').attributes('data-earned')).toBe('true')
    expect(view.get('[data-testid="badge-deep-sea-abyss"]').attributes('data-earned')).toBe('false')
    expect(view.get('[data-testid="badge-quest-complete"]').text()).toContain('已获得 3 次')
    // 做错题也能得徽章：一次练习就点亮“知错能改”。
    expect(view.get('[data-testid="badge-mistake-practice-1"]').attributes('data-earned')).toBe('true')
    expect(view.get('[data-testid="badge-mistake-fix-5"]').attributes('data-earned')).toBe('false')
    // 坚持分区存在于墙上。
    expect(view.find('[data-testid="badge-group-streak"]').exists()).toBe(true)
  })

  it('连续 3 天完成题组点亮坚持徽章，并显示当前称号与下一档', async () => {
    const day = 86_400_000
    const events: DomainEvent[] = [0, 1, 2].map((index) => ({
      eventId: `completed-${index}`, profileId: 'p1', occurredAt: Date.UTC(2026, 0, 1) + index * day,
      type: 'session-completed', sessionId: `s-${index}`, rewards: ['quest-complete'],
    }))
    const view = mount(BadgesView, {
      props: { profileId: 'p1', themeId: 'deep-sea', store: store(events) },
    })
    await flushPromises()

    expect(view.get('[data-testid="badge-streak-3"]').attributes('data-earned')).toBe('true')
    expect(view.get('[data-testid="badges-streak"]').text()).toContain('连续 3 天')
    expect(view.get('[data-testid="badges-next"]').text()).toContain('再得')
  })

  it('切换到恐龙主题时展示恐龙徽章而不是深海徽章', async () => {
    const events = [0, 1].flatMap((index) => completedSession(index, 'dinosaur'))
    const view = mount(BadgesView, {
      props: { profileId: 'p1', themeId: 'dinosaur', store: store(events) },
    })
    await flushPromises()

    expect(view.get('[data-testid="badge-group-theme"]').text()).toContain('恐龙主题徽章')
    expect(view.get('[data-testid="badge-dino-fern"]').attributes('data-earned')).toBe('true')
    expect(view.findAll('[data-testid="badge-deep-sea-twilight"]')).toHaveLength(0)
  })

  it('读取失败时给出中性提示而不是空白页', async () => {
    const broken = { async listEvents() { throw new Error('private path') } }
    const view = mount(BadgesView, {
      props: { profileId: 'p1', themeId: 'deep-sea', store: broken },
    })
    await flushPromises()

    expect(view.find('[data-testid="badges-error"]').exists()).toBe(true)
    expect(view.text()).not.toContain('private path')
  })
})
