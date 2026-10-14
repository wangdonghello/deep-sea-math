import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { CREATURE_BANK } from '@/data/content'
import CreatureCanvas from '@/features/bestiary/CreatureCanvas.vue'

vi.mock('@/features/bestiary/CreatureModelViewer.vue', () => ({
  __esModule: true,
  name: 'CreatureModelViewer',
  __isTeleport: false,
  __isSuspense: false,
  __isKeepAlive: false,
  __isTransition: false,
  default: defineComponent({
    name: 'CreatureModelViewer',
    props: ['asset', 'thumbnail'],
    emits: ['error'],
    render() {
      return h('div', {
        'data-testid': 'creature-model-viewer',
        'data-model-ref': (this as { asset: { ref: string } }).asset.ref,
      })
    },
  }),
}))

const model = {
  ref: 'deep-sea-fish-3dsm4',
  attribution: 'This work is based on "Deep Sea Fish #3DSM4" by Carlo Bergonzini, licensed under CC BY 4.0.',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  sourceUrl: 'https://sketchfab.com/3d-models/deep-sea-fish-3dsm4-6ee4e67640794f7b8cecd10295ab2f55',
  note: '授权示意模型，非约翰逊鮟鱇鱼的精确解剖复原。',
}

describe('CreatureCanvas licensed model display', () => {
  it('shows a licensed model only when the observation view opts in', async () => {
    const creature = { ...CREATURE_BANK.creatures[0], model }
    const view = mount(CreatureCanvas, { props: { creature, preferModel: true } })
    await flushPromises()

    expect(view.get('[data-testid="creature-model-viewer"]').attributes('data-model-ref')).toBe(model.ref)
    expect(view.find('[data-testid="creature-illustration"]').exists()).toBe(false)
    expect(view.get('figcaption').text()).toContain(model.note)
    expect(view.get('figcaption').text()).toContain(model.attribution)
    expect(view.get('[data-testid="model-source-link"]').attributes('href')).toBe(model.sourceUrl)
    expect(view.get('[data-testid="model-license-link"]').attributes('href')).toBe(model.licenseUrl)
  })

  it('keeps bestiary cards on the lightweight illustration', async () => {
    const creature = { ...CREATURE_BANK.creatures[0], model }
    const view = mount(CreatureCanvas, { props: { creature } })
    await flushPromises()

    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(false)
    expect(view.find('[data-testid="creature-illustration"]').exists()).toBe(true)
  })

  it('falls back to the original illustration when WebGL is unavailable and keeps attribution visible', async () => {
    const creature = { ...CREATURE_BANK.creatures[0], model }
    const view = mount(CreatureCanvas, { props: { creature, preferModel: true } })
    await flushPromises()

    view.findComponent({ name: 'CreatureModelViewer' }).vm.$emit('error')
    await flushPromises()

    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(false)
    expect(view.find('[data-testid="creature-illustration"]').exists()).toBe(true)
    expect(view.get('[data-testid="model-attribution"]').text()).toContain(model.attribution)
  })
})
