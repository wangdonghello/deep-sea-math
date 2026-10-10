<script setup lang="ts">
import { computed, ref } from 'vue'
import CreatureCard from '@/features/bestiary/CreatureCard.vue'
import { overlapsZone } from '@/features/bestiary/zoneFilter'
import { useBestiary } from '@/features/bestiary/useBestiary'
import type { BestiaryStore } from '@/features/bestiary/types'
import { ZONES } from '@/features/home/zones'

const props = defineProps<{ profileId: string | null; store: BestiaryStore }>()
const emit = defineEmits<{ (event: 'observe', creatureId: string): void }>()
const bestiary = useBestiary({ profileId: computed(() => props.profileId), store: props.store })
const activeZoneId = ref<string | null>(null)
const visibleItems = computed(() => bestiary.items.value.filter(({ creature }) => {
  const zone = ZONES.find((entry) => entry.id === activeZoneId.value)
  return zone === undefined || overlapsZone(creature, zone)
}))
</script>

<template>
  <main class="bestiary-view" data-testid="bestiary-view">
    <h1>深海生物图鉴</h1>
    <nav class="bestiary-view__filters" aria-label="按教学区域筛选">
      <button type="button" :aria-pressed="activeZoneId === null" aria-label="筛选全部区域"
        @click="activeZoneId = null">全部</button>
      <button v-for="zone in ZONES" :key="zone.id" type="button"
        :aria-pressed="activeZoneId === zone.id" :aria-label="`筛选${zone.name}`"
        @click="activeZoneId = zone.id">{{ zone.name }}</button>
    </nav>
    <p class="bestiary-view__note">教学区域筛选，不代表唯一栖息区归属；物种可能跨区。</p>
    <p v-if="bestiary.loading.value" role="status">正在读取图鉴…</p>
    <p v-else-if="bestiary.error.value" data-testid="bestiary-error" role="status">图鉴暂时打不开，请稍后再试</p>
    <p v-else-if="bestiary.items.value.length === 0">还没有可查看的生物</p>
    <p v-else-if="visibleItems.length === 0">这个教学区域暂无对应记录</p>
    <ul v-else class="bestiary-view__list">
      <li v-for="item in visibleItems" :key="item.creature.id">
        <CreatureCard :creature="item.creature" :unlocked="item.unlocked" @observe="emit('observe', $event)" />
      </li>
    </ul>
  </main>
</template>

<style scoped>
.bestiary-view { padding: var(--ds-space-lg); color: var(--ds-text-primary); }
.bestiary-view__filters { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.bestiary-view__filters button { min-height: 2.75rem; }
.bestiary-view__note { color: var(--ds-text-secondary); }
.bestiary-view__list { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--ds-space-md); padding: 0; list-style: none; }
</style>
