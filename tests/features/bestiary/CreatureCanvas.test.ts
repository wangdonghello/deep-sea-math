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

    expect(view.find('[data-testid="photo-fallback"]').exists()).toBe(true)
    expect(view.find('[data-testid="knowledge-card-list"]').exists()).toBe(true)
    expect(view.text()).toContain(creature.knowledgeCards[0])
  })

  it('zooms in and back out with the accessible button and double-click', async () => {
    const view = mount(CreatureCanvas, { props: { creature: CREATURE_BANK.creatures[0] } })
    const image = view.get('[data-testid="creature-photo"]')
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

  it('serves the species photo and states what the image really shows', () => {
    const creature = CREATURE_BANK.creatures[0]
    const view = mount(CreatureCanvas, { props: { creature } })

    expect(view.get('[data-testid="creature-photo"]').attributes('src'))
      .toContain(`photos/${creature.photo.ref}.jpg`)
    expect(view.get('[data-testid="photo-attribution"]').text()).toContain(creature.photo.note)
    expect(view.get('[data-testid="photo-attribution"]').text()).toContain(creature.photo.attribution)
    expect(view.get('[data-testid="photo-source-link"]').attributes('href')).toBe(creature.photo.sourceUrl)
    expect(view.get('[data-testid="photo-license-link"]').attributes('href')).toBe(creature.photo.licenseUrl)
    // 影像加载慢时不要让整页的其它卡片一起等
    expect(view.get('[data-testid="creature-photo"]').attributes('loading')).toBe('lazy')
  })

  it('does not offer the 3D model unless the observation cabin opts in', () => {
    const view = mount(CreatureCanvas, { props: { creature: CREATURE_BANK.creatures[0] } })
    expect(view.find('[data-testid="creature-model-toggle"]').exists()).toBe(false)
  })

  it('hides every visual and credit block for locked creatures', () => {
    const view = mount(CreatureCanvas, { props: { creature: CREATURE_BANK.creatures[0], locked: true } })

    expect(view.find('[data-testid="creature-silhouette"]').exists()).toBe(true)
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(false)
    expect(view.find('figcaption').exists()).toBe(false)
  })
})
