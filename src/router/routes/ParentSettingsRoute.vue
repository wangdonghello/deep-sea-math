<script setup lang="ts">
/**
 * 家长区·设置的路由封装（P1 占位）。
 *
 * P2 会把 T16 的 `SettingsForm` / `ReportPanel` 装进来（题量、时长上限与学习
 * 报告）。P1 只保证这条路径可达、且未解锁时会被守卫拦回门禁页。
 */
import { useRouter } from 'vue-router'

import { PROFILES_PATH } from '@/router/nextRoute'

const router = useRouter()
</script>

<template>
  <main class="parent-section" data-testid="parent-settings">
    <h1 class="parent-section__title">家长区 · 设置</h1>
    <p class="parent-section__hint">每日题量、时长上限与学习报告将在这里调整。</p>
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
