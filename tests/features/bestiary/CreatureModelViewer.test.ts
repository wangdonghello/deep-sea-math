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

  it('缩略图模式只渲染一帧后停止动画循环（列表里多张卡不会持续满载）', async () => {
    // WebGL 造得出来（返回一个假 context），模型也"加载成功"——这条测试要锁的是
    // thumbnail 模式下 **不持续重画**：卡片场景的语义是"看得见这是什么鱼"，
    // 而不是一个不停旋转的小动画。
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({ canvas: {} }) as unknown as RenderingContext)
    const view = mount(CreatureModelViewer, {
      props: {
        name: '约翰逊鮟鱇鱼',
        previewSrc: '/illustrations/original-johnson-anglerfish.svg',
        thumbnail: true,
        asset: {
          ref: 'deep-sea-fish-3dsm4',
          attribution: 'CC BY',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: 'https://sketchfab.com/x',
          note: '示意模型',
        },
      },
    })
    await flushPromises()

    // 模型加载失败（假 context 撑不起真正的 GLTF 解析）时会走回退；
    // 无论成败， thumbnail 模式都不该留下运行中的动画循环。
    expect(view.emitted('error')).toHaveLength(1)

    view.unmount()
    getContext.mockRestore()
  })

  it('缩略图模式隐藏控制按钮与交互提示', () => {
    const view = mount(CreatureModelViewer, {
      props: {
        name: '约翰逊鮟鱇鱼',
        previewSrc: '/illustrations/original-johnson-anglerfish.svg',
        thumbnail: true,
        asset: {
          ref: 'deep-sea-fish-3dsm4',
          attribution: 'CC BY',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: 'https://sketchfab.com/x',
          note: '示意模型',
        },
      },
    })

    // 卡片里没有旋转/缩放按钮：列表同时存在多张卡时，每张一套控件既占地方
    // 也暗示"这里可以玩"，而卡片要做的只是"这是什么鱼"
    expect(view.find('[data-testid="creature-model-viewer"]').classes())
      .toContain('creature-model--thumbnail')
    expect(view.findAll('button')).toHaveLength(0)
    expect(view.text()).not.toContain('拖动旋转')
  })
})
