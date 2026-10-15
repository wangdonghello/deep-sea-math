<script setup lang="ts">
/** Shared fixed bottom return action for secondary pages. */
withDefaults(defineProps<{
  label?: string
  testId?: string
}>(), { label: '返回首页', testId: 'page-return-home' })

const emit = defineEmits<{ (event: 'back'): void }>()
</script>

<template>
  <button type="button" class="bottom-return-button" :data-testid="testId" @click="emit('back')">
    <span aria-hidden="true">←</span>
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.bottom-return-button {
  position: fixed;
  z-index: 100;
  isolation: isolate;
  left: 50%;
  bottom: calc(var(--ds-space-sm) + env(safe-area-inset-bottom, 0px));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-sm);
  width: min(calc(100% - 2rem), 28rem);
  min-height: 3.25rem;
  padding: 0 var(--ds-space-lg);
  transform: translateX(-50%);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-pill);
  background: linear-gradient(120deg, rgb(19 51 78 / 97%), rgb(8 27 49 / 97%));
  box-shadow: 0 6px 22px rgb(0 0 0 / 38%);
  color: var(--ds-text-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(14px);
}
.bottom-return-button::before {
  content: '';
  position: fixed;
  z-index: -1;
  left: 50%;
  bottom: calc(-1 * (var(--ds-space-sm) + env(safe-area-inset-bottom, 0px)));
  width: 100vw;
  height: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgb(6 21 48 / 0%), rgb(6 21 48 / 94%) 38%);
  pointer-events: none;
}
.bottom-return-button > span:first-child { color: var(--ds-glow-primary); font-size: 1.2rem; }
.bottom-return-button:focus-visible { outline: 3px solid var(--ds-glow-primary); outline-offset: 3px; }
.bottom-return-button:active { transform: translateX(-50%) scale(.98); }
</style>
