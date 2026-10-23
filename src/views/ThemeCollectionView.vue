<script setup lang="ts">
import { computed, ref } from 'vue'

import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import DinoModelViewer from '@/features/bestiary/DinoModelViewer.vue'
import { useThemeCollection } from '@/features/bestiary/useThemeCollection'
import type { ThemeCollectionStore } from '@/features/bestiary/useThemeCollection'
import type { ThemeId } from '@/domain/model/types'
import type { ThemeEntry } from '@/data/content/themePacks'

const props = defineProps<{ profileId: string | null; themeId: ThemeId; store: ThemeCollectionStore }>()
const emit = defineEmits<{ (event: 'back-home'): void }>()
const { pack, stage, items, loading, error, noProfile } = useThemeCollection({
  store: props.store,
  profileId: () => props.profileId,
  themeId: () => props.themeId,
})
const selected = ref<ThemeEntry | null>(null)
const isSpace = computed(() => props.themeId === 'space')
const baseUrl = import.meta.env.BASE_URL

function photoUrl(entry: ThemeEntry): string | undefined {
  return entry.photoRef === undefined ? undefined : `${baseUrl}photos/dino/${entry.photoRef}.jpg`
}
const ORBIT_RINGS = [36, 48, 60, 72]
const ORBIT_RADII = [13, 18, 23, 28]

/** 把 8 个条目均匀放在四条轨道上，形成一张可读的太阳系航线图。 */
function planetStyle(index: number): Record<string, string> {
  const radius = ORBIT_RADII[index % ORBIT_RADII.length]
  return {
    '--orbit': `${radius}vmin`,
    '--orbit-start': `${((index * 45 - 90 + 360) % 360) / 3.6}%`,
    '--orbit-delay': `${-index * 4}s`,
    '--planet-size': `${index % 3 === 0 ? 2.6 : 2.1}rem`,
  }
}
</script>

<template>
  <main class="theme-collection" data-testid="theme-collection">
    <header>
      <h1>{{ pack.name }}图鉴</h1>
      <p class="theme-collection__stage" data-testid="collection-stage">
        探索第 {{ stage }} 阶段 · {{ pack.stageNames[Math.min(stage, 4) - 1] ?? '尚未出发' }}
      </p>
      <p class="theme-collection__hint">完成每日任务推进阶段，解锁更多{{ pack.name }}收藏。</p>
    </header>

    <p v-if="loading" role="status">正在读取图鉴…</p>
    <p v-else-if="error" role="status">图鉴暂时打不开，请稍后再试</p>
    <p v-else-if="noProfile">请先选择学习档案。</p>
    <section v-else-if="isSpace" class="space-map" data-testid="space-map" aria-label="太阳系航线图">
      <div class="space-map__stars" aria-hidden="true" />
      <div class="space-map__sun" aria-hidden="true"><span>☀️</span></div>
      <span
        v-for="ring in ORBIT_RINGS"
        :key="ring"
        class="space-map__orbit"
        :style="{ width: `${ring}%`, height: `${ring}%` }"
        aria-hidden="true"
      />
      <button
        v-for="(item, index) in items"
        :key="item.entry.id"
        type="button"
        class="space-item"
        :class="{
          'space-item--locked': !item.unlocked,
          'space-item--selected': selected?.id === item.entry.id,
          'space-item--unlocked': item.unlocked,
        }"
        :style="planetStyle(index)"
        :disabled="!item.unlocked"
        :data-testid="`theme-entry-${item.entry.id}`"
        :aria-label="item.unlocked ? item.entry.name : '未解锁'"
        @click="selected = item.entry"
      >
        <span class="space-item__art" aria-hidden="true">{{ item.unlocked ? item.entry.emoji : '？' }}</span>
        <span class="space-item__name">{{ item.unlocked ? item.entry.name : '未解锁' }}</span>
        <span v-if="item.unlocked" class="space-item__action">查看</span>
      </button>
    </section>

    <ul v-else class="theme-collection__list">
      <li v-for="item in items" :key="item.entry.id">
        <article
          class="theme-entry"
          :class="{ 'theme-entry--locked': !item.unlocked }"
          :data-testid="`theme-entry-${item.entry.id}`"
        >
          <img v-if="item.unlocked && item.entry.photoRef" class="theme-entry__photo" :src="photoUrl(item.entry)" :alt="`${item.entry.name} 的博物馆化石照片`">
          <div v-else class="theme-entry__art" aria-hidden="true">{{ item.unlocked ? item.entry.emoji : '？' }}</div>
          <h2>{{ item.unlocked ? item.entry.name : '未解锁' }}</h2>
          <p v-if="item.unlocked">{{ item.entry.summary }}</p>
          <p v-else>完成更多任务解锁</p>
          <button
            v-if="item.unlocked"
            type="button"
            :data-testid="`theme-open-${item.entry.id}`"
            @click="selected = item.entry"
          >查看知识卡</button>
        </article>
      </li>
    </ul>

    <section v-if="selected" class="theme-detail" data-testid="theme-detail">
      <DinoModelViewer
        v-if="selected.modelRef"
        :model-ref="selected.modelRef"
        :name="selected.name"
        :emoji="selected.emoji"
        :preview-src="photoUrl(selected)"
      />
      <h2>{{ selected.name }} {{ selected.emoji }}</h2>
      <p>{{ selected.summary }}</p>
      <ul>
        <li v-for="(card, index) in selected.knowledgeCards" :key="index">{{ card }}</li>
      </ul>
      <p class="theme-detail__sources">
        知识来源：
        <a v-for="source in selected.sources" :key="source" :href="source" target="_blank" rel="noreferrer">{{ source }}</a>
      </p>
      <p v-if="selected.photoSource" class="theme-detail__sources">
        照片：<a :href="selected.photoSource" target="_blank" rel="noreferrer">{{ selected.photoCredit }}</a>
        （{{ selected.photoLicense }}）
      </p>
      <p v-if="selected.modelSource" class="theme-detail__sources">
        3D 模型：<a :href="selected.modelSource" target="_blank" rel="noreferrer">Poly Pizza</a>
        （{{ selected.modelLicense ?? 'CC0' }}）
      </p>
      <button type="button" @click="selected = null">收起</button>
    </section>

    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.theme-collection { min-height: 100dvh; padding: var(--ds-space-lg) var(--ds-space-lg) calc(5rem + env(safe-area-inset-bottom)); color: var(--ds-text-primary); }
.theme-collection__stage { color: var(--ds-accent-text); font-weight: 600; }
.theme-collection__hint { color: var(--ds-text-secondary); }
.theme-collection__list { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: var(--ds-space-md); margin: 0; padding: 0; list-style: none; }
.theme-entry { display: grid; gap: .4rem; padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-lg); background: var(--ds-glass-surface); }
.theme-entry--locked { opacity: .65; }
.theme-entry__art { display: grid; place-items: center; min-height: 6rem; font-size: 2.8rem; line-height: 1; }
.theme-entry__photo { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--ds-radius-md); }
.theme-entry h2 { margin: 0; font-size: var(--ds-font-size-title); }
.theme-entry p { margin: 0; color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); line-height: 1.5; }

.space-map {
  position: relative;
  height: auto;
  aspect-ratio: 1.15 / 1;
  min-height: 20rem;
  overflow: hidden;
  border: 1px solid rgb(120 160 255 / 28%);
  border-radius: var(--ds-radius-lg);
  background:
    radial-gradient(circle at 18% 22%, rgb(76 110 255 / 28%), transparent 28%),
    radial-gradient(circle at 82% 76%, rgb(180 76 255 / 22%), transparent 30%),
    radial-gradient(circle at 50% 50%, #182451 0, #080d21 62%, #040612 100%);
  box-shadow: inset 0 0 4rem rgb(20 40 110 / 60%);
}
.space-map__stars {
  position: absolute;
  inset: 0;
  opacity: .9;
  background-image:
    radial-gradient(2px 2px at 12% 18%, #fff, transparent),
    radial-gradient(1px 1px at 72% 12%, #cfe0ff, transparent),
    radial-gradient(2px 2px at 84% 44%, #fff, transparent),
    radial-gradient(1px 1px at 28% 72%, #d8e6ff, transparent),
    radial-gradient(1.5px 1.5px at 58% 88%, #fff, transparent),
    radial-gradient(1px 1px at 44% 34%, #bcd2ff, transparent);
  animation: star-field 7s ease-in-out infinite alternate;
}
.space-map__sun {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 4.6rem;
  height: 4.6rem;
  border-radius: 50%;
  background: radial-gradient(circle, #ffe8a3, #ffb347 55%, #ff7a2f);
  box-shadow: 0 0 2.5rem 1.2rem rgb(255 166 60 / 55%);
  transform: translate(-50%, -50%);
  animation: sun-breathe 5s ease-in-out infinite;
  font-size: 2rem;
}
.space-map__orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px dashed rgb(150 180 255 / 22%);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: ring-spin 90s linear infinite;
}
.space-item {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: grid;
  justify-items: center;
  gap: .1rem;
  width: 4.4rem;
  margin: 0;
  padding: .2rem;
  border: 0;
  background: none;
  color: var(--ds-text-primary);
  font: inherit;
  /* 沿圆形轨道公转；offset-rotate: 0 让星球和文字始终正向朝向孩子。 */
  offset-path: circle(var(--orbit) at 50% 50%);
  offset-rotate: 0deg;
  offset-distance: 0%;
  transform: translate(-50%, -50%);
  animation: planet-orbit 32s linear infinite;
  animation-delay: var(--orbit-delay);
  will-change: offset-distance;
  cursor: pointer;
}
.space-item:disabled { cursor: default; }
.space-item__art { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; border-radius: 50%; font-size: var(--planet-size); line-height: 1; }
.space-item--unlocked .space-item__art { background: radial-gradient(circle, rgb(120 180 255 / 35%), transparent 68%); box-shadow: 0 0 1.4rem rgb(102 170 255 / 55%); }
.space-item--selected .space-item__art { box-shadow: 0 0 0 2px #9fd6ff, 0 0 2rem rgb(120 200 255 / 85%); }
.space-item--locked { opacity: .38; }
.space-item--locked .space-item__art { border: 1px dashed rgb(190 210 255 / 50%); color: #cfe0ff; font-size: 1.2rem; }
.space-item__name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--ds-font-size-caption); text-shadow: 0 1px 4px #000; }
.space-item__action { color: #a9d8ff; font-size: .68rem; }
@keyframes planet-orbit { from { offset-distance: 0%; } to { offset-distance: 100%; } }
@keyframes ring-spin { from { transform: translate(-50%, -50%) rotate(0); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes sun-breathe { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.06); } }
@keyframes star-field { from { opacity: .55; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .space-item, .space-map__sun, .space-map__stars, .space-map__orbit { animation: none; }
  .space-item { offset-distance: var(--orbit-start); }
}
.theme-detail { display: grid; gap: .6rem; margin-top: var(--ds-space-lg); padding: var(--ds-space-md); border: 1px solid var(--ds-accent-500); border-radius: var(--ds-radius-lg); background: var(--ds-glass-surface); }
.theme-detail h2, .theme-detail p { margin: 0; }
.theme-detail ul { margin: 0; padding-left: 1.2rem; }
.theme-detail__sources { word-break: break-all; font-size: var(--ds-font-size-caption); }
.theme-detail__sources a { margin-right: .5rem; }
</style>
