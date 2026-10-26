import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MapPanel from '@/features/home/MapPanel.vue'
import { resolveDeepSeaProgress } from '@/features/bestiary/deepSeaProgress'
import { homeThemeById } from '@/features/home/homeThemes'

describe('MapPanel ten-stage map', () => {
  it('renders ten stages, marks completed/current/locked, and shows progress', () => {
    const view = mount(MapPanel, {
      props: {
        currentZoneIndex: 1,
        completedQuests: 3,
        theme: homeThemeById('deep-sea'),
        stageProgress: resolveDeepSeaProgress(3),
      },
    })

    expect(view.find('[data-testid="deep-sea-stages"]').exists()).toBe(true)
    for (let stage = 1; stage <= 10; stage += 1) {
      expect(view.find(`[data-testid="stage-${stage}"]`).exists()).toBe(true)
    }
    expect(view.get('[data-testid="stage-1"]').classes()).toContain('map-panel__stage--done')
    expect(view.get('[data-testid="stage-4"]').classes()).toContain('map-panel__stage--current')
    expect(view.get('[data-testid="stage-10"]').classes()).toContain('map-panel__stage--locked')
    expect(view.text()).toContain('深海通关 3 / 10')
  })
})
