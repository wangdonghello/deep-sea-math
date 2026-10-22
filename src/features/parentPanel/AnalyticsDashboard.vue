<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  GRADES,
  THEME_LABELS,
  emptySnapshot,
  loadAnalyticsSnapshot,
  type AnalyticsSnapshot,
  type GradeThemeRow,
} from './analyticsCounters'
import type { ThemeId } from '@/domain/model/types'

const props = defineProps<{
  /** 测试注入；缺省在测试环境返回空快照，生产环境读真实计数器。 */
  loader?: () => Promise<AnalyticsSnapshot>
}>()

const snapshot = ref<AnalyticsSnapshot | null>(null)
const loading = ref(true)
const refreshKey = ref(0)

const total = computed(() => (snapshot.value?.pageTotal ?? 0) + (snapshot.value?.profileTotal ?? 0) + (snapshot.value?.sessionTotal ?? 0))
const pageMax = computed(() => Math.max(1, ...(snapshot.value?.pages.map((page) => page.count) ?? [])))

function rowsFor(kind: 'profiles' | 'sessions'): { grade: number; total: number; segments: { themeId: ThemeId; count: number; percent: number }[] }[] {
  const rows = snapshot.value?.[kind] ?? []
  return GRADES.map((grade) => {
    const gradeRows = rows.filter((row) => row.grade === grade)
    const gradeTotal = gradeRows.reduce((sum, row) => sum + row.count, 0)
    return {
      grade,
      total: gradeTotal,
      segments: gradeRows.map((row: GradeThemeRow) => ({
        themeId: row.themeId,
        count: row.count,
        percent: gradeTotal === 0 ? 0 : (row.count / gradeTotal) * 100,
      })),
    }
  })
}



async function load(): Promise<void> {
  loading.value = true
  try {
    const loader = props.loader ?? (import.meta.env.MODE === 'test' ? async () => emptySnapshot() : loadAnalyticsSnapshot)
    snapshot.value = await loader()
  } finally {
    loading.value = false
  }
}

function refresh(): void {
  refreshKey.value += 1
  void load()
}

onMounted(() => { void load() })
</script>

<template>
  <section class="parent-card analytics-dashboard" data-testid="analytics-dashboard" :data-refresh="refreshKey">
    <header class="analytics-dashboard__header">
      <div>
        <h2>使用统计</h2>
        <p class="parent-hint">匿名聚合计数，不含姓名、档案编号、PIN 或答案。这里看到的是“用了多少”，不是“哪位家长”。</p>
      </div>
      <button type="button" class="parent-button" data-testid="analytics-refresh" :disabled="loading" @click="refresh">刷新</button>
    </header>

    <p v-if="loading" role="status">正在读取统计…</p>
    <p v-else-if="total === 0" class="parent-hint" data-testid="analytics-empty">
      还没有匿名统计样本。家长在上方开启统计并完成操作后，这里会出现图表。
    </p>

    <template v-else>
      <div class="analytics-dashboard__stats">
        <article><span>页面访问</span><strong data-testid="analytics-page-total">{{ snapshot?.pageTotal ?? 0 }}</strong></article>
        <article><span>创建档案</span><strong data-testid="analytics-profile-total">{{ snapshot?.profileTotal ?? 0 }}</strong></article>
        <article><span>完成题组</span><strong data-testid="analytics-session-total">{{ snapshot?.sessionTotal ?? 0 }}</strong></article>
      </div>

      <section class="analytics-chart" aria-label="页面访问量">
        <h3>页面访问</h3>
        <div v-for="page in snapshot?.pages ?? []" :key="page.key" class="analytics-bar" data-testid="analytics-page-row">
          <span class="analytics-bar__label">{{ page.label }}</span>
          <span class="analytics-bar__track"><span class="analytics-bar__fill" :style="{ width: `${Math.max(2, (page.count / pageMax) * 100)}%` }" /></span>
          <strong class="analytics-bar__value">{{ page.count }}</strong>
        </div>
      </section>

      <section class="analytics-chart" aria-label="按年级和主题的建档数">
        <h3>创建档案</h3>
        <div v-for="row in rowsFor('profiles')" :key="`profile-${row.grade}`" class="analytics-bar analytics-bar--stacked" data-testid="analytics-profile-row">
          <span class="analytics-bar__label">{{ row.grade }} 年级</span>
          <span class="analytics-bar__track">
            <span
              v-for="segment in row.segments"
              :key="segment.themeId"
              class="analytics-bar__segment"
              :class="`analytics-bar__segment--${segment.themeId}`"
              :style="{ width: `${segment.percent}%` }"
              :title="`${THEME_LABELS[segment.themeId]} ${segment.count}`"
            />
          </span>
          <strong class="analytics-bar__value">{{ row.total }}</strong>
        </div>
        <div class="analytics-legend">
          <span v-for="theme in Object.keys(THEME_LABELS) as ThemeId[]" :key="theme">
            <i :class="`analytics-legend__dot analytics-legend__dot--${theme}`" />{{ THEME_LABELS[theme] }}
          </span>
        </div>
      </section>

      <section class="analytics-chart" aria-label="按年级和主题的完成题组数">
        <h3>完成题组</h3>
        <div v-for="row in rowsFor('sessions')" :key="`session-${row.grade}`" class="analytics-bar analytics-bar--stacked" data-testid="analytics-session-row">
          <span class="analytics-bar__label">{{ row.grade }} 年级</span>
          <span class="analytics-bar__track">
            <span
              v-for="segment in row.segments"
              :key="segment.themeId"
              class="analytics-bar__segment"
              :class="`analytics-bar__segment--${segment.themeId}`"
              :style="{ width: `${segment.percent}%` }"
              :title="`${THEME_LABELS[segment.themeId]} ${segment.count}`"
            />
          </span>
          <strong class="analytics-bar__value">{{ row.total }}</strong>
        </div>
        <div class="analytics-legend">
          <span v-for="theme in Object.keys(THEME_LABELS) as ThemeId[]" :key="theme">
            <i :class="`analytics-legend__dot analytics-legend__dot--${theme}`" />{{ THEME_LABELS[theme] }}
          </span>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.analytics-dashboard { display: grid; gap: var(--ds-space-md); }
.analytics-dashboard__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ds-space-md); }
.analytics-dashboard__header h2 { margin: 0 0 .35rem; }
.analytics-dashboard__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ds-space-sm); }
.analytics-dashboard__stats article { display: grid; gap: .2rem; padding: var(--ds-space-sm); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: rgb(255 255 255 / 5%); text-align: center; }
.analytics-dashboard__stats span { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.analytics-dashboard__stats strong { color: var(--ds-accent-text); font-size: var(--ds-font-size-title); font-variant-numeric: tabular-nums; }
.analytics-chart { display: grid; gap: .55rem; padding-top: var(--ds-space-sm); border-top: 1px solid var(--ds-glass-border); }
.analytics-chart h3 { margin: 0; font-size: var(--ds-font-size-body); }
.analytics-bar { display: grid; grid-template-columns: 4.4rem minmax(0, 1fr) 2.5rem; align-items: center; gap: .5rem; }
.analytics-bar__label { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); white-space: nowrap; }
.analytics-bar__track { display: flex; height: .85rem; overflow: hidden; border-radius: var(--ds-radius-pill); background: rgb(255 255 255 / 10%); }
.analytics-bar__fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--ds-accent-500), #ffd08a); }
.analytics-bar__value { color: var(--ds-text-primary); font-size: var(--ds-font-size-caption); text-align: right; font-variant-numeric: tabular-nums; }
.analytics-bar__segment { display: block; height: 100%; min-width: 0; }
.analytics-bar__segment--deep-sea { background: #54b8e8; }
.analytics-bar__segment--dinosaur { background: #e49b4c; }
.analytics-bar__segment--space { background: #a88cff; }
.analytics-legend { display: flex; flex-wrap: wrap; gap: .8rem; color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.analytics-legend span { display: inline-flex; align-items: center; gap: .3rem; }
.analytics-legend__dot { width: .65rem; height: .65rem; border-radius: 50%; }
.analytics-legend__dot--deep-sea { background: #54b8e8; }
.analytics-legend__dot--dinosaur { background: #e49b4c; }
.analytics-legend__dot--space { background: #a88cff; }
@media (max-width: 420px) {
  .analytics-dashboard__header { flex-direction: column; }
  .analytics-dashboard__stats { grid-template-columns: 1fr; }
}
</style>
