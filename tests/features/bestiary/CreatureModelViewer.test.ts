import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import CreatureModelViewer from '@/features/bestiary/CreatureModelViewer.vue'

const asset = {
  ref: 'deep-sea-fish-3dsm4',
  creditSummary: 'Deep Sea Fish #3DSM4 · Carlo Bergonzini · CC BY 4.0',
  attribution: 'This work is based on "Deep Sea Fish #3DSM4" by Carlo Bergonzini, licensed under CC-BY-4.0.',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  sourceUrl: 'https://sketchfab.com/3d-models/deep-sea-fish-3dsm4-6ee4e67640794f7b8cecd10295ab2f55',
  note: '授权示意模型，非物种精确复原。',
}

describe('CreatureModelViewer resilience', () => {
  it('signals fallback when WebGL creation fails and prevents a lost context default', async () => {
    const originalWebgl = Object.getOwnPropertyDescriptor(window, 'WebGLRenderingContext')
    Object.defineProperty(window, 'WebGLRenderingContext', { configurable: true, value: class {} })
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
    const view = mount(CreatureModelViewer, {
      props: { name: '约翰逊鮟鱇鱼', previewSrc: '/photos/johnson-anglerfish.jpg', asset },
    })
    await flushPromises()

    expect(view.emitted('error')).toHaveLength(1)
    expect(view.get('[role="status"]').text()).toContain('已切换为真实照片')

    const contextLost = new Event('webglcontextlost', { cancelable: true })
    view.get('canvas').element.dispatchEvent(contextLost)
    expect(contextLost.defaultPrevented).toBe(true)
    expect(view.emitted('error')).toHaveLength(2)

    view.unmount()
    getContext.mockRestore()
    if (originalWebgl === undefined) Reflect.deleteProperty(window, 'WebGLRenderingContext')
    else Object.defineProperty(window, 'WebGLRenderingContext', originalWebgl)
  })

  it('keeps the rotation and zoom controls in the observation-cabin mode', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({ canvas: {} }) as unknown as RenderingContext)
    const view = mount(CreatureModelViewer, {
      props: { name: '约翰逊鮟鱇鱼', previewSrc: '/photos/johnson-anglerfish.jpg', asset },
    })
    await flushPromises()

    expect(view.text()).toContain('拖动旋转')
    const labels = view.findAll('button').map((button) => button.attributes('aria-label') ?? button.text())
    expect(labels).toContain('暂停旋转')
    expect(labels).toContain('放大模型')
    expect(labels).toContain('缩小模型')

    view.unmount()
    getContext.mockRestore()
  })
})
