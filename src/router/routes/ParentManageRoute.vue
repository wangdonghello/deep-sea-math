<script setup lang="ts">
/**
 * 家长区·档案管理的路由封装（P1 占位）。
 *
 * P2 会把建档表单、PIN 重置与删除档案（T16 的 `DangerZone` 等）装进来。首次
 * 安装没有档案时，这条路径仍然可达（`PROFILE_OPTIONAL_PATHS` 收了它，见
 * `router/nextRoute.ts`）——建档正是发生在"还没有档案"的前提下。
 */
import { useRouter } from 'vue-router'

import { PROFILES_PATH } from '@/router/nextRoute'

const router = useRouter()
</script>

<template>
  <main class="parent-section" data-testid="parent-manage">
    <h1 class="parent-section__title">家长区 · 档案管理</h1>
    <p class="parent-section__hint">新建孩子档案、重置 PIN 与删除档案将在这里进行。</p>
    <button
      type="button"
      class="parent-section__back"
      data-testid="parent-back"
      @click="router.push(PROFILES_PATH)"
    >
      返回档案选择
    </button>
  </main>
</template>

<style scoped>
.parent-section {
  display: grid;
  gap: var(--ds-space-lg);
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--ds-space-lg);
  color: var(--ds-text-primary);
}
.parent-section__hint {
  color: var(--ds-text-secondary);
}
.parent-section__back {
  justify-self: start;
  min-height: 2.75rem;
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  background: var(--ds-glass-surface);
  font: inherit;
}
</style>
