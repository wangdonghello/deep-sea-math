import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CompanionAvatar, { type CompanionId } from '@/features/pet/CompanionAvatar.vue'

const IDS: CompanionId[] = ['companion-cat', 'companion-dog', 'companion-hamster', 'companion-lion', 'companion-tiger', 'companion-dragon']

describe('CompanionAvatar', () => {
  it.each(IDS)('%s 有头、身体、四腿与尾巴', (id) => {
    const view = mount(CompanionAvatar, { props: { animalId: id, mood: 80 } })
    expect(view.get('[data-animal]').attributes('data-animal')).toBe(id)
    expect(view.findAll('.companion__legs rect')).toHaveLength(4)
    expect(view.find('.companion__tail').exists()).toBe(true)
    expect(view.findAll('ellipse').length).toBeGreaterThan(4)
    expect(view.findAll('circle').length).toBeGreaterThan(4)
  })

  it('点击 emit tap，心情低时表情变化', async () => {
    const view = mount(CompanionAvatar, { props: { animalId: 'companion-cat', mood: 80 } })
    await view.get('[data-testid="animal-avatar"]').trigger('click')
    expect(view.emitted('tap')).toHaveLength(1)
    const low = mount(CompanionAvatar, { props: { animalId: 'companion-cat', mood: 10 } })
    expect(low.classes()).toContain('is-low')
  })
})
