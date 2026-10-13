import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import CreatureModelViewer from '@/features/bestiary/CreatureModelViewer.vue'

describe('CreatureModelViewer resilience', () => {
  it('signals fallback when WebGL creation fails and prevents a lost context default', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
    const view = mount(CreatureModelViewer, {
      props: {
        name: '约翰逊鮟鱇鱼',
        previewSrc: '/illustrations/original-johnson-anglerfish.svg',
        asset: {
          ref: 'deep-sea-fish-3dsm4',
          attribution: 'This work is based on "Deep Sea Fish #3DSM4" by Carlo Bergonzini, licensed under CC-BY-4.0.',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: 'https://sketchfab.com/3d-models/deep-sea-fish-3dsm4-6ee4e67640794f7b8cecd10295ab2f55',
          note: '授权示意模型，非物种精确复原。',
        },
      },
    })
    await flushPromises()

    expect(view.emitted('error')).toHaveLength(1)
    expect(view.get('[role="status"]').text()).toContain('已切换为原创示意插画')

    const contextLost = new Event('webglcontextlost', { cancelable: true })
    view.get('canvas').element.dispatchEvent(contextLost)
    expect(contextLost.defaultPrevented).toBe(true)
    expect(view.emitted('error')).toHaveLength(2)

    view.unmount()
    getContext.mockRestore()
  })
})
