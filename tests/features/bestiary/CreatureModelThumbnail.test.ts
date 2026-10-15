import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const operations: string[] = []
  const render = vi.fn(() => { operations.push('render') })
  const setSize = vi.fn(() => { operations.push('setSize') })
  const setAnimationLoop = vi.fn((callback: (() => void) | null) => {
    operations.push(callback === null ? 'stopLoop' : 'startLoop')
  })
  const dispose = vi.fn()

  class Vector3 {
    x = 0
    y = 0
    z = 0
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
    sub() { return this }
  }
  class Object3D {
    position = new Vector3()
    scale = { setScalar: vi.fn() }
    rotation = { x: 0, y: 0 }
    traverse(callback: (child: Object3D) => void) { callback(this) }
  }
  class Mesh extends Object3D {
    geometry = { dispose }
    material = { dispose }
  }
  class Box3 {
    setFromObject() { return this }
    getSize(target: Vector3) { target.set(2, 1, 1); return target }
    getCenter(target: Vector3) { target.set(0, 0, 0); return target }
  }
  class Scene { add() {} }
  class PerspectiveCamera {
    aspect = 1
    position = new Vector3()
    lookAt() {}
    updateProjectionMatrix() {}
  }
  class Light { position = new Vector3() }
  class WebGLRenderer {
    domElement: HTMLCanvasElement
    outputColorSpace = ''
    toneMapping = 0
    toneMappingExposure = 1
    constructor(options: { canvas: HTMLCanvasElement }) { this.domElement = options.canvas }
    setPixelRatio() {}
    setSize = setSize
    render = render
    setAnimationLoop = setAnimationLoop
    dispose = dispose
  }
  return {
    operations, render, setSize, setAnimationLoop, dispose,
    Vector3, Object3D, Mesh, Box3, Scene, PerspectiveCamera, Light, WebGLRenderer,
  }
})

vi.mock('three', () => ({
  Vector3: mocks.Vector3,
  Object3D: mocks.Object3D,
  Mesh: mocks.Mesh,
  Texture: class {},
  Box3: mocks.Box3,
  Scene: mocks.Scene,
  PerspectiveCamera: mocks.PerspectiveCamera,
  HemisphereLight: mocks.Light,
  DirectionalLight: mocks.Light,
  PointLight: mocks.Light,
  WebGLRenderer: mocks.WebGLRenderer,
  MathUtils: { clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) },
  SRGBColorSpace: 'srgb',
  ACESFilmicToneMapping: 1,
}))

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() {}
    async loadAsync() { return { scene: new mocks.Object3D() } }
  },
}))

vi.mock('three/addons/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }))

import CreatureModelViewer from '@/features/bestiary/CreatureModelViewer.vue'

describe('CreatureModelViewer thumbnail rendering', () => {
  it('sizes the canvas before one static frame, redraws once after resize and never starts an animation loop', async () => {
    const originalWebgl = Object.getOwnPropertyDescriptor(window, 'WebGLRenderingContext')
    Object.defineProperty(window, 'WebGLRenderingContext', { configurable: true, value: class {} })
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(176)
    const view = mount(CreatureModelViewer, {
      attachTo: document.body,
      props: {
        name: '约翰逊鮟鱇鱼',
        previewSrc: '/illustrations/original-johnson-anglerfish.svg',
        thumbnail: true,
        asset: {
          ref: 'deep-sea-fish-3dsm4',
          creditSummary: 'Deep Sea Fish #3DSM4 · Carlo Bergonzini · CC BY 4.0',
          attribution: 'This work is based on Deep Sea Fish #3DSM4 by Carlo Bergonzini.',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: 'https://sketchfab.com/model',
          note: '授权示意模型。',
        },
      },
    })
    await flushPromises()

    expect(mocks.operations.slice(0, 3)).toEqual(['setSize', 'render', 'stopLoop'])
    expect(mocks.render).toHaveBeenCalledTimes(1)
    expect(mocks.setAnimationLoop).toHaveBeenCalledWith(null)

    window.dispatchEvent(new Event('resize'))
    expect(mocks.render).toHaveBeenCalledTimes(2)
    expect(mocks.operations.slice(-2)).toEqual(['setSize', 'render'])

    view.unmount()
    expect(mocks.setAnimationLoop).toHaveBeenCalledTimes(2)
    expect(mocks.setAnimationLoop).toHaveBeenLastCalledWith(null)
    width.mockRestore()
    height.mockRestore()
    if (originalWebgl === undefined) Reflect.deleteProperty(window, 'WebGLRenderingContext')
    else Object.defineProperty(window, 'WebGLRenderingContext', originalWebgl)
  })
})
