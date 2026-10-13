import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'

import CreatureCanvas from '@/features/bestiary/CreatureCanvas.vue'
import KnowledgeCardList from '@/features/bestiary/KnowledgeCardList.vue'
import { CREATURE_BANK } from '@/data/content'

describe('CreatureCanvas', () => {
  it('falls back to text on image error without removing the knowledge cards', async () => {
    const creature = CREATURE_BANK.creatures[0]
    const view = mount(CreatureCanvas, {
      props: { creature },
      slots: { default: () => h(KnowledgeCardList, { cards: creature.knowledgeCards }) },
    })

    await view.get('img').trigger('error')

    expect(view.find('[data-testid="illustration-fallback"]').exists()).toBe(true)
    expect(view.find('[data-testid="knowledge-card-list"]').exists()).toBe(true)
    expect(view.text()).toContain(creature.knowledgeCards[0])
  })

  it('zooms in and back out with the accessible button and double-click', async () => {
    const view = mount(CreatureCanvas, { props: { creature: CREATURE_BANK.creatures[0] } })
    const image = view.get('[data-testid="creature-illustration"]')
    const zoomButton = view.get('[data-testid="creature-zoom-toggle"]')

    expect(image.attributes('data-scale')).toBe('1')
    await zoomButton.trigger('click')
    expect(image.attributes('data-scale')).toBe('1.5')
    expect(image.attributes('style')).toContain('scale(1.5)')
    expect(zoomButton.text()).toBe('还原')
    await zoomButton.trigger('click')
    expect(image.attributes('data-scale')).toBe('1')
    await image.trigger('dblclick')
    expect(image.attributes('data-scale')).toBe('1.5')
    await image.trigger('dblclick')
    expect(image.attributes('data-scale')).toBe('1')
  })

  it('shows the original illustration disclaimer without claiming 3D is unavailable', () => {
    const view = mount(CreatureCanvas, { props: { creature: CREATURE_BANK.creatures[0] } })
    expect(view.get('figcaption').text()).toBe('原创示意插画，非真实影像')
  })
})
