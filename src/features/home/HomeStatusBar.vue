<script setup lang="ts">
/**
 * `features/home/HomeStatusBar.vue` —— 首页顶部的档案与所在区状态条。
 *
 * 回答孩子的三个问题里的前两个：「我是谁」「我在哪」。此前首页只有地图与
 * 任务卡，"当前在哪一区"要孩子自己从四张卡片里找高亮那一张，而"我在几米"
 * 更是完全没有——深度刻度只是装饰，没有与当前状态联动。
 *
 * 本组件不做任何推算：昵称、区名、深度全部由 props 给出（`useHomeQuest` 从
 * 事件投影推导），因此它能在无存储的环境里单独渲染与测试。
 */
import { computed } from 'vue'

import { BASE_ZONE } from './zones'
import { homeThemeById, type HomeTheme } from './homeThemes'
import type { ThemeId } from '@/domain/model/types'

const props = defineProps<{
  /** 当前档案昵称。 */
  nickname: string
  /** 当前所在区域 id；`base` 表示还在起点。 */
  currentZoneId: string
  /** 当前主题；缺省深海（测试与第一版调用兼容）。 */
  themeId?: ThemeId
  /** 由 HomeView 直接传入的主题配置。 */
  theme?: HomeTheme
}>()

const theme = computed(() => props.theme ?? homeThemeById(props.themeId ?? 'deep-sea'))
const avatarIcon = computed(() => theme.value.backdrop === 'space' ? '🚀' : theme.value.backdrop === 'dinosaur' ? '🦴' : '🤿')

/** 当前所在区域的展示名；未知 id 回退为起点名（绝不渲染空白）。 */
const zoneName = computed(() =>
  props.currentZoneId === BASE_ZONE.id
    ? theme.value.baseName
    : theme.value.zones.find((zone) => zone.id === props.currentZoneId)?.name ?? theme.value.baseName,
)

/** 当前所在区域的深度文案；在基地时用起点的「海面 · 0 米」。 */
const zoneDepth = computed(() => {
  if (props.currentZoneId === BASE_ZONE.id) {
    return theme.value.id === 'deep-sea' ? BASE_ZONE.depthLabel : '准备出发'
  }
  return theme.value.zones.find((zone) => zone.id === props.currentZoneId)?.depthLabel ?? ''
})

</script>

<template>
  <header class="home-status" data-testid="home-status">
    <div class="home-status__profile">
      <span class="home-status__avatar" aria-hidden="true">{{ avatarIcon }}</span>
      <span class="home-status__nickname">{{ nickname }}</span>
    </div>
    <div class="home-status__zone">
      <span class="home-status__zone-name" data-testid="home-status-zone">{{ zoneName }}</span>
      <span class="home-status__zone-depth">{{ zoneDepth }}</span>
    </div>
  </header>
</template>

<style scoped>
.home-status {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  padding: var(--ds-space-sm) var(--ds-space-lg);
}

.home-status__profile {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  min-width: 0;
}

.home-status__avatar {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-pill);
  background: var(--ds-glass-surface);
  font-size: var(--ds-font-size-title);
}

.home-status__nickname {
  color: var(--ds-text-primary);
  font-weight: 600;
  /* 长昵称（家长测试过 24 字）在状态条里必须截断而不是把布局顶破 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-status__zone {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.home-status__zone-name {
  color: var(--ds-accent-text);
  font-weight: 600;
}

.home-status__zone-depth {
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}
</style>
