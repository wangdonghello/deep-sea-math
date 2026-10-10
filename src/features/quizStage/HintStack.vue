<script setup lang="ts">
import type { RevealedHint } from '@/domain/hint/hintChainSelector'

defineProps<{ hints: readonly RevealedHint[]; used: number }>()
const emit = defineEmits<{ reveal: [] }>()
</script>

<template>
  <section class="hint-stack" aria-label="分层提示">
    <p v-for="hint in hints" :key="hint.layer" data-testid="hint-layer">
      <strong>提示 {{ hint.layer }}：</strong>{{ hint.text }}
    </p>
    <button type="button" data-testid="reveal-hint" :disabled="used >= 5" @click="emit('reveal')">
      我需要提示
    </button>
  </section>
</template>
