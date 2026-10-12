<script setup lang="ts">
/**
 * 家长区底部导航（总览 / 设置与报告 / 档案管理）。
 *
 * 与孩子的 `TabBar` 同一分工：只认**功能区 id**，不认路由路径——把 id 翻译成
 * `router.push` 是路由封装的事（`features/` 不得依赖 `router/`）。当前页由
 * `active` prop 决定，高亮只做视觉与 `aria-current`，不含任何判断规则。
 */
import type { ParentSection } from './types'

defineProps<{ active: ParentSection }>()
const emit = defineEmits<{ (event: 'navigate', section: ParentSection): void }>()

/** 页签顺序与文案（顺序即导航栏从左到右的顺序）。 */
const SECTIONS: ReadonlyArray<{ id: ParentSection; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'settings', label: '设置与报告' },
  { id: 'manage', label: '档案管理' },
]
</script>

<template>
  <nav class="parent-nav" data-testid="parent-nav" aria-label="家长区导航">
    <button
      v-for="section in SECTIONS"
      :key="section.id"
      type="button"
      class="parent-nav__item"
      :class="{ 'parent-nav__item--active': section.id === active }"
      :aria-current="section.id === active ? 'page' : undefined"
      :data-testid="`parent-nav-${section.id}`"
      @click="emit('navigate', section.id)"
    >
      {{ section.label }}
    </button>
  </nav>
</template>

<style scoped>
/* 底部共享导航：与首页 TabBar 同源的玻璃条，当前页用暖橙描边高亮。
   `margin-top:auto` 把导航顶到视口底（内容短时），内容长时 sticky 吸附在
   视口底部——两种情况都"在心里有底"的位置，不需要滚到页面末尾找。 */
.parent-nav {
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin-top: auto;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-sm);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-glass-surface);
  box-shadow: var(--ds-shadow-card);
}

.parent-nav__item {
  min-width: 0;
  min-height: 2.75rem;
  padding: var(--ds-space-sm);
  border: 1px solid transparent;
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  background: none;
  font: inherit;
  font-size: var(--ds-font-size-caption);
  cursor: pointer;
}

.parent-nav__item--active {
  border-color: var(--ds-accent-500);
  color: var(--ds-accent-text);
  background: var(--ds-accent-gradient);
  font-weight: 600;
}
</style>
