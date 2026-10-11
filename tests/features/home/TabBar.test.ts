import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TabBar from '@/features/home/TabBar.vue'

/**
 * `features/home/TabBar` 的行为契约（T17 审查 follow-up）。
 *
 * 锁一件事：**孩子的常驻导航里没有家长区**。`/parent` 不设任何身份验证
 * （`views/ParentView.vue`），孩子一键就能改题量、重置 PIN、删档案，因此它
 * 只能从档案选择页那个不显眼的页脚进入。这里断言页签集合只剩三个孩子页签，
 * 且点按任何一个都不会 emit 家长区的 id。
 */
describe('TabBar', () => {
  it('只渲染孩子页签，家长区不在常驻导航里', () => {
    const bar = mount(TabBar, { props: { active: 'home' } })

    expect(bar.findAll('.tab-bar__item')).toHaveLength(3)
    expect(bar.text()).not.toContain('家长区')
    expect(bar.find('[data-testid="tab-parent"]').exists()).toBe(false)
    for (const tabId of ['home', 'bestiary', 'mistake']) {
      expect(bar.find(`[data-testid="tab-${tabId}"]`).exists()).toBe(true)
    }
  })

  it('点按页签 emit 页签 id，载荷永远不会是家长区', async () => {
    const bar = mount(TabBar, { props: { active: 'home' } })

    await bar.get('[data-testid="tab-bestiary"]').trigger('click')
    await bar.get('[data-testid="tab-mistake"]').trigger('click')

    expect(bar.emitted('navigate')).toEqual([['bestiary'], ['mistake']])
  })
})
