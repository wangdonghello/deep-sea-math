import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UnlockOverlay from '@/features/unlock/UnlockOverlay.vue'

describe('UnlockOverlay', () => {
  it('展示本轮积分', () => {
    const view = mount(UnlockOverlay, {
      props: {
        open: true,
        rewards: [{ kind: 'badge' as const, targetId: 'accuracy-perfect', label: '百发百中徽章' }],
        points: 17,
      },
    })
    expect(view.get('[data-testid="unlock-points"]').text()).toContain('17')
  })

  it('积分为 0 时不展示积分行', () => {
    const view = mount(UnlockOverlay, { props: { open: true, rewards: [], points: 0 } })
    expect(view.find('[data-testid="unlock-points"]').exists()).toBe(false)
  })
})
