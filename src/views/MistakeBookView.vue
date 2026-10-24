<script setup lang="ts">
import { computed } from 'vue'

import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import MistakeFilter from '@/features/mistakeBook/MistakeFilter.vue'
import MistakeList from '@/features/mistakeBook/MistakeList.vue'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import { rewardLabel } from '@/features/mistakeBook/rewardLabels'
import { useMistakeBook } from '@/features/mistakeBook/useMistakeBook'
import type { MistakeBookStore, MistakeQuestionCatalog } from '@/features/mistakeBook/types'

const props = defineProps<{
  store: MistakeBookStore
  catalog: MistakeQuestionCatalog
  logger?: (entry: Record<string, unknown>) => void
}>()
const emit = defineEmits<{
  (event: 'practice', payload: { questionIds: string[]; similarQuestionIds: string[] }): void
  (event: 'print', filter: { type: string; masteryLevel: string }): void
  (event: 'back-home'): void
}>()

const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)
const { activeProfileId, loading, loaded, errorMessage, filter, items, visibleItems, practiceProgress, practicePayload } =
  useMistakeBook(profileId, props.store, props.catalog, props.logger)

function practice(questionId: string): void {
  emit('practice', practicePayload(questionId))
}
</script>

<template>
  <main class="mistake-book" data-testid="mistake-book">
    <h1>错题本</h1>
    <p v-if="!activeProfileId" data-testid="mistake-no-profile">请先选择学习档案。</p>
    <p v-else-if="loading" data-testid="mistake-loading" role="status">正在整理错题…</p>
    <p v-else-if="errorMessage" data-testid="mistake-error" role="status">{{ errorMessage }}</p>
    <template v-else-if="loaded">
      <section class="mistake-book__reward" data-testid="mistake-reward">
        <p>错题星：{{ practiceProgress.stars }} · 已修复：{{ practiceProgress.fixedQuestionIds.length }} 道</p>
        <ul v-if="practiceProgress.badgeIds.length + practiceProgress.decorationIds.length > 0" class="mistake-book__chips">
          <li v-for="badge in practiceProgress.badgeIds" :key="badge" class="mistake-book__chip" data-testid="mistake-badge">
            {{ rewardLabel(badge) }}
          </li>
          <li v-for="decoration in practiceProgress.decorationIds" :key="decoration" class="mistake-book__chip" data-testid="mistake-decoration">
            {{ rewardLabel(decoration) }}
          </li>
        </ul>
        <p v-else class="mistake-book__next">再独立改对几道题，就能解锁修复徽章和图鉴装饰。</p>
      </section>
      <MistakeFilter v-model="filter" />
      <p v-if="items.length === 0" data-testid="mistake-empty">
        这里还没有错题，继续探索时遇到的题目会收集在这里。
      </p>
      <p v-else-if="visibleItems.length === 0" data-testid="mistake-filter-empty">
        当前条件下没有错题，试试调整筛选吧。
      </p>
      <template v-else>
        <button
          type="button"
          data-testid="print-mistakes"
          @click="emit('print', { type: filter.type, masteryLevel: filter.masteryLevel })"
        >打印错题</button>
        <MistakeList :entries="visibleItems" @practice="practice" />
      </template>
    </template>
    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.mistake-book { display: grid; gap: 1rem; min-height: 100dvh; max-width: 42rem; margin: 0 auto; padding: 1rem 1rem calc(5rem + env(safe-area-inset-bottom)); }
.mistake-list, ul { margin: 0; padding: 0; list-style: none; }
.mistake-book article { padding: 1rem; border-radius: 1rem; background: rgb(255 255 255 / 8%); }
.mistake-book button, select { min-height: 2.75rem; }
.mistake-book__reward { display: grid; gap: 6px; color: var(--ds-accent-text); font-weight: 600; }
.mistake-book__chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.mistake-book__chip { padding: 2px 10px; border: 1px solid var(--ds-accent-500); border-radius: 999px; font-size: var(--ds-font-size-caption); }
.mistake-book__next { color: var(--ds-text-secondary); font-weight: 400; font-size: var(--ds-font-size-caption); }
</style>
