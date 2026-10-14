<script setup lang="ts">
/**
 * 地图主体（design §4 `HomeView` 的组成组件之一，方案 A 的上半屏）。
 *
 * 视觉：下潜视角的深海剖面 —— 顶部潜水艇基地，向下依次是四个深度区域，
 * 左侧深度刻度，鱼群从背景游过（Task 10 的 `FishBackdrop`）。
 *
 * 分区**数据驱动**（`zones` 配置数组）：模板只 `v-for` 一遍 {@link ZONES}，
 * 不写死四个 `<div>`。区域名与深度范围是内容事实（spec §深海地图与深度进度
 * 冻结），Task 8/14 调整区域表时改 `zones.ts` 一处即可，模板无需碰。
 *
 * 本组件不含任何业务判断"该不该解锁某区"：解锁态由 props 传入（composable
 * 从 `bestiaryUnlock` 投影与已完成题组数推导），组件只按态渲染。
 */
import FishBackdrop from '@/features/theme/FishBackdrop.vue'
import DepthScale from './DepthScale.vue'
import { BASE_ZONE, ZONES } from './zones'

defineProps<{
  /**
   * 当前所在区域在 {@link ZONES} 中的下标（0 基）。
   *
   * **-1 表示还在潜水艇基地**（一个区都没解锁）。此前这个 prop 是 1 基的
   * （0 = 基地、1..4 = 四区），与 `HomeView` 用事件投影算出的下标差一，
   * 于是"基地"与"第一区"两个状态被混在同一個值上。现在统一为 0 基，
   * `-1` 这一档的语义由调用方显式给出。
   */
  currentZoneIndex: number
  /** 已完成题组数量（深度刻度高亮与文案用）。 */
  completedQuests: number
}>()
</script>

<template>
  <section class="map-panel" data-testid="map-panel">
    <!--
      鱼群背景：count 取有界值（10）。
      `FishBackdrop` 的 count 没有上限（RETRO R7 待办），调用方负责约束——
      地图是首屏第一视觉，鱼太多会与深度刻度争夺注意力，也拖累低端机合成。
    -->
    <FishBackdrop :count="10" :size="72" class="map-panel__fish" />

    <div class="map-panel__body">
      <DepthScale :completed-quests="completedQuests" />

      <!-- 起点：潜水艇基地（spec §起点为潜水艇基地） -->
      <div class="map-panel__base" data-testid="zone-base">
        <span class="map-panel__base-icon" aria-hidden="true">⚓</span>
        <span class="map-panel__base-name">{{ BASE_ZONE.name }}</span>
      </div>

      <!-- 四区：一条 v-for，不写死四个 div -->
      <ol class="map-panel__zones">
        <li
          v-for="(zone, index) in ZONES"
          :key="zone.id"
          class="map-panel__zone"
          :class="{
            'map-panel__zone--current': index === currentZoneIndex,
            'map-panel__zone--locked': index > currentZoneIndex,
          }"
          :data-testid="`zone-${zone.id}`"
        >
          <span class="map-panel__zone-name">{{ zone.name }}</span>
          <!-- 深度一律区间表述（spec §深度为范围而非定点） -->
          <span class="map-panel__zone-depth">{{ zone.depthLabel }}</span>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
/*
 * 地图主体：上半屏，弹性占满剩余空间。
 * 背景直接用主题的三段渐变（`--ds-bg-gradient`），不另写色值——Task 10 的
 * 儿童可读对比度测试是静态解析 theme.css 的，组件里写死色值会让校验失效。
 */
.map-panel {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--ds-bg-gradient);
}

/* 鱼群层贴在地图背后：absolute 覆盖整块地图 */
.map-panel__fish {
  position: absolute;
  inset: 0;
}

.map-panel__body {
  position: relative;
  display: flex;
  gap: var(--ds-space-md);
  height: 100%;
  padding: var(--ds-space-lg);
}

.map-panel__zones {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-around;
  margin: 0;
  padding: 0;
  list-style: none;
}

.map-panel__zone {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-sm);
  /* 玻璃拟态：任务卡与地图分区共用同一套 token，视觉才是一家人 */
  background: var(--ds-glass-surface);
  color: var(--ds-text-secondary);
}

/* 当前所在区：生物发光描边 + 主文字色 */
.map-panel__zone--current {
  border-color: var(--ds-accent-500);
  color: var(--ds-text-primary);
}

/* 未解锁区域压暗：仍在视野里（给孩子"还有更深"的期待），但明确不可达 */
.map-panel__zone--locked {
  opacity: 0.55;
}

.map-panel__zone-name {
  font-size: var(--ds-font-size-title);
}

.map-panel__zone-depth {
  font-size: var(--ds-font-size-caption);
}

.map-panel__base {
  position: absolute;
  top: var(--ds-space-lg);
  right: var(--ds-space-lg);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-xs) var(--ds-space-md);
  border-radius: var(--ds-radius-pill);
  background: var(--ds-glass-surface);
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
}
</style>
