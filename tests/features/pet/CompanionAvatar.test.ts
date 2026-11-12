import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import CompanionAvatar, { type CompanionId } from '@/features/pet/CompanionAvatar.vue'

const IDS: CompanionId[] = [
  'companion-cat', 'companion-dog', 'companion-hamster', 'companion-lion', 'companion-tiger',
  'companion-dragon', 'companion-yinglong', 'companion-zhulong', 'companion-qinglong',
]
const DIRS: Record<CompanionId, string> = {
  'companion-cat': 'cat',
  'companion-dog': 'dog',
  'companion-hamster': 'hamster',
  'companion-lion': 'lion',
  'companion-tiger': 'tiger',
  'companion-dragon': 'dragon',
  'companion-yinglong': 'dragon',
  'companion-zhulong': 'dragon',
  'companion-qinglong': 'dragon',
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

describe('CompanionAvatar', () => {
  it.each(IDS)('%s 使用对应等级的插画', (id) => {
    const view = mount(CompanionAvatar, { props: { animalId: id, mood: 80, level: 1 } })
    expect(view.get('[data-animal]').attributes('data-animal')).toBe(id)
    expect(view.get('img').attributes('src')).toContain(`/pets/${DIRS[id]}/lv1.webp`)
    expect(view.get('img').attributes('alt')).toContain('Lv.1')
  })

  it('等级变化时切换到对应图片', () => {
    const view = mount(CompanionAvatar, { props: { animalId: 'companion-lion', mood: 80, level: 15 } })
    expect(view.get('[data-level]').attributes('data-level')).toBe('15')
    expect(view.get('img').attributes('src')).toContain('/pets/lion/lv15.webp')
    expect(view.get('img').attributes('alt')).toContain('Lv.15')
  })

  it('点击 emit tap 并触发抚摸动画', async () => {
    const view = mount(CompanionAvatar, { props: { animalId: 'companion-cat', mood: 80 } })
    await view.get('[data-testid="animal-avatar"]').trigger('click')
    expect(view.emitted('tap')).toHaveLength(1)
    await frame()
    expect(view.classes()).toContain('is-pet')
  })

  it('投喂/玩耍动作可以通过 actionNonce 触发', async () => {
    const view = mount(CompanionAvatar, {
      props: { animalId: 'companion-dog', mood: 80, action: 'eat', actionNonce: 0 },
    })
    await view.setProps({ actionNonce: 1 })
    await nextTick()
    await frame()
    expect(view.classes()).toContain('is-eat')

    await view.setProps({ action: 'play', actionNonce: 2 })
    await nextTick()
    await frame()
    expect(view.classes()).toContain('is-play')
  })

  it('心情低时降低饱和度', () => {
    const low = mount(CompanionAvatar, { props: { animalId: 'companion-cat', mood: 10 } })
    expect(low.classes()).toContain('is-low')
  })
})
