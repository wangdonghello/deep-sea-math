<script setup lang="ts">
defineProps<{ cards: readonly string[] }>()
</script>

<template>
  <ul class="knowledge-cards" data-testid="knowledge-card-list">
    <li v-for="(card, index) in cards" :key="`${index}-${card}`" data-testid="knowledge-card">{{ card }}</li>
  </ul>
</template>

<style scoped>
.knowledge-cards { display: grid; gap: var(--ds-space-sm); padding: 0; list-style: none; }
.knowledge-cards li { padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-sm); background: var(--ds-glass-surface); }
</style>
