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
    props: ['asset'],
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
  creditSummary: 'Deep Sea Fish #3DSM4 · Carlo Bergonzini · CC BY 4.0',
  attribution: 'This work is based on "Deep Sea Fish #3DSM4" by Carlo Bergonzini, licensed under CC BY 4.0.',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  sourceUrl: 'https://sketchfab.com/3d-models/deep-sea-fish-3dsm4-6ee4e67640794f7b8cecd10295ab2f55',
  note: '授权示意模型，非约翰逊鮟鱇鱼的精确解剖复原。',
}

const anglerfish = { ...CREATURE_BANK.creatures[0], model }

describe('CreatureCanvas 影像与 3D 模型的切换', () => {
  it('观察舱缺省显示真实影像，模型要显式切换', async () => {
    const view = mount(CreatureCanvas, { props: { creature: anglerfish, allowModel: true } })
    await flushPromises()

    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(true)
    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(false)
    const toggle = view.get('[data-testid="creature-model-toggle"]')
    expect(toggle.text()).toBe('看 3D 模型')
    expect(toggle.attributes('aria-pressed')).toBe('false')
  })

  it('切到 3D 模型后展示模型署名，再切回影像时断言影像署名仍在', async () => {
    const view = mount(CreatureCanvas, { props: { creature: anglerfish, allowModel: true } })
    await flushPromises()
    await view.get('[data-testid="creature-model-toggle"]').trigger('click')
    await flushPromises()

    expect(view.get('[data-testid="creature-model-viewer"]').attributes('data-model-ref')).toBe(model.ref)
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(false)
    expect(view.get('[data-testid="model-attribution"]').text()).toContain(model.note)
    expect(view.get('[data-testid="model-attribution"]').text()).toContain(model.attribution)
    expect(view.get('[data-testid="model-source-link"]').attributes('href')).toBe(model.sourceUrl)
    expect(view.get('[data-testid="model-license-link"]').attributes('href')).toBe(model.licenseUrl)
    // CC BY 要求署名随作品出现；换成模型时影像署名不再需要，模型署名必须补上
    expect(view.find('[data-testid="photo-attribution"]').exists()).toBe(false)
    expect(view.get('[data-testid="creature-model-toggle"]').text()).toBe('看真实照片')

    await view.get('[data-testid="creature-model-toggle"]').trigger('click')
    await flushPromises()

    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(false)
    expect(view.get('[data-testid="photo-attribution"]').text()).toContain(anglerfish.photo.license)
  })

  it('图鉴卡片不渲染 3D 模型，只显示影像与紧凑署名', async () => {
    const view = mount(CreatureCanvas, { props: { creature: anglerfish, thumbnail: true } })
    await flushPromises()

    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(false)
    expect(view.find('[data-testid="creature-model-toggle"]').exists()).toBe(false)
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(true)
  })

  it('卡片默认折叠完整授权文字，但保留显眼的授权说明入口', async () => {
    const view = mount(CreatureCanvas, { props: { creature: anglerfish, thumbnail: true } })
    const credit = view.get('[data-testid="photo-attribution"]')

    expect(credit.text()).toContain('CC BY-SA 4.0')
    expect(credit.text()).toContain('Fernando Losada Rodríguez')
    expect((view.get('details').element as HTMLDetailsElement).open).toBe(false)
    await view.get('[data-testid="photo-credit-summary"]').trigger('click')
    expect((view.get('details').element as HTMLDetailsElement).open).toBe(true)
    expect(view.get('[data-testid="photo-full-attribution"]').text()).toContain(anglerfish.photo.attribution)
    expect(view.get('[data-testid="photo-license-link"]').attributes('href')).toBe(anglerfish.photo.licenseUrl)
  })

  it('只解锁到没有模型的物种时，观察舱不出现切换按钮', () => {
    const view = mount(CreatureCanvas, {
      props: { creature: CREATURE_BANK.creatures[1], allowModel: true },
    })
    expect(view.find('[data-testid="creature-model-toggle"]').exists()).toBe(false)
  })

  it('WebGL 不可用时退回真实影像，并保留影像署名', async () => {
    const view = mount(CreatureCanvas, { props: { creature: anglerfish, allowModel: true } })
    await flushPromises()
    await view.get('[data-testid="creature-model-toggle"]').trigger('click')
    await flushPromises()

    view.findComponent({ name: 'CreatureModelViewer' }).vm.$emit('error')
    await flushPromises()

    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(false)
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(true)
    // 降级后切换入口一并消失：模型已经不可用，再点只会再失败一次
    expect(view.find('[data-testid="creature-model-toggle"]').exists()).toBe(false)
    expect(view.get('[data-testid="photo-attribution"]').text()).toContain(anglerfish.photo.license)
  })
})
