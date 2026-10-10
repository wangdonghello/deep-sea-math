<script setup lang="ts">
import CreatureCanvas from './CreatureCanvas.vue'
import type { CreatureContent } from '@/data/content/schema'

defineProps<{ creature: CreatureContent; unlocked: boolean }>()
const emit = defineEmits<{ (event: 'observe', creatureId: string): void }>()
</script>

<template>
  <article class="creature-card" :data-testid="`creature-card-${creature.id}`">
    <CreatureCanvas :creature="creature" :locked="!unlocked" />
    <h2 v-if="unlocked">{{ creature.name }}</h2>
    <p v-else>继续下潜解锁</p>
    <button v-if="unlocked" type="button" @click="emit('observe', creature.id)">进入观察舱</button>
  </article>
</template>

<style scoped>
.creature-card { padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: var(--ds-glass-surface); }
.creature-card button { min-height: 2.75rem; }
</style>
