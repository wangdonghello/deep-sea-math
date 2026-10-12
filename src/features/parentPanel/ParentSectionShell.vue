<script setup lang="ts">
/**
 * 家长区三页共享的外壳：标题 + 本机隐私说明 + 降级警示条 + 内容槽 + 底部导航。
 *
 * 三页顶部与底部完全一致（信息架构要求），抽成外壳只写一次——复制三份的
 * 代价是"降级警示条"这种必须处处可见的东西，漏改一页就很难被测试发现。
 */
import ParentSectionNav from './ParentSectionNav.vue'
import type { ParentSection } from './types'

/**
 * 家长区共享的表单/卡片外观（P3）。
 *
 * P2 删除 `views/ParentView.vue` 后表单样式一并消失，输入框退化成浏览器
 * 默认控件。样式收在 `styles/parentForms.css`，以 `.parent-section` 为作用域，
 * 由本外壳引入一次——三页与全部子组件都在 `.parent-section` 之内，因此必然
 * 共享，不依赖各页记得带上。
 */
import '@/styles/parentForms.css'

defineProps<{
  title: string
  /** 当前功能区（底部导航高亮）。 */
  active: ParentSection
  /** 存储是否处于降级（本机暂存）态。 */
  degraded: boolean
}>()
const emit = defineEmits<{
  (event: 'navigate', section: ParentSection): void
  (event: 'back'): void
}>()
</script>

<template>
  <main class="parent-section" :data-testid="`parent-${active}`">
    <button type="button" class="parent-section__back" data-testid="parent-back" @click="emit('back')">
      返回档案选择
    </button>

    <header class="parent-section__header">
      <h1 class="parent-section__title">{{ title }}</h1>
      <p class="parent-section__privacy">本区仅在本机管理，不收集真实姓名、学校、联系方式或位置。</p>
    </header>

    <!--
      降级警示条：存储不可用时进度不会被保留，家长必须立刻知道。三页共用这份
      外壳，警示条因此必然处处可见（不依赖各页各自记得渲染）。
    -->
    <p v-if="degraded" class="parent-section__warning" data-testid="storage-warning" role="status">
      当前使用本机暂存，刷新后数据不会保留。请退出隐私模式并重新打开应用。
    </p>

    <slot />

    <ParentSectionNav :active="active" @navigate="emit('navigate', $event)" />
  </main>
</template>

<style scoped>
.parent-section {
  position: relative;
  /* 纵向 flex：底部导航用 margin-top:auto 顶到视口底，内容长时可滚动 */
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
  max-width: 48rem;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  padding: var(--ds-space-xl) var(--ds-space-lg);
  color: var(--ds-text-primary);
}

/* flex 子项默认 min-width:auto，长昵称会把卡片顶宽；此处显式归零，
   而不是给根节点加 `overflow-x: hidden`——后者会把根节点变成滚动容器，
   底部导航的 `position: sticky` 随之失效。 */
.parent-section > * {
  min-width: 0;
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

.parent-section__header {
  display: grid;
  gap: var(--ds-space-xs);
}

.parent-section__privacy {
  color: var(--ds-text-secondary);
}

.parent-section__warning {
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-accent-500);
  border-radius: var(--ds-radius-md);
  background: var(--ds-glass-surface);
}
</style>
