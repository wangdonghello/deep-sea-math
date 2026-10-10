<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CreatureContent } from '@/data/content/schema'

const props = defineProps<{ creature: CreatureContent; locked?: boolean }>()
const failed = ref(false)
const zoomed = ref(false)
const imageSource = computed(() => `/illustrations/${props.creature.illustrationRef ?? 'missing'}.svg`)
watch(imageSource, () => { failed.value = false; zoomed.value = false })

function toggleZoom(): void {
  zoomed.value = !zoomed.value
}

function onError(): void {
  failed.value = true
}
</script>

<template>
  <figure class="creature-canvas" :data-creature="creature.id">
    <div v-if="locked" class="creature-canvas__silhouette" data-testid="creature-silhouette">
      <svg viewBox="0 0 240 160" role="img" aria-label="未解锁生物剪影">
        <path d="M30 80c30-42 115-48 165-8l30-24-7 32 7 32-31-20C139 133 62 122 30 80Z" />
      </svg>
    </div>
    <div v-else class="creature-canvas__art">
      <img v-if="!failed" :src="imageSource" :alt="creature.name" data-testid="creature-illustration"
        :data-scale="zoomed ? 1.5 : 1" :style="{ transform: `scale(${zoomed ? 1.5 : 1})` }"
        @dblclick="toggleZoom" @error="onError" />
      <p v-else data-testid="illustration-fallback">{{ creature.name }}的原创示意插画暂不可用</p>
    </div>
    <button v-if="!locked" type="button" data-testid="creature-zoom-toggle"
      :aria-label="zoomed ? '还原插画' : '放大插画'" @click="toggleZoom">
      {{ zoomed ? '还原' : '放大' }}
    </button>
    <figcaption v-if="!locked">{{ creature.illustrationLabel }}，本阶段不含3D模型与视频</figcaption>
    <slot />
  </figure>
</template>

<style scoped>
.creature-canvas { margin: 0; text-align: center; }
.creature-canvas__art, .creature-canvas__silhouette { min-height: 10rem; display: grid; place-items: center; }
.creature-canvas__art { overflow: hidden; }
.creature-canvas__art img { width: min(100%, 20rem); max-height: 14rem; object-fit: contain; transition: transform .2s ease; }
.creature-canvas button { min-height: 2.75rem; }
.creature-canvas__silhouette { color: var(--ds-bg-deep); background: var(--ds-glass-surface); }
.creature-canvas__silhouette svg { width: min(100%, 18rem); fill: currentColor; }
</style>
