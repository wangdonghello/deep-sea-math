<script setup lang="ts">
import { computed } from 'vue'

import { revealHint } from '@/domain/hint/hintChainSelector'
import type { Question } from '@/domain/model/types'

const props = defineProps<{ question: Question; used: number }>()
const emit = defineEmits<{ reveal: [] }>()
const hints = computed(() => Array.from({ length: Math.min(props.used, 5) }, (_, index) => revealHint(props.question, index)))

function reveal(): void {
  if (props.used < 5) emit('reveal')
}
</script>

<template>
  <section class="hint-stack" aria-label="分层提示">
    <p v-for="hint in hints" :key="hint.layer" data-testid="hint-layer">
      <strong>提示 {{ hint.layer }}：</strong>{{ hint.text }}
    </p>
    <button type="button" data-testid="reveal-hint" :disabled="used >= 5" @click="reveal">
      我需要提示
    </button>
  </section>
</template>
