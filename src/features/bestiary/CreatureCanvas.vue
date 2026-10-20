<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import type { CreatureContent } from '@/data/content/schema'

const CreatureModelViewer = defineAsyncComponent(() =>
  import('./CreatureModelViewer.vue').then((module) => module.default),
)

const props = defineProps<{
  creature: CreatureContent
  locked?: boolean
  /**
   * 允许在影像与授权 3D 模型之间切换。
   *
   * 图鉴卡片与观察舱都传 `true`；地图等次要位置不传，只显示真实影像。
   */
  allowModel?: boolean
  /**
   * 有授权模型时默认展示 3D 模型（而不是影像）。
   *
   * 与 `allowModel` 分开：`allowModel` 是"能不能切"，`preferModel` 是"先看
   * 哪个"。两者都为 `true` 且该物种有模型时才默认 3D；没有模型或未解锁时
   * 仍以影像/剪影为默认视觉。
   */
  preferModel?: boolean
  /** 紧凑署名：默认只显示短署名，完整授权收进可展开说明。 */
  thumbnail?: boolean
}>()
const failed = ref(false)
const modelFailed = ref(false)
const zoomed = ref(false)
const hasModel = computed(() => props.creature.model !== undefined && !modelFailed.value)
const canSwitchModel = computed(() => props.allowModel === true && !props.locked && hasModel.value)
const defaultMode = computed<'photo' | 'model'>(() =>
  props.preferModel === true && canSwitchModel.value ? 'model' : 'photo',
)
const mode = ref<'photo' | 'model'>(defaultMode.value)
const showModel = computed(() => canSwitchModel.value && mode.value === 'model')
const model = computed(() => (showModel.value ? props.creature.model : undefined))
const photoSource = computed(() => `${import.meta.env.BASE_URL}photos/${props.creature.photo.ref}.jpg`)

watch(() => props.creature.id, () => {
  failed.value = false
  modelFailed.value = false
  zoomed.value = false
  mode.value = defaultMode.value
})

function toggleZoom(): void {
  zoomed.value = !zoomed.value
}

function toggleMode(): void {
  mode.value = showModel.value ? 'photo' : 'model'
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
      <CreatureModelViewer :asset="creature.model" :name="creature.name" :preview-src="photoSource"
        @error="modelFailed = true" />
    </div>
    <div v-else class="creature-canvas__art">
      <img v-if="!failed" :src="photoSource" :alt="`${creature.name}真实影像`"
        data-testid="creature-photo" loading="lazy" decoding="async"
        :data-scale="zoomed ? 1.5 : 1" :style="{ transform: `scale(${zoomed ? 1.5 : 1})` }"
        @dblclick="toggleZoom" @error="onError" />
      <p v-else data-testid="photo-fallback">{{ creature.name }}的真实影像暂不可用</p>
    </div>
    <div v-if="!locked" class="creature-canvas__controls">
      <button v-if="canSwitchModel" type="button" data-testid="creature-model-toggle"
        :aria-pressed="showModel" @click="toggleMode">
        {{ showModel ? '看真实照片' : '看 3D 模型' }}
      </button>
      <button v-if="!showModel" type="button" data-testid="creature-zoom-toggle"
        :aria-label="zoomed ? '还原影像' : '放大影像'" @click="toggleZoom">
        {{ zoomed ? '还原' : '放大' }}
      </button>
    </div>
    <figcaption v-if="!locked" class="creature-canvas__credit">
      <!-- 3D 模型与影像各自署名：CC BY / CC BY-SA 要求署名随作品一起出现。 -->
      <div v-if="model" data-testid="model-attribution">
        <span>{{ model.note }}</span>
        <template v-if="thumbnail">
          <span>模型授权 · {{ model.creditSummary }}</span>
          <details class="creature-canvas__credit-details">
            <summary data-testid="model-credit-summary">查看完整署名与许可</summary>
            <span data-testid="model-full-attribution">{{ model.attribution }}</span>
            <span>来源：<a data-testid="model-source-link" :href="model.sourceUrl"
              target="_blank" rel="noopener noreferrer">Sketchfab 模型页面</a></span>
            <span>许可：<a data-testid="model-license-link" :href="model.licenseUrl"
              target="_blank" rel="noopener noreferrer">{{ model.license }}</a></span>
          </details>
        </template>
        <template v-else>
          <span>{{ model.attribution }}</span>
          <span>来源：<a data-testid="model-source-link" :href="model.sourceUrl"
            target="_blank" rel="noopener noreferrer">Sketchfab 模型页面</a></span>
          <span>许可：<a data-testid="model-license-link" :href="model.licenseUrl"
            target="_blank" rel="noopener noreferrer">{{ model.license }}</a></span>
        </template>
      </div>
      <template v-else>
        <div data-testid="photo-attribution">
          <span>{{ creature.photo.note }}</span>
          <template v-if="thumbnail">
            <span>影像授权 · {{ creature.photo.creditSummary }}</span>
            <details class="creature-canvas__credit-details">
              <summary data-testid="photo-credit-summary">查看完整署名与许可</summary>
              <span data-testid="photo-full-attribution">{{ creature.photo.attribution }}</span>
            </details>
          </template>
          <template v-else>
            <span>{{ creature.photo.attribution }}</span>
          </template>
          <span>来源：<a data-testid="photo-source-link" :href="creature.photo.sourceUrl"
            target="_blank" rel="noopener noreferrer">影像素材页</a></span>
          <span>许可：<a data-testid="photo-license-link" :href="creature.photo.licenseUrl"
            target="_blank" rel="noopener noreferrer">{{ creature.photo.license }}</a></span>
        </div>
      </template>
    </figcaption>
    <slot />
  </figure>
</template>

<style scoped>
.creature-canvas { margin: 0; text-align: center; }
.creature-canvas__art, .creature-canvas__silhouette { min-height: 10rem; display: grid; place-items: center; }
.creature-canvas__art { overflow: hidden; }
.creature-canvas__art img { width: min(100%, 22rem); max-height: 15rem; object-fit: contain; border-radius: var(--ds-radius-sm); transition: transform .2s ease; }
.creature-canvas__model { width: 100%; }
.creature-canvas__credit { display: grid; gap: .35rem; margin-top: .75rem; font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
.creature-canvas__credit > div { display: grid; gap: .35rem; }
.creature-canvas__credit a { color: var(--ds-text-secondary); }
.creature-canvas__credit-details { text-align: left; }
.creature-canvas__credit-details summary { color: var(--ds-text-secondary); cursor: pointer; }
.creature-canvas__controls { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: center; margin-top: .75rem; }
.creature-canvas button { min-height: 2.75rem; }
.creature-canvas__silhouette { color: var(--ds-bg-deep); background: var(--ds-glass-surface); }
.creature-canvas__silhouette svg { width: min(100%, 18rem); fill: currentColor; }
</style>
