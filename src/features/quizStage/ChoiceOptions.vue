<script setup lang="ts">
import type { ChoiceOption } from '@/domain/model/types'

defineProps<{ options: readonly ChoiceOption[] }>()
const selected = defineModel<string>({ default: '' })
</script>

<template>
  <div class="choice-options" role="radiogroup" aria-label="选择答案" data-testid="choice-options">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="choice-options__item"
      :class="{ 'choice-options__item--selected': selected === option.id }"
      :aria-checked="selected === option.id"
      role="radio"
      :data-testid="`choice-${option.id}`"
      @click="selected = option.id"
    >
      <span class="choice-options__id">{{ option.id }}</span>
      <span>{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.choice-options { display: grid; gap: 0.75rem; }
.choice-options__item {
  display: flex; align-items: center; gap: 0.75rem;
  min-height: 3rem; padding: 0.75rem 1rem;
  border: 1px solid var(--ds-glass-border, rgba(140, 200, 255, 0.25));
  border-radius: 0.9rem; background: var(--ds-glass-surface, rgba(18, 48, 75, 0.9));
  color: var(--ds-text-primary, #eaf4ff); font: inherit; text-align: left; cursor: pointer;
}
.choice-options__item--selected { border-color: var(--ds-accent-500, #ffb454); background: rgba(255, 180, 84, 0.18); }
.choice-options__id { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 50%; background: rgba(255, 255, 255, 0.1); font-weight: 700; }
</style>
