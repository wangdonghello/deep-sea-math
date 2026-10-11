<script setup lang="ts">
/**
 * 底部标签栏（design §4 `HomeView` 的组成组件之四）。
 *
 * 只做**导航占位**：三个页签（首页 / 图鉴 / 错题本）在当前阶段只有
 * 首页真实可达，其余点按只上报 `navigate` 事件——路由表与守卫属于 Task 17，
 * 这里不 import `vue-router`，也不自己 `router.push`。
 *
 * 顺序按 design §4 的视图清单排：Home → Bestiary → MistakeBook。
 *
 * **家长区不在这里**：`/parent` 不带任何身份验证（`views/ParentView.vue`
 * 自己写明"不包含家长身份验证"），孩子点一下就能改题量、重置 PIN、删档案。
 * 因此唯一入口是档案选择页页脚那一行小字（`routes/ProfilesRoute.vue`）——
 * 找得到，但不出现在孩子的常驻导航里。
 */
/** 孩子可自主到达的页签 id（家长区不在其中，见上方说明）。 */
export type ChildTabId = 'home' | 'bestiary' | 'mistake'

const TABS: readonly { readonly id: ChildTabId; readonly label: string; readonly icon: string }[] = [
  { id: 'home', label: '首页', icon: '⚓' },
  { id: 'bestiary', label: '图鉴', icon: '🐟' },
  { id: 'mistake', label: '错题本', icon: '📖' },
]

defineProps<{
  /** 当前所在页签 id；仅用于高亮。 */
  active: ChildTabId
}>()

const emit = defineEmits<{
  /** 点按某页签；载荷为页签 id（Task 17 的守卫据此放行或打回档案选择）。 */
  (event: 'navigate', tabId: ChildTabId): void
}>()
</script>

<template>
  <nav class="tab-bar" data-testid="tab-bar" aria-label="主导航">
    <button
      v-for="tab in TABS"
      :key="tab.id"
      type="button"
      class="tab-bar__item"
      :class="{ 'tab-bar__item--active': tab.id === active }"
      :data-testid="`tab-${tab.id}`"
      :aria-current="tab.id === active ? 'page' : undefined"
      @click="emit('navigate', tab.id)"
    >
      <span class="tab-bar__icon" aria-hidden="true">{{ tab.icon }}</span>
      <span class="tab-bar__label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tab-bar {
  position: relative;
  z-index: 1;
  display: flex;
  /* 玻璃底 + 上描边：常驻但不抢地图主体 */
  border-top: 1px solid var(--ds-glass-border);
  background: var(--ds-glass-surface);
}

.tab-bar__item {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-sm) 0 var(--ds-space-md);
  border: none;
  background: none;
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
  cursor: pointer;
}

.tab-bar__icon {
  font-size: var(--ds-font-size-title);
  line-height: 1;
}

.tab-bar__item--active {
  color: var(--ds-accent-text);
}
</style>
