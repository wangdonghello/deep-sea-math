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
import { computed } from 'vue'

import FishBackdrop from '@/features/theme/FishBackdrop.vue'
import DepthScale from './DepthScale.vue'
import SpaceBackdrop from './SpaceBackdrop.vue'
import DinoBackdrop from './DinoBackdrop.vue'
import { homeThemeById, type HomeTheme } from './homeThemes'
import type { ThemeId } from '@/domain/model/types'
import { DEEP_SEA_STAGES, DEEP_SEA_ZONES, deepSeaStagesByZone } from '@/data/content/deepSeaStages'
import type { DeepSeaProgress } from '@/features/bestiary/deepSeaProgress'

const props = defineProps<{
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
  /** 当前主题；缺省深海（测试与第一版调用兼容）。 */
  themeId?: ThemeId
  /** 由 HomeView 直接传入的主题配置。 */
  theme?: HomeTheme
  /** v3 十关进度；传入时深海地图改为 10 关关卡图（其他主题忽略）。 */
  stageProgress?: DeepSeaProgress
}>()

const theme = computed(() => props.theme ?? homeThemeById(props.themeId ?? 'deep-sea'))
const zones = computed(() => theme.value.zones)
</script>

<template>
  <section class="map-panel" :class="`map-panel--${theme.backdrop}`" :data-theme="theme.id" data-testid="map-panel">
    <!--
      鱼群背景：count 取有界值（10）。
      `FishBackdrop` 的 count 没有上限（RETRO R7 待办），调用方负责约束——
      地图是首屏第一视觉，鱼太多会与深度刻度争夺注意力，也拖累低端机合成。
    -->
    <FishBackdrop v-if="theme.backdrop === 'sea'" :count="10" :size="72" class="map-panel__fish" />
    <SpaceBackdrop v-else-if="theme.backdrop === 'space'" class="map-panel__fish" />
    <DinoBackdrop v-else class="map-panel__fish" />

    <div class="map-panel__body">
      <DepthScale v-if="theme.id === 'deep-sea'" :completed-quests="completedQuests" />
      <div v-else class="map-panel__stage-rail" data-testid="theme-stage-rail">
        <span class="map-panel__stage-label">{{ theme.zoneLabel }}</span>
        <ol>
          <li
            v-for="(zone, index) in zones"
            :key="zone.id"
            :class="{ 'is-current': index === currentZoneIndex, 'is-locked': index > currentZoneIndex }"
          ><span>{{ index + 1 }}</span></li>
        </ol>
      </div>

      <!-- 起点：潜水艇基地（spec §起点为潜水艇基地） -->
      <div class="map-panel__base" data-testid="zone-base">
        <span class="map-panel__base-icon" aria-hidden="true">{{ theme.baseIcon }}</span>
        <span class="map-panel__base-name">{{ theme.baseName }}</span>
      </div>

      <!-- v3 十关：按四个深度区分段，每关 3 条图鉴 -->
      <section
        v-if="theme.id === 'deep-sea' && stageProgress"
        class="map-panel__stages"
        data-testid="deep-sea-stages"
      >
        <p class="map-panel__stage-summary">深海通关 {{ stageProgress.completedStages }} / {{ DEEP_SEA_STAGES.length }}</p>
        <div v-for="zone in DEEP_SEA_ZONES" :key="zone.id" class="map-panel__stage-zone">
          <h3>
            {{ zone.name }}
            <span>{{ zone.depthLabel }}</span>
          </h3>
          <ol>
            <li
              v-for="stage in deepSeaStagesByZone(zone.id)"
              :key="stage.stage"
              class="map-panel__stage"
              :class="{
                'map-panel__stage--done': stage.stage <= stageProgress.completedStages,
                'map-panel__stage--current': stage.stage === stageProgress.currentStage && stage.stage > stageProgress.completedStages,
                'map-panel__stage--locked': stage.stage > stageProgress.completedStages,
              }"
              :data-testid="`stage-${stage.stage}`"
            >
              <span class="map-panel__stage-number">{{ stage.stage }}</span>
              <span class="map-panel__stage-name">{{ stage.name }}</span>
              <span class="map-panel__stage-count">3 条图鉴</span>
            </li>
          </ol>
        </div>
      </section>

      <!-- 四区：一条 v-for，不写死四个 div -->
      <ol v-else class="map-panel__zones">
        <li
          v-for="(zone, index) in zones"
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

.map-panel--space { background: #060a1b; }
.map-panel--dinosaur { background: #3b2a25; }

.map-panel__stage-rail {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--ds-space-sm);
  width: 2.8rem;
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  text-align: center;
}

.map-panel__stage-rail ol { display: grid; gap: var(--ds-space-sm); margin: 0; padding: 0; list-style: none; }
.map-panel__stage-rail li { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; margin: 0 auto; border: 1px solid var(--ds-glass-border); border-radius: 50%; background: var(--ds-glass-surface); }
.map-panel__stage-rail li.is-current { border-color: var(--ds-accent-500); color: var(--ds-accent-text); font-weight: 700; }
.map-panel__stage-rail li.is-locked { opacity: .45; }

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

.map-panel__stages {
  display: grid;
  flex: 1;
  align-content: start;
  gap: var(--ds-space-sm);
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.map-panel__stage-summary { margin: 0; color: var(--ds-accent-text); font-size: var(--ds-font-size-caption); font-weight: 600; }
.map-panel__stage-zone h3 { display: flex; justify-content: space-between; gap: var(--ds-space-sm); margin: 4px 0; color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.map-panel__stage-zone ol { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.map-panel__stage { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr) auto; align-items: center; gap: var(--ds-space-sm); padding: 4px var(--ds-space-sm); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-sm); background: var(--ds-glass-surface); color: var(--ds-text-secondary); }
.map-panel__stage--done { border-color: var(--ds-accent-500); color: var(--ds-text-primary); }
.map-panel__stage--current { border-color: var(--ds-accent-500); color: var(--ds-accent-text); font-weight: 600; }
.map-panel__stage--locked { opacity: .45; }
.map-panel__stage-number { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--ds-glass-surface); font-size: var(--ds-font-size-caption); }
.map-panel__stage-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-panel__stage-count { font-size: var(--ds-font-size-caption); }

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
