<script setup lang="ts">
/**
 * 徽章墙：把“通关后到底得了什么徽章”从一闪而过的解锁动画变成常驻页面。
 *
 * 数据全部来自事件重放（`resolveBadgeSummary`），不额外维护一份“已获得徽章”
 * 状态；因此刷新、换设备、家长报告三处看到的是同一份事实。
 */
import { computed, ref, watch } from 'vue'

import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import { homeThemeById } from '@/features/home/homeThemes'
import { BADGE_CATALOG, badgesBySection, themeBadges, type BadgeDefinition } from '@/features/badges/badgeCatalog'
import { resolveBadgeSummary, type BadgeSummary } from '@/features/badges/badgeProgress'
import type { DomainEvent, ThemeId } from '@/domain/model/types'

const props = defineProps<{
  profileId: string | null
  themeId: ThemeId
  store: { listEvents(profileId: string): Promise<readonly DomainEvent[]> }
}>()
const emit = defineEmits<{ (event: 'back-home'): void }>()

const loading = ref(false)
const error = ref(false)
const summary = ref<BadgeSummary>({
  total: BADGE_CATALOG.length,
  earned: 0,
  states: new Map(),
})

async function load(profileId: string | null): Promise<void> {
  if (profileId === null) {
    summary.value = { total: BADGE_CATALOG.length, earned: 0, states: new Map() }
    return
  }
  loading.value = true
  error.value = false
  try {
    const events = await props.store.listEvents(profileId)
    summary.value = resolveBadgeSummary(events, profileId)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

watch(() => props.profileId, (profileId) => { void load(profileId) }, { immediate: true })

const theme = computed(() => homeThemeById(props.themeId))

/** 三段徽章：主题 / 学习 / 错题。 */
const sections = computed(() => [
  { id: 'theme', title: `${theme.value.name}主题徽章`, badges: themeBadges(props.themeId) },
  { id: 'common', title: '学习徽章', badges: badgesBySection('common') },
  { id: 'mistake', title: '错题徽章', badges: badgesBySection('mistake') },
] as const)

function stateOf(badge: BadgeDefinition) {
  return summary.value.states.get(badge.id) ?? { earned: false, count: 0 }
}

function stateText(badge: BadgeDefinition): string {
  const state = stateOf(badge)
  if (!state.earned) return '未获得'
  return state.count > 1 ? `已获得 ${state.count} 次` : '已获得'
}
</script>

<template>
  <main class="badges-view" data-testid="badges-view">
    <h1>徽章墙</h1>
    <p class="badges-view__summary" data-testid="badges-summary">
      已获得 {{ summary.earned }} / {{ summary.total }} 枚徽章
    </p>

    <p v-if="loading" role="status">正在整理徽章…</p>
    <p v-else-if="error" data-testid="badges-error" role="status">徽章暂时看不了，请稍后再试</p>
    <template v-else>
      <section
        v-for="group in sections"
        :key="group.id"
        class="badges-view__group"
        :data-testid="`badge-group-${group.id}`"
      >
        <h2>{{ group.title }}</h2>
        <ul class="badges-view__grid">
          <li
            v-for="badge in group.badges"
            :key="badge.id"
            class="badge-card"
            :class="{ 'badge-card--earned': stateOf(badge).earned }"
            :data-testid="`badge-${badge.id}`"
            :data-earned="stateOf(badge).earned ? 'true' : 'false'"
          >
            <span class="badge-card__icon" aria-hidden="true">{{ badge.icon }}</span>
            <span class="badge-card__name">{{ badge.name }}</span>
            <span class="badge-card__requirement">{{ badge.requirement }}</span>
            <span class="badge-card__state">{{ stateText(badge) }}</span>
          </li>
        </ul>
      </section>
    </template>

    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.badges-view {
  display: grid;
  gap: var(--ds-space-md);
  min-height: 100dvh;
  max-width: 42rem;
  margin: 0 auto;
  padding: var(--ds-space-lg) var(--ds-space-lg) calc(5rem + env(safe-area-inset-bottom));
  color: var(--ds-text-primary);
}

.badges-view__summary { margin: 0; color: var(--ds-text-secondary); }

.badges-view__group h2 { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-font-size-title); }

.badges-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: var(--ds-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.badge-card {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: var(--ds-space-md) var(--ds-space-sm);
  border: 1px dashed var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-glass-surface);
  text-align: center;
  opacity: .55;
}

.badge-card--earned {
  border-style: solid;
  border-color: var(--ds-accent-500);
  opacity: 1;
}

.badge-card__icon { font-size: 2rem; line-height: 1.2; filter: grayscale(1); }
.badge-card--earned .badge-card__icon { filter: none; }
.badge-card__name { font-weight: 700; }
.badge-card__requirement { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); line-height: 1.4; }
.badge-card__state { margin-top: 2px; font-size: var(--ds-font-size-caption); color: var(--ds-accent-text); }
</style>
