<script setup lang="ts">
/**
 * 盲盒伙伴形象：使用美术提供的 1024 画布、统一脚底基线的 15 级插画。
 *
 * 页面只加载当前等级的一张 WebP；整张图做投喂/抚摸/玩耍的反馈动画。
 * 素材目录：public/pets/<animal>/lv<level>.webp
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export type CompanionId =
  | 'companion-cat' | 'companion-dog' | 'companion-hamster' | 'companion-lion' | 'companion-tiger'
  | 'companion-dragon' | 'companion-yinglong' | 'companion-zhulong' | 'companion-qinglong'
export type CompanionAnimation = 'eat' | 'pet' | 'play'

interface CompanionLook {
  name: string
  dir: string
}

const LOOKS: Record<CompanionId, CompanionLook> = {
  'companion-cat': { name: '小猫', dir: 'cat' },
  'companion-dog': { name: '小狗', dir: 'dog' },
  'companion-hamster': { name: '仓鼠', dir: 'hamster' },
  'companion-lion': { name: '狮子', dir: 'lion' },
  'companion-tiger': { name: '老虎', dir: 'tiger' },
  'companion-dragon': { name: '东海龙王', dir: 'donghai' },
  'companion-yinglong': { name: '应龙', dir: 'yinglong' },
  'companion-zhulong': { name: '烛龙', dir: 'zhulong' },
  'companion-qinglong': { name: '青龙', dir: 'qinglong' },
}

const props = defineProps<{
  animalId: CompanionId
  mood: number
  level?: number
  action?: CompanionAnimation | null
  actionNonce?: number
}>()
const emit = defineEmits<{ (event: 'tap'): void }>()

const ANIMATION_MS = 680
const look = computed(() => LOOKS[props.animalId] ?? LOOKS['companion-dog'])
const level = computed(() => {
  const raw = Number.isFinite(props.level) ? Number(props.level) : 1
  return Math.min(15, Math.max(1, Math.round(raw)))
})
const mood = computed(() => {
  const raw = Number.isFinite(props.mood) ? props.mood : 0
  return Math.min(100, Math.max(0, Math.round(raw)))
})
const low = computed(() => mood.value < 40)
const src = computed(() => `${import.meta.env.BASE_URL}pets/${look.value.dir}/lv${level.value}.webp`)

const animation = ref<CompanionAnimation | null>(null)
let timer: number | undefined

function play(kind: CompanionAnimation): void {
  animation.value = null
  // 先清空再在下一帧加类，连续点击也能重新触发同一段动画。
  requestAnimationFrame(() => { animation.value = kind })
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => { animation.value = null; timer = undefined }, ANIMATION_MS)
}

watch(
  () => props.actionNonce,
  () => { if (props.action) play(props.action) },
)

function tap(): void {
  play('pet')
  emit('tap')
}

onBeforeUnmount(() => { if (timer !== undefined) window.clearTimeout(timer) })
</script>

<template>
  <button
    type="button"
    class="companion"
    :class="[`is-${animation ?? 'idle'}`, { 'is-low': low }]"
    data-testid="animal-avatar"
    :data-animal="animalId"
    :data-level="level"
    :data-action="animation ?? 'idle'"
    :aria-label="`${look.name}伙伴，Lv.${level}，心情 ${mood}/100，点我摸摸`"
    @click="tap"
  >
    <img
      class="companion__image"
      :src="src"
      :alt="`${look.name} Lv.${level}`"
      draggable="false"
      decoding="async"
    />
  </button>
</template>

<style scoped>
.companion {
  display: grid;
  place-items: center;
  width: min(72vw, 20rem);
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  background: radial-gradient(circle at 50% 45%, rgb(126 220 255 / 14%), transparent 66%);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.companion__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: 50% 88%;
  user-select: none;
  -webkit-user-drag: none;
  transition: filter .25s ease;
}
.companion.is-low .companion__image { filter: saturate(.72) brightness(.9); }

.companion.is-eat .companion__image { animation: companion-eat .34s ease-in-out 2; }
.companion.is-pet .companion__image { animation: companion-pet .34s ease-out; }
.companion.is-play .companion__image { animation: companion-play .62s ease-out; }

@keyframes companion-eat {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  45% { transform: translateY(3px) scale(1.03, .97); }
}
@keyframes companion-pet {
  0% { transform: scale(1, 1); }
  35% { transform: scale(1.06, .94) rotate(-2deg); }
  70% { transform: scale(.98, 1.02) rotate(1.5deg); }
  100% { transform: scale(1, 1); }
}
@keyframes companion-play {
  0%, 100% { transform: translateY(0) rotate(0); }
  25% { transform: translateY(-10px) rotate(-3deg); }
  50% { transform: translateY(0) rotate(3deg); }
  75% { transform: translateY(-6px) rotate(-2deg); }
}
@media (prefers-reduced-motion: reduce) {
  .companion__image { animation: none !important; }
}
</style>
