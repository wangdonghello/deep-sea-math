<script setup lang="ts">
/**
 * 恐龙知识卡的 3D 模型查看器。
 *
 * 与深海 `CreatureModelViewer` 分开：恐龙模型带骨骼动画，进入知识卡后先
 * 自动播放 Idle 动画；模型来自 Poly Pizza 的 CC0 素材，不依赖官方恐龙 IP。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const props = defineProps<{
  modelRef: string
  name: string
  emoji: string
}>()
const emit = defineEmits<{ error: [] }>()

const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
const status = ref('正在加载 3D 恐龙')
const autoRotate = ref(true)

let renderer: THREE.WebGLRenderer | undefined
let camera: THREE.PerspectiveCamera | undefined
let resizeObserver: ResizeObserver | undefined
let model: THREE.Object3D | undefined
let mixer: THREE.AnimationMixer | undefined
let disposed = false
let dragging = false
let previousPointer = { x: 0, y: 0 }
let lastFrame = 0

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
  if (!stage.value || !renderer || !camera) return
  const width = stage.value.clientWidth
  const height = stage.value.clientHeight
  if (width === 0 || height === 0) return
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.position.z = Math.max(7.6, (7.6 * 1.15) / camera.aspect)
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

function measureBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3()
  object.traverse((child) => {
    const skinned = child as THREE.SkinnedMesh
    if (skinned.isSkinnedMesh === true) {
      skinned.computeBoundingBox()
      if (skinned.boundingBox !== null) box.union(skinned.boundingBox.clone().applyMatrix4(skinned.matrixWorld))
      return
    }
    const mesh = child as THREE.Mesh
    if (mesh.isMesh !== true) return
    mesh.geometry.computeBoundingBox()
    if (mesh.geometry.boundingBox !== null) box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))
  })
  return box
}

async function loadModel(): Promise<void> {
  const host = stage.value
  if (!host) return
  try {
    if (!canvas.value) throw new Error('canvas unavailable')
    if (!('WebGLRenderingContext' in window) && !('WebGL2RenderingContext' in window)) throw new Error('WebGL unavailable')
    const scene = new THREE.Scene()
    const modelCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera = modelCamera
    modelCamera.position.set(2.6, 1.4, 7.6)
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
    renderer.toneMappingExposure = 1.55

    scene.add(new THREE.AmbientLight(0xfff4e0, 1.6))
    scene.add(new THREE.HemisphereLight(0xffe5c4, 0x3a2412, 3.2))
    const key = new THREE.DirectionalLight(0xfff0d0, 4.8)
    key.position.set(-3, 5, 6)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffc27a, 2.2)
    fill.position.set(4, 2, 3)
    scene.add(fill)
    const rim = new THREE.PointLight(0xff9a4d, 24, 16)
    rim.position.set(-4, 1, -2)
    scene.add(rim)

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/dino/${props.modelRef}.glb`)
    if (disposed) {
      disposeModel(gltf.scene)
      return
    }
    model = gltf.scene
    scene.add(model)
    const initialBounds = measureBounds(model)
    if (initialBounds.isEmpty()) throw new Error('empty model')
    const initialSize = initialBounds.getSize(new THREE.Vector3())
    if (initialSize.z > initialSize.x * 1.2 && initialSize.z >= initialSize.y * 1.2) {
      model.rotation.y = Math.PI / 2
    } else if (initialSize.y > initialSize.x * 1.2) {
      model.rotation.z = Math.PI / 2
    }
    const bounds = measureBounds(model)
    const dimensions = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const longest = Math.max(dimensions.x, dimensions.y, dimensions.z)
    if (!Number.isFinite(longest) || longest <= 0) throw new Error('invalid model size')
    const scale = 6.6 / longest
    model.scale.setScalar(scale)
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model)
      const clip = gltf.animations.find((animation) => /idle/i.test(animation.name)) ?? gltf.animations[0]
      mixer.clipAction(clip).play()
    }

    const renderFrame = (time: number): void => {
      if (!renderer) return
      const delta = lastFrame === 0 ? 0 : Math.min((time - lastFrame) / 1000, 0.1)
      lastFrame = time
      if (autoRotate.value && !dragging && model) model.rotation.y += 0.0022
      mixer?.update(delta)
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
    resize()
    renderer.setAnimationLoop(renderFrame)
    ready.value = true
    status.value = '3D 恐龙已加载'
  } catch {
    status.value = '3D 模型暂不可用，先看知识卡'
    emit('error')
  }
}

onMounted(() => { void loadModel() })
onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
  mixer?.stopAllAction()
  if (renderer) {
    renderer.setAnimationLoop(null)
    if (model) disposeModel(model)
    renderer.dispose()
  }
  camera = undefined
})
</script>

<template>
  <div ref="stage" class="dino-model" :class="{ 'dino-model--ready': ready }" data-testid="dino-model-viewer" :aria-label="`${name} 3D 模型`">
    <div class="dino-model__placeholder" aria-hidden="true">{{ emoji }}</div>
    <p class="dino-model__status" role="status" aria-live="polite">{{ status }}</p>
    <div class="dino-model__controls" aria-label="模型控制">
      <button type="button" :aria-pressed="autoRotate" @click="autoRotate = !autoRotate">{{ autoRotate ? '暂停旋转' : '自动旋转' }}</button>
      <button type="button" aria-label="放大模型" @click="zoom(-0.7)">＋</button>
      <button type="button" aria-label="缩小模型" @click="zoom(0.7)">−</button>
    </div>
    <canvas ref="canvas" role="img" :aria-label="`${name} 3D 模型`" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" />
    <p class="dino-model__hint">拖动旋转 · 自动播放待机动画</p>
  </div>
</template>

<style scoped>
.dino-model { position: relative; display: grid; place-items: center; height: 22rem; overflow: hidden; border-radius: var(--ds-radius-lg); background: radial-gradient(circle at 50% 45%, rgb(120 74 40 / 45%), rgb(24 15 10 / 92%)); }
.dino-model__placeholder { font-size: 6rem; filter: drop-shadow(0 1rem 1.5rem rgb(0 0 0 / 40%)); opacity: 1; transition: opacity .3s ease; }
.dino-model--ready .dino-model__placeholder { opacity: 0; }
.dino-model canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; opacity: 0; transition: opacity .35s ease; }
.dino-model--ready canvas { opacity: 1; }
.dino-model__status { position: absolute; bottom: .5rem; margin: 0; color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.dino-model--ready .dino-model__status { display: none; }
.dino-model__controls { position: absolute; top: .5rem; right: .5rem; display: flex; gap: .35rem; flex-wrap: wrap; justify-content: flex-end; }
.dino-model__controls button { min-height: 2.25rem; padding: 0 .55rem; border: 1px solid rgb(255 220 170 / 35%); border-radius: var(--ds-radius-pill); background: rgb(20 12 8 / 70%); color: #ffe2b5; font-size: .72rem; }
.dino-model__hint { position: absolute; bottom: .5rem; left: .75rem; margin: 0; color: rgb(255 230 200 / 65%); font-size: .68rem; }
.dino-model--ready .dino-model__hint { display: block; }
</style>
