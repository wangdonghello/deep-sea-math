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

  it('等级驱动体型与徽章，Lv.12 起出现王冠，Lv.15 有光环', () => {
    const baby = mount(CompanionAvatar, { props: { animalId: 'companion-lion', mood: 80, level: 1 } })
    const adult = mount(CompanionAvatar, { props: { animalId: 'companion-lion', mood: 80, level: 15 } })
    expect(baby.get('[data-level]').attributes('data-level')).toBe('1')
    expect(baby.text()).toContain('1')
    expect(adult.text()).toContain('15')
    expect(baby.find('.companion__crest').exists()).toBe(false)
    expect(adult.find('.companion__crest').exists()).toBe(true)
    expect(adult.find('.companion__aura').exists()).toBe(true)
    expect(baby.get('svg').attributes('style')).not.toBe(adult.get('svg').attributes('style'))
  })

  it('点击 emit tap，心情低时表情变化', async () => {
    const view = mount(CompanionAvatar, { props: { animalId: 'companion-cat', mood: 80 } })
    await view.get('[data-testid="animal-avatar"]').trigger('click')
    expect(view.emitted('tap')).toHaveLength(1)
    const low = mount(CompanionAvatar, { props: { animalId: 'companion-cat', mood: 10 } })
    expect(low.classes()).toContain('is-low')
  })
})
