<script setup lang="ts">
import { onMounted } from 'vue'
import FishBackdrop from '@/features/theme/FishBackdrop.vue'
import { useBestiary } from '@/features/bestiary/useBestiary'
import type { BestiaryStore } from '@/features/bestiary/types'
import { BASE_ZONE } from '@/features/home/zones'

const props = defineProps<{ profileId: string; store: BestiaryStore }>()
const map = useBestiary({ profileId: props.profileId, store: props.store })
onMounted(() => map.load())
</script>

<template>
  <main class="map-view" data-testid="map-view">
    <FishBackdrop :count="6" :size="64" />
    <section class="map-view__content">
      <h1>深海地图</h1>
      <div class="map-view__base" data-testid="zone-base" :data-current="map.currentZoneId.value === BASE_ZONE.id">
        <span aria-hidden="true">⚓</span> {{ BASE_ZONE.name }} · 起点 · {{ BASE_ZONE.depthLabel }}
      </div>
      <p v-if="map.error.value" data-testid="map-error" role="status">地图暂时打不开，请稍后再试</p>
      <ol v-if="!map.error.value" class="map-view__zones">
        <li v-for="zone in map.zones.value" :key="zone.id" :data-testid="`zone-${zone.id}`"
          :data-unlocked="zone.unlocked" :data-current="zone.current"
          :class="{ 'map-view__zone--locked': !zone.unlocked, 'map-view__zone--current': zone.current }">
          <h2>{{ zone.name }}</h2>
          <p>{{ zone.depthLabel }}</p>
        </li>
      </ol>
      <p class="map-view__note">这是已知记录/教学区域范围，不是物种唯一分布；物种可能跨区。每种生物的观察记录请查看图鉴说明。</p>
    </section>
  </main>
</template>

<style scoped>
.map-view { position: relative; min-height: 100%; overflow: hidden; background: var(--ds-bg-gradient); color: var(--ds-text-primary); }
.map-view__content { position: relative; padding: var(--ds-space-lg); }
.map-view__base, .map-view__zones li { padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-sm); background: var(--ds-glass-surface); }
.map-view__zones { display: grid; gap: var(--ds-space-md); padding: 0; list-style: none; }
.map-view__zone--locked { opacity: .55; }
.map-view__zone--current { border-color: var(--ds-accent-500); }
.map-view__note { color: var(--ds-text-secondary); }
</style>
