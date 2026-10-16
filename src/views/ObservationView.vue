<script setup lang="ts">
import CreatureCanvas from '@/features/bestiary/CreatureCanvas.vue'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import KnowledgeCardList from '@/features/bestiary/KnowledgeCardList.vue'
import SourceNote from '@/features/bestiary/SourceNote.vue'
import { depthRangeLabel } from '@/features/bestiary/depthRangeLabel'
import type { CreatureContent } from '@/features/bestiary/types'

defineProps<{ creature: CreatureContent }>()
const emit = defineEmits<{ (event: 'back-home'): void }>()
</script>

<template>
  <main class="observation-view" data-testid="observation-view">
    <h1>{{ creature.name }}</h1>
    <p class="observation-view__scientific"><i>{{ creature.scientificName }}</i></p>
    <p>活动深度范围：{{ depthRangeLabel(creature) }}</p>
    <p class="observation-view__note">这是已知记录/教学区域范围，不是唯一分布；物种可能跨区。</p>
    <p>记录/最大体型（来源记录的上限，不是每头个体的恒定值）：{{ creature.bodySize }}</p>
    <CreatureCanvas :creature="creature" :allow-model="true">
      <KnowledgeCardList :cards="creature.knowledgeCards" />
    </CreatureCanvas>
    <SourceNote :sources="creature.sources" :habitat="creature.habitat" />
    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.observation-view { max-width: 48rem; min-height: 100dvh; margin: auto; padding: var(--ds-space-lg) var(--ds-space-lg) calc(5rem + env(safe-area-inset-bottom)); color: var(--ds-text-primary); }
.observation-view__scientific { color: var(--ds-text-secondary); }
</style>
