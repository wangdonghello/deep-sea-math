<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import type { CreatureContent } from '@/data/content/schema'

const CreatureModelViewer = defineAsyncComponent(() => import('./CreatureModelViewer.vue'))

const props = defineProps<{ creature: CreatureContent; locked?: boolean; preferModel?: boolean }>()
const failed = ref(false)
const modelFailed = ref(false)
const zoomed = ref(false)
const imageSource = computed(() => `${import.meta.env.BASE_URL}illustrations/${props.creature.illustrationRef ?? 'missing'}.svg`)
const showModel = computed(() => props.preferModel === true && props.creature.model !== undefined && !modelFailed.value)
const modelAttribution = computed(() => props.preferModel === true && !props.locked ? props.creature.model : undefined)
watch(() => props.creature.id, () => { failed.value = false; modelFailed.value = false; zoomed.value = false })

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
    <div v-else-if="showModel && creature.model" class="creature-canvas__model">
      <CreatureModelViewer :asset="creature.model" :name="creature.name" :preview-src="imageSource"
        @error="modelFailed = true" />
    </div>
    <div v-else class="creature-canvas__art">
      <img v-if="!failed" :src="imageSource" :alt="creature.name" data-testid="creature-illustration"
        :data-scale="zoomed ? 1.5 : 1" :style="{ transform: `scale(${zoomed ? 1.5 : 1})` }"
        @dblclick="toggleZoom" @error="onError" />
      <p v-else data-testid="illustration-fallback">{{ creature.name }}的原创示意插画暂不可用</p>
    </div>
    <button v-if="!locked && !showModel" type="button" data-testid="creature-zoom-toggle"
      :aria-label="zoomed ? '还原插画' : '放大插画'" @click="toggleZoom">
      {{ zoomed ? '还原' : '放大' }}
    </button>
    <figcaption v-if="modelAttribution" class="creature-canvas__model-credit" data-testid="model-attribution">
      <span>{{ modelAttribution.note }}</span>
      <span>{{ modelAttribution.attribution }}</span>
      <span>来源：<a data-testid="model-source-link" :href="modelAttribution.sourceUrl"
        target="_blank" rel="noopener noreferrer">Sketchfab 模型页面</a></span>
      <span>许可：<a data-testid="model-license-link" :href="modelAttribution.licenseUrl"
        target="_blank" rel="noopener noreferrer">{{ modelAttribution.license }}</a></span>
    </figcaption>
    <figcaption v-else-if="!locked">{{ creature.illustrationLabel }}</figcaption>
    <slot />
  </figure>
</template>

<style scoped>
.creature-canvas { margin: 0; text-align: center; }
.creature-canvas__art, .creature-canvas__silhouette { min-height: 10rem; display: grid; place-items: center; }
.creature-canvas__art { overflow: hidden; }
.creature-canvas__art img { width: min(100%, 20rem); max-height: 14rem; object-fit: contain; transition: transform .2s ease; }
.creature-canvas__model { width: 100%; }
.creature-canvas__model-credit { display: grid; gap: .35rem; margin-top: .75rem; font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
.creature-canvas__model-credit a { color: var(--ds-text-secondary); }
.creature-canvas button { min-height: 2.75rem; }
.creature-canvas__silhouette { color: var(--ds-bg-deep); background: var(--ds-glass-surface); }
.creature-canvas__silhouette svg { width: min(100%, 18rem); fill: currentColor; }
</style>
