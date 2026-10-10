<script setup lang="ts">
defineProps<{ sources: readonly string[]; habitat: string }>()
</script>

<template>
  <aside class="source-note" data-testid="source-note">
    <p>{{ habitat }}</p>
    <h3>资料来源</h3>
    <ul>
      <li v-for="source in sources" :key="source">
        <a :href="source" target="_blank" rel="noreferrer">{{ source }}</a>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.source-note { overflow-wrap: anywhere; color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.source-note a { color: var(--ds-glow-primary); }
</style>
