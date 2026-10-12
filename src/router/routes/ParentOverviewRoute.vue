<script setup lang="ts">
/**
 * 家长区·总览的路由封装（P1 占位）。
 *
 * P1 只搭"三区"路由骨架与门禁管道，页面内容留到 P2：真正的总览（学习报告、
 * 掌握分布）会替换下面这段极简占位。占位刻意带 `data-testid`，让 P2 的替换
 * 与测试都有一处稳定的锚点。
 *
 * "返回档案选择页"是本页唯一的动作：家长区不参与孩子的常驻导航，退出即回到
 * 档案选择。
 */
import { useRouter } from 'vue-router'

import { PROFILES_PATH } from '@/router/nextRoute'

const router = useRouter()
</script>

<template>
  <main class="parent-section" data-testid="parent-overview">
    <h1 class="parent-section__title">家长区 · 总览</h1>
    <p class="parent-section__hint">孩子的学习进度与掌握情况将在这里汇总。</p>
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
