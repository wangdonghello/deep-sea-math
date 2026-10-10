<script setup lang="ts">
/**
 * 深度刻度（design §4 `HomeView` 的组成组件之三）。
 *
 * 只负责把 `zones.ts` 的 {@link DEPTH_TICKS} 渲染成一条竖排刻度线：几道刻度、
 * 每道多少米、文案怎么写，全部由 props 给出，本组件不做任何判断——"下一级
 * 目标在哪"是 composable 的事（spec §完成题组推进深度）。
 *
 * 与地图同侧竖排而不是横放：首页是**下潜视角**，刻度随深度自上而下递增，
 * 孩子读到的是"越往下越深"这一个空间隐喻，而不是一条需要换算的坐标轴。
 */
import { DEPTH_TICKS } from './zones'

defineProps<{
  /** 已完成题组数量（决定当前位置，仅用于高亮当前刻度）。 */
  completedQuests: number
}>()

/** 当前所在区域的刻度下标；越界时收敛到最后一道（海沟区无上界）。 */
function currentIndex(completedQuests: number): number {
  return Math.max(0, Math.min(completedQuests, DEPTH_TICKS.length - 1))
}
</script>

<template>
  <ol class="depth-scale" data-testid="depth-scale">
    <li
      v-for="(tick, index) in DEPTH_TICKS"
      :key="tick.meters"
      class="depth-scale__tick"
      :class="{ 'depth-scale__tick--current': index === currentIndex(completedQuests) }"
      :data-testid="`depth-tick-${tick.meters}`"
    >
      <span class="depth-scale__line" aria-hidden="true" />
      <span class="depth-scale__label">{{ tick.label }}</span>
    </li>
  </ol>
</template>

<style scoped>
.depth-scale {
  /* 刻度贴在地图左缘：竖排、细线、弱化文字，不抢地图主体 */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin: 0;
  padding: var(--ds-space-sm) 0;
  list-style: none;
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}

.depth-scale__tick {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.depth-scale__line {
  width: var(--ds-space-lg);
  height: 1px;
  background: var(--ds-glass-border);
}

/* 当前刻度高亮：生物发光色，让孩子一眼看到"我在哪" */
.depth-scale__tick--current {
  color: var(--ds-accent-text);
}

.depth-scale__tick--current .depth-scale__line {
  width: var(--ds-space-xl);
  height: 2px;
  background: var(--ds-accent-500);
}
</style>
