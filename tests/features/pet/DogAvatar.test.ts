import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DogAvatar from '@/features/pet/DogAvatar.vue'

describe('DogAvatar', () => {
  it('渲染站立的小狗，有四条腿、爪子和上翘尾巴', () => {
    const view = mount(DogAvatar, { props: { mood: 80 } })
    expect(view.find('[data-animal="dog"]').exists()).toBe(true)
    expect(view.findAll('.dog-legs rect')).toHaveLength(4)
    expect(view.find('.dog-tail').exists()).toBe(true)
    expect(view.findAll('ellipse').length).toBeGreaterThan(4)
    expect(view.get('[data-testid="animal-avatar"]').attributes('aria-label')).toContain('小狗')
  })

  it('点击 emit tap', async () => {
    const view = mount(DogAvatar, { props: { mood: 80 } })
    await view.trigger('click')
    expect(view.emitted('tap')).toHaveLength(1)
  })
})
