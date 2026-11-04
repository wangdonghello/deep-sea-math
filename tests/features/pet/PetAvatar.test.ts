import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PetAvatar from '@/features/pet/PetAvatar.vue'

describe('PetAvatar', () => {
  it('按阶段渲染不同形态并带可访问名称', () => {
    const baby = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    expect(baby.get('svg').attributes('role')).toBe('img')
    expect(baby.find('[data-stage="baby"]').exists()).toBe(true)

    const egg = mount(PetAvatar, { props: { stage: 'egg', mood: 80 } })
    expect(egg.find('[data-stage="egg"]').exists()).toBe(true)
  })

  it('点击时发出 tap 事件并带挤压动画类', async () => {
    const view = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    await view.get('[data-testid="pet-tap"]').trigger('click')
    expect(view.emitted('tap')).toHaveLength(1)
    expect(view.get('[data-testid="pet-tap"]').classes()).toContain('is-squish')
  })
})
