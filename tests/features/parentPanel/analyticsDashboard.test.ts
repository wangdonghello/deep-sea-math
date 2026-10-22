import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AnalyticsDashboard from '@/features/parentPanel/AnalyticsDashboard.vue'
import { emptySnapshot, type AnalyticsSnapshot } from '@/features/parentPanel/analyticsCounters'

function snapshotWithData(): AnalyticsSnapshot {
  const base = emptySnapshot()
  return {
    ...base,
    pages: base.pages.map((page) => ({ ...page, count: page.key === 'page-home' ? 12 : page.key === 'page-bestiary' ? 8 : 0 })),
    profiles: base.pages.length === 0 ? [] : [{ grade: 1, themeId: 'dinosaur', count: 3 }],
    sessions: [{ grade: 1, themeId: 'dinosaur', count: 2 }, { grade: 2, themeId: 'space', count: 4 }],
    pageTotal: 20,
    profileTotal: 3,
    sessionTotal: 6,
  }
}

describe('AnalyticsDashboard', () => {
  it('renders totals and chart rows from counters', async () => {
    const view = mount(AnalyticsDashboard, { props: { loader: async () => snapshotWithData() } })
    await flushPromises()
    expect(view.get('[data-testid="analytics-page-total"]').text()).toBe('20')
    expect(view.get('[data-testid="analytics-profile-total"]').text()).toBe('3')
    expect(view.get('[data-testid="analytics-session-total"]').text()).toBe('6')
    expect(view.findAll('[data-testid="analytics-page-row"]')).toHaveLength(7)
    expect(view.findAll('[data-testid="analytics-profile-row"]')).toHaveLength(3)
    expect(view.text()).toContain('恐龙')
  })

  it('shows an empty state when there are no samples', async () => {
    const view = mount(AnalyticsDashboard, { props: { loader: async () => emptySnapshot() } })
    await flushPromises()
    expect(view.find('[data-testid="analytics-empty"]').exists()).toBe(true)
  })
})
