<script setup lang="ts">
/**
 * `features/home/HomeProgressSummary.vue` —— 首页的成就概览行。
 *
 * 回答「我拥有什么」。此前首页对孩子已获得的成果**只字不提**：徽章在解锁动画
 * 里闪过就消失，图鉴解锁数要孩子自己进图鉴数。已获得的成就没有任何常驻展示，
 * 重复打开应用的激励因此断在一次性的动画上。
 *
 * 三个数字全部由事件重建（`useHomeQuest.summarizeProgress`），本组件只渲染：
 * - 徽章数：**累计**（`session-completed.rewards` 逐条数，不去重）——语义是
 *   "获得过几次"，去重会让进度永远停在 1；
 * - 图鉴进度：`已解锁 / 总数`，分母取图鉴库实际长度；
 * - 区域进度：`已解锁 / 总区数`。
 */
import { computed } from 'vue'

import type { ProgressSummary } from './useHomeQuest'

const props = defineProps<{
  summary: ProgressSummary
  /** 区域总数（四区），由调用方给以保持与 `ZONES` 同源。 */
  totalZones: number
}>()

/** 徽章文案：0 枚时说「还没有徽章」而不是「0 枚徽章」，前者是鼓励后者是判卷。 */
const badgeText = computed(() =>
  props.summary.badgeCount === 0 ? '还没有徽章' : `${props.summary.badgeCount} 枚徽章`,
)

const bestiaryText = computed(() =>
  `${props.summary.unlockedCreatureCount} / ${props.summary.totalCreatures}`,
)

const zoneText = computed(() => `${props.summary.unlockedZones} / ${props.totalZones}`)
</script>

<template>
  <section class="home-progress" data-testid="home-progress-summary" aria-label="学习成就概览">
    <div class="home-progress__item">
      <span class="home-progress__icon" aria-hidden="true">🏅</span>
      <span class="home-progress__value" data-testid="summary-badges">{{ badgeText }}</span>
      <span class="home-progress__label">徽章</span>
    </div>
    <div class="home-progress__item">
      <span class="home-progress__icon" aria-hidden="true">🐟</span>
      <span class="home-progress__value" data-testid="summary-bestiary">{{ bestiaryText }}</span>
      <span class="home-progress__label">图鉴</span>
    </div>
    <div class="home-progress__item">
      <span class="home-progress__icon" aria-hidden="true">🌊</span>
      <span class="home-progress__value" data-testid="summary-zones">{{ zoneText }}</span>
      <span class="home-progress__label">区域</span>
    </div>
  </section>
</template>

<style scoped>
.home-progress {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ds-space-sm);
  margin: 0 var(--ds-space-lg) var(--ds-space-sm);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  background: var(--ds-glass-surface);
}

.home-progress__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-xs);
  min-width: 0;
  text-align: center;
}

.home-progress__icon {
  font-size: var(--ds-font-size-title);
  line-height: 1;
}

.home-progress__value {
  color: var(--ds-text-primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  /* 长文案（"还没有徽章"）在窄屏截断而不是撑破三栏网格 */
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-progress__label {
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}
</style>
