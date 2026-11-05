<script setup lang="ts">
/** 首页学科切换：数学 / 语文；英语占位，避免孩子点进空页。 */
export type HomeSubject = 'math' | 'chinese'

defineProps<{ active: HomeSubject }>()
const emit = defineEmits<{ (event: 'change', subject: HomeSubject): void }>()
</script>

<template>
  <nav class="subject-tabs" aria-label="学科">
    <button type="button" data-testid="subject-math" :class="{ 'is-active': active === 'math' }"
      @click="emit('change', 'math')">数学</button>
    <button type="button" data-testid="subject-chinese" :class="{ 'is-active': active === 'chinese' }"
      @click="emit('change', 'chinese')">语文</button>
    <button type="button" disabled data-testid="subject-english">英语 <small>即将上线</small></button>
  </nav>
</template>

<style scoped>
.subject-tabs {
  display: flex; gap: 4px; padding: 4px;
  border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-pill);
  background: rgb(6 20 36 / 70%);
}
.subject-tabs button {
  flex: 1; min-height: 2.2rem; border: 0; border-radius: var(--ds-radius-pill);
  background: transparent; color: var(--ds-text-secondary); font: inherit; font-size: .85rem;
}
.subject-tabs button.is-active { background: rgb(126 220 255 / 16%); color: var(--ds-text-primary); font-weight: 700; }
.subject-tabs button:disabled { opacity: .45; }
.subject-tabs small { font-size: .6rem; }
</style>
