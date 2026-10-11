<script setup lang="ts">
import type { FiveStep, FiveStepType } from '@/domain/model/types'

defineProps<{
  steps: readonly FiveStep[]
  current: FiveStepType
  completed: readonly FiveStepType[]
}>()
const emit = defineEmits<{ revisit: [step: FiveStepType] }>()
</script>

<template>
  <nav class="five-step-bar" data-testid="five-step-bar" aria-label="解题步骤">
    <button
      v-for="step in steps"
      :key="step.type"
      type="button"
      :data-current-step="current === step.type ? step.type : undefined"
      :aria-current="current === step.type ? 'step' : undefined"
      :disabled="!completed.includes(step.type)"
      :class="{ completed: completed.includes(step.type), current: current === step.type }"
      @click="emit('revisit', step.type)"
    >
      {{ step.prompt }}
    </button>
  </nav>
</template>

<style scoped>
.five-step-bar { display: flex; flex-wrap: wrap; gap: .5rem; }
.five-step-bar button { border: 1px solid var(--color-border, #547393); border-radius: 2rem; padding: .55rem .8rem; color: var(--color-text, #fff); background: transparent; }
.five-step-bar button.current { border-color: var(--color-accent, #ffb454); background: #463b3a; }
.five-step-bar button.completed { opacity: .58; }
</style>
