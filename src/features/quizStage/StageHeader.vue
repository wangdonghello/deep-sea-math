<script setup lang="ts">
defineProps<{ title: string; position: number; total: number }>()
</script>

<template>
  <header class="stage-header" data-testid="stage-header">
    <p>{{ position }} / {{ total }} 题</p>
    <h1>{{ title }}</h1>
  </header>
</template>

<style scoped>
.stage-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
h1 { margin: 0; font-size: 1.4rem; }
p { color: var(--color-muted, #b5c7df); }
</style>
