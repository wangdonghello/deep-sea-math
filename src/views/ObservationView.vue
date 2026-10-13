<script setup lang="ts">
import CreatureCanvas from '@/features/bestiary/CreatureCanvas.vue'
import KnowledgeCardList from '@/features/bestiary/KnowledgeCardList.vue'
import SourceNote from '@/features/bestiary/SourceNote.vue'
import { depthRangeLabel } from '@/features/bestiary/depthRangeLabel'
import type { CreatureContent } from '@/features/bestiary/types'

defineProps<{ creature: CreatureContent }>()
</script>

<template>
  <main class="observation-view" data-testid="observation-view">
    <h1>{{ creature.name }}</h1>
    <p class="observation-view__scientific"><i>{{ creature.scientificName }}</i></p>
    <p>活动深度范围：{{ depthRangeLabel(creature) }}</p>
    <p class="observation-view__note">这是已知记录/教学区域范围，不是唯一分布；物种可能跨区。</p>
    <p>记录/最大体型（来源记录的上限，不是每头个体的恒定值）：{{ creature.bodySize }}</p>
    <CreatureCanvas :creature="creature" :prefer-model="true">
      <KnowledgeCardList :cards="creature.knowledgeCards" />
    </CreatureCanvas>
    <SourceNote :sources="creature.sources" :habitat="creature.habitat" />
  </main>
</template>

<style scoped>
.observation-view { max-width: 48rem; margin: auto; padding: var(--ds-space-lg); color: var(--ds-text-primary); }
.observation-view__scientific { color: var(--ds-text-secondary); }
</style>
