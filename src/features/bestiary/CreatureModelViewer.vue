<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

import type { CreatureModelAsset } from '@/data/content/schema'

const props = defineProps<{
  asset: CreatureModelAsset
  name: string
  /** 加载期间的占位图：该物种的真实影像。 */
  previewSrc: string
}>()
const emit = defineEmits<{ error: [] }>()

const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const canvasReady = ref(false)
const status = ref('正在加载 3D 模型')
const autoRotate = ref(true)

let renderer: THREE.WebGLRenderer | undefined
let camera: THREE.PerspectiveCamera | undefined
let resizeObserver: ResizeObserver | undefined
let model: THREE.Object3D | undefined
let disposed = false
let dragging = false
let previousPointer = { x: 0, y: 0 }

function disposeModel(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    })
  })
}

function resize(): void {
  if (!stage.value || !renderer || stage.value.clientWidth === 0 || stage.value.clientHeight === 0) return
  const width = stage.value.clientWidth
  const height = stage.value.clientHeight
  renderer.setSize(width, height, false)
  if (!camera) return
  camera.aspect = width / height
  camera.position.z = Math.max(8.2, (8.2 * 1.15) / camera.aspect)
  camera.updateProjectionMatrix()
}

function zoom(delta: number): void {
  if (camera) camera.position.z = THREE.MathUtils.clamp(camera.position.z + delta, 4, 14)
}

function onPointerDown(event: PointerEvent): void {
  dragging = true
  previousPointer = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging || !model) return
  model.rotation.y += (event.clientX - previousPointer.x) * 0.008
  model.rotation.x = THREE.MathUtils.clamp(model.rotation.x + (event.clientY - previousPointer.y) * 0.006, -0.85, 0.85)
  previousPointer = { x: event.clientX, y: event.clientY }
}

function onPointerUp(): void {
  dragging = false
}

function onWebGLContextLost(event: Event): void {
  event.preventDefault()
  status.value = '3D 图形设备暂不可用，已切换为真实照片'
  emit('error')
}

/**
 * 计算模型的实际包围盒。
 *
 * `Box3.setFromObject` 对 SkinnedMesh 只读到未蒙皮的几何包围盒；蜥鱼这类
 * 骨骼绑定模型会因此被缩得极小。这里对蒙皮网格显式调用
 * `computeBoundingBox()`，把局部包围盒按世界矩阵并入整体包围盒。
 */
function measureBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3()
  object.traverse((child) => {
    const skinned = child as THREE.SkinnedMesh
    if (skinned.isSkinnedMesh === true) {
      skinned.computeBoundingBox()
      if (skinned.boundingBox !== null) {
        box.union(skinned.boundingBox.clone().applyMatrix4(skinned.matrixWorld))
      }
      return
    }
    const mesh = child as THREE.Mesh
    if (mesh.isMesh !== true) return
    mesh.geometry.computeBoundingBox()
    if (mesh.geometry.boundingBox !== null) {
      box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))
    }
  })
  return box
}

async function loadModel(): Promise<void> {
  const host = stage.value
  if (!host) return

  try {
    if (!canvas.value) throw new Error('Model canvas is unavailable')
    // jsdom and genuinely WebGL-less browsers do not expose either context type.
    // Fail over before Three.js calls canvas.getContext() (jsdom logs a noisy
    // "not implemented" warning instead of throwing when that API is absent).
    if (!('WebGLRenderingContext' in window) && !('WebGL2RenderingContext' in window)) {
      throw new Error('WebGL is unavailable')
    }
    const scene = new THREE.Scene()
    const modelCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera = modelCamera
    modelCamera.position.set(2.6, 1.4, 8.2)
    modelCamera.lookAt(0, 0, 0)

    renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio <= 1.5,
      alpha: true,
      powerPreference: 'low-power',
      canvas: canvas.value,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12

    scene.add(new THREE.HemisphereLight(0xaedcff, 0x071225, 2.2))
    const keyLight = new THREE.DirectionalLight(0xd5efff, 3.4)
    keyLight.position.set(-3, 5, 6)
    scene.add(keyLight)
    const blueRimLight = new THREE.PointLight(0x40bcff, 20, 16)
    blueRimLight.position.set(-4, 1, -2)
    scene.add(blueRimLight)
    const lureLight = new THREE.PointLight(0xffad38, 8, 8)
    lureLight.position.set(1, 1, 3)
    scene.add(lureLight)

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const assetUrl = `${import.meta.env.BASE_URL}models/${props.asset.ref}.glb`
    const gltf = await loader.loadAsync(assetUrl)
    if (disposed) {
      disposeModel(gltf.scene)
      return
    }

    model = gltf.scene
    scene.add(model)
    const initialBounds = measureBounds(model)
    if (initialBounds.isEmpty()) throw new Error('Model has no visible geometry')
    const initialSize = initialBounds.getSize(new THREE.Vector3())

    // 长轴若不是 X，转到 X：相机在 +Z 方向，长轴横过来才能看到鱼的侧面，
    // 而不是正对鱼头或把触手当成主体。蜥鱼绑定姿态是竖着的，绕 Z 转 90°。
    if (initialSize.z > initialSize.x * 1.2 && initialSize.z >= initialSize.y * 1.2) {
      model.rotation.y = Math.PI / 2
    } else if (initialSize.y > initialSize.x * 1.2) {
      model.rotation.z = Math.PI / 2
    }

    const bounds = measureBounds(model)
    const dimensions = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const longestSide = Math.max(dimensions.x, dimensions.y, dimensions.z)
    if (!Number.isFinite(longestSide) || longestSide <= 0) throw new Error('Model has no visible geometry')

    const scale = 4.4 / longestSide
    model.scale.setScalar(scale)
    // 先缩放再按缩放后的中心平移，避免模型偏离画面中心。
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

    const renderFrame = (): void => {
      if (!renderer) return
      if (autoRotate.value && !dragging && model) model.rotation.y += 0.0025
      renderer.render(scene, modelCamera)
    }
    const ResizeObserverConstructor = Reflect.get(window, 'ResizeObserver') as
      (new (callback: ResizeObserverCallback) => ResizeObserver) | undefined
    if (ResizeObserverConstructor) {
      resizeObserver = new ResizeObserverConstructor(resize)
      resizeObserver.observe(host)
    } else {
      window.addEventListener('resize', resize)
    }
    // 先按容器定尺寸再起渲染循环：setSize 会清空 drawing buffer。
    resize()
    renderer.setAnimationLoop(renderFrame)
    canvasReady.value = true
    status.value = '3D 模型已加载'
  } catch {
    status.value = '3D 模型暂不可用，已切换为真实照片'
    emit('error')
  }
}

onMounted(() => {
  void loadModel()
})
onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
  if (renderer) {
    renderer.setAnimationLoop(null)
    if (model) disposeModel(model)
    renderer.dispose()
  }
  camera = undefined
})
</script>

<template>
  <div ref="stage" class="creature-model" :class="{ 'creature-model--ready': canvasReady }"
    data-testid="creature-model-viewer" :aria-label="`${name} 3D 示意模型`">
    <img class="creature-model__preview" :src="previewSrc" alt="" aria-hidden="true">
    <p class="creature-model__status" role="status" aria-live="polite">{{ status }}</p>
    <div class="creature-model__controls" aria-label="模型控制">
      <button type="button" :aria-pressed="autoRotate" @click="autoRotate = !autoRotate">
        {{ autoRotate ? '暂停旋转' : '自动旋转' }}
      </button>
      <button type="button" aria-label="放大模型" @click="zoom(-0.7)">＋</button>
      <button type="button" aria-label="缩小模型" @click="zoom(0.7)">−</button>
    </div>
    <p class="creature-model__hint">拖动旋转 · 使用按钮缩放</p>
    <canvas ref="canvas" role="img" :aria-label="`${name} 3D 示意模型`" @pointerdown="onPointerDown"
      @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
      @webglcontextlost="onWebGLContextLost" />
  </div>
</template>

<style scoped>
.creature-model {
  position: relative;
  min-height: 17rem;
  height: min(68vw, 24rem);
  overflow: hidden;
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: radial-gradient(ellipse at 48% 42%, #123b5f, #06152d 72%);
  touch-action: none;
}
.creature-model__preview,
.creature-model canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.creature-model__preview { opacity: .28; transition: opacity .25s ease; }
.creature-model--ready .creature-model__preview { opacity: 0; }
.creature-model canvas { z-index: 1; }
.creature-model__status { position: absolute; z-index: 2; top: .65rem; left: .75rem; margin: 0; color: #b9d6ea; font-size: .75rem; }
.creature-model__controls { position: absolute; z-index: 3; right: .65rem; bottom: .65rem; display: flex; gap: .4rem; }
.creature-model button { min-width: 2.75rem; min-height: 2.75rem; border: 1px solid #7295ae; border-radius: .7rem; color: #fff; background: #0d2744eF; }
.creature-model__hint { position: absolute; z-index: 2; bottom: .85rem; left: .75rem; margin: 0; color: #b9d6ea; font-size: .75rem; pointer-events: none; }
@media (max-width: 480px) {
  .creature-model { min-height: 15rem; height: 58vh; max-height: 22rem; }
  .creature-model__hint { bottom: 3.65rem; }
}
</style>
