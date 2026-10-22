<script setup lang="ts">
import { ref } from 'vue'

import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
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
    <ul v-else class="theme-collection__list">
      <li v-for="item in items" :key="item.entry.id">
        <article
          class="theme-entry"
          :class="{ 'theme-entry--locked': !item.unlocked }"
          :data-testid="`theme-entry-${item.entry.id}`"
        >
          <div class="theme-entry__art" aria-hidden="true">{{ item.unlocked ? item.entry.emoji : '？' }}</div>
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
      <h2>{{ selected.name }} {{ selected.emoji }}</h2>
      <p>{{ selected.summary }}</p>
      <ul>
        <li v-for="(card, index) in selected.knowledgeCards" :key="index">{{ card }}</li>
      </ul>
      <p class="theme-detail__sources">
        来源：
        <a v-for="source in selected.sources" :key="source" :href="source" target="_blank" rel="noreferrer">{{ source }}</a>
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
.theme-entry__art { font-size: 2.8rem; line-height: 1; }
.theme-entry h2 { margin: 0; font-size: var(--ds-font-size-title); }
.theme-entry p { margin: 0; color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); line-height: 1.5; }
.theme-detail { display: grid; gap: .6rem; margin-top: var(--ds-space-lg); padding: var(--ds-space-md); border: 1px solid var(--ds-accent-500); border-radius: var(--ds-radius-lg); background: var(--ds-glass-surface); }
.theme-detail h2, .theme-detail p { margin: 0; }
.theme-detail ul { margin: 0; padding-left: 1.2rem; }
.theme-detail__sources { word-break: break-all; font-size: var(--ds-font-size-caption); }
.theme-detail__sources a { margin-right: .5rem; }
</style>
