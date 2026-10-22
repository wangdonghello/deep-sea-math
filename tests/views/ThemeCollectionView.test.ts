import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ThemeCollectionView from '@/views/ThemeCollectionView.vue'
import type { DomainEvent } from '@/domain/model/types'

const profileId = 'p1'
const events: DomainEvent[] = [
  { eventId: 's1', profileId, occurredAt: 1, type: 'session-started', sessionId: 's1', questionIds: [], difficultyTrace: [] },
  { eventId: 'c1', profileId, occurredAt: 2, type: 'session-completed', sessionId: 's1', rewards: [] },
]

describe('ThemeCollectionView', () => {
  it('renders the current theme and unlocks stage one entries', async () => {
    const view = mount(ThemeCollectionView, {
      props: {
        profileId,
        themeId: 'dinosaur',
        store: { listEvents: async () => events },
      },
    })
    await flushPromises()
    expect(view.get('[data-testid="collection-stage"]').text()).toContain('第 1 阶段')
    expect(view.findAll('[data-testid^="theme-entry-"]')).toHaveLength(8)
    expect(view.text()).toContain('三角龙')
  })

  it('opens knowledge cards for an unlocked entry', async () => {
    const view = mount(ThemeCollectionView, {
      props: {
        profileId,
        themeId: 'dinosaur',
        store: { listEvents: async () => events },
      },
    })
    await flushPromises()
    await view.get('[data-testid="theme-open-triceratops"]').trigger('click')
    expect(view.get('[data-testid="theme-detail"]').text()).toContain('白垩纪')
  })
})
