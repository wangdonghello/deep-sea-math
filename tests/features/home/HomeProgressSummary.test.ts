import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HomeProgressSummary from '@/features/home/HomeProgressSummary.vue'

describe('HomeProgressSummary', () => {
  it('点徽章格上报 open-badges，让孩子能进徽章墙', async () => {
    const view = mount(HomeProgressSummary, {
      props: {
        summary: {
          badgeCount: 3,
          unlockedCreatureCount: 9,
          totalCreatures: 30,
          unlockedZones: 3,
          completedSessions: 3,
        },
        totalZones: 4,
        themeId: 'deep-sea',
      },
    })

    expect(view.get('[data-testid="summary-badges"]').text()).toContain('3 枚徽章')
    await view.get('[data-testid="summary-badges-link"]').trigger('click')
    expect(view.emitted('open-badges')).toHaveLength(1)
  })
})
