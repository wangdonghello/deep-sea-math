<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CreatureCard from '@/features/bestiary/CreatureCard.vue'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import { overlapsZone } from '@/features/bestiary/zoneFilter'
import { useBestiary } from '@/features/bestiary/useBestiary'
import type { BestiaryStore } from '@/features/bestiary/types'
import { BASE_ZONE, ZONES } from '@/features/home/zones'

const props = defineProps<{ profileId: string | null; store: BestiaryStore }>()
const emit = defineEmits<{
  (event: 'observe', creatureId: string): void
  (event: 'back-home'): void
}>()
const bestiary = useBestiary({ profileId: computed(() => props.profileId), store: props.store })

/**
 * 当前筛选的教学区；`null` 表示「全部」。
 *
 * 默认值不再是「全部」：孩子解锁暮光区后进来只看得到暮光区的记录，解锁深海区
 * 后列表会真的多出深海区物种。此前固定停在「全部」，四个区永远显示同一批卡，
 * 孩子把暮光区和深海区看成"一模一样"。
 */
const activeZoneId = ref<string | null>(null)

/**
 * 默认只应用**一次**（每个档案一次）。
 *
 * 孩子手动点「全部」之后，解锁事件再变化也不该把他踢回某个区——筛选是孩子的
 * 显式选择，默认只是"他还没选时的起点"。档案一换就重新允许应用一次。
 */
let zoneDefaultApplied = false

watch(() => props.profileId, () => {
  zoneDefaultApplied = false
  activeZoneId.value = null
})

watch(() => bestiary.currentZoneId.value, (zoneId) => {
  if (zoneDefaultApplied || zoneId === null) return
  zoneDefaultApplied = true
  // 还没有任何区域解锁（停在潜水艇基地）时退回「全部」：让新档案看到完整的
  // 待解锁剪影，而不是一个空列表。
  activeZoneId.value = zoneId === BASE_ZONE.id ? null : zoneId
})

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
    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.bestiary-view { min-height: 100dvh; padding: var(--ds-space-lg) var(--ds-space-lg) calc(5rem + env(safe-area-inset-bottom)); color: var(--ds-text-primary); }
.bestiary-view__filters { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.bestiary-view__filters button { min-height: 2.75rem; }
.bestiary-view__note { color: var(--ds-text-secondary); }
.bestiary-view__list { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--ds-space-md); padding: 0; list-style: none; }
</style>
