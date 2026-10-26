<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CreatureCard from '@/features/bestiary/CreatureCard.vue'
import MistakeRewardStrip from '@/features/mistakeBook/MistakeRewardStrip.vue'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import { belongsToZone, zonesForCreature } from '@/features/bestiary/zoneFilter'
import { useBestiary } from '@/features/bestiary/useBestiary'
import { useDeepSeaProgress } from '@/features/bestiary/useDeepSeaProgress'
import { DEEP_SEA_STAGES, deepSeaStageById } from '@/data/content/deepSeaStages'
import type { BestiaryStore } from '@/features/bestiary/types'
import { ZONES } from '@/features/home/zones'

const props = defineProps<{
  profileId: string | null
  store: BestiaryStore
  /** 是否显示 v3 十关筛选；默认关闭以兼容旧测试/页面。 */
  showStages?: boolean
}>()
const emit = defineEmits<{
  (event: 'observe', creatureId: string): void
  (event: 'back-home'): void
}>()
const bestiary = useBestiary({ profileId: computed(() => props.profileId), store: props.store })
const { progress: stageProgress } = useDeepSeaProgress({
  store: props.store,
  profileId: computed(() => props.profileId),
})

/**
 * 当前筛选的教学区；`null` 表示「全部」。
 *
 * 默认值不再是「全部」：孩子解锁暮光区后进来只看得到暮光区的记录，解锁深海区
 * 后列表会真的多出深海区物种。此前固定停在「全部」，四个区永远显示同一批卡，
 * 孩子把暮光区和深海区看成"一模一样"。
 */
const activeZoneId = ref<string | null>(null)
const activeStage = ref<number | null>(null)
/** 孩子手动点过关卡后，进度刷新不再自动改他的选择。 */
const stageTouched = ref(false)

watch(stageProgress, (progress) => {
  if (!props.showStages || stageTouched.value) return
  activeStage.value = progress.unlockedStages.at(-1)?.stage ?? 1
}, { immediate: true })

function selectZone(zoneId: string): void {
  activeZoneId.value = zoneId
  activeStage.value = null
}

function selectStage(stage: number): void {
  activeStage.value = stage
  activeZoneId.value = null
  stageTouched.value = true
}

/** 当前已解锁的区域 id；区域按钮只有解锁后才可筛选。 */
const unlockedZoneIds = computed(() => new Set([
  ...bestiary.zones.value.filter((zone) => zone.unlocked).map((zone) => zone.id),
  ...(props.showStages ? stageProgress.value.unlockedZoneIds : []),
]))
const unlockedZones = computed(() => ZONES.filter((zone) => unlockedZoneIds.value.has(zone.id)))
const unlockedZoneNames = computed(() => unlockedZones.value.map((zone) => zone.name).join('、'))

watch(() => props.profileId, () => {
  activeZoneId.value = null
})

// 已选区域若因事件变化变为未解锁，回到「全部已解锁」而不是显示空列表。
watch(() => bestiary.zones.value, () => {
  if (activeZoneId.value !== null && !unlockedZoneIds.value.has(activeZoneId.value)) {
    activeZoneId.value = null
  }
}, { deep: true })

const visibleItems = computed(() => {
  const items = bestiary.items.value
  const selected = ZONES.find((zone) => zone.id === activeZoneId.value)
  if (selected !== undefined) {
    return items.filter(({ creature }) => belongsToZone(creature, selected))
  }
  if (props.showStages && activeStage.value !== null) {
    const stage = deepSeaStageById(activeStage.value)
    if (stage === undefined) return []
    return items.filter(({ creature }) => stage.creatureIds.includes(creature.id))
  }
  // 「全部」= 所有已解锁区域的并集；新档案还没有解锁时展示全量剪影，
  // 让孩子知道图鉴里还有哪些目标。
  if (unlockedZoneIds.value.size === 0) return items
  return items.filter(({ creature }) =>
    zonesForCreature(creature).some((zone) => unlockedZoneIds.value.has(zone.id)),
  )
})
</script>

<template>
  <main class="bestiary-view" data-testid="bestiary-view">
    <h1>深海生物图鉴</h1>
    <MistakeRewardStrip :profile-id="profileId" :store="store" />
    <nav v-if="showStages" class="bestiary-view__stages" aria-label="按关卡筛选">
      <button
        v-for="stage in DEEP_SEA_STAGES"
        :key="stage.stage"
        type="button"
        :data-testid="`stage-tab-${stage.stage}`"
        :aria-pressed="activeStage === stage.stage"
        :disabled="stage.stage > stageProgress.completedStages"
        :class="{ 'is-current': stage.stage === stageProgress.currentStage }"
        @click="selectStage(stage.stage)"
      >{{ stage.stage }} · {{ stage.name }}</button>
    </nav>
    <nav class="bestiary-view__filters" aria-label="按教学区域筛选">
      <button type="button" :aria-pressed="activeZoneId === null && activeStage === null" aria-label="筛选全部区域"
        @click="activeZoneId = null; activeStage = null; stageTouched = true">全部</button>
      <button v-for="zone in ZONES" :key="zone.id" type="button"
        :aria-pressed="activeZoneId === zone.id" :aria-label="`筛选${zone.name}`"
        :disabled="!unlockedZoneIds.has(zone.id)"
        @click="selectZone(zone.id)">{{ zone.name }}</button>
    </nav>
    <p v-if="unlockedZones.length > 0" class="bestiary-view__unlocked" data-testid="bestiary-unlocked-zones">
      已解锁：{{ unlockedZoneNames }}
    </p>
    <p v-else class="bestiary-view__note">还没有解锁区域，完成一组题后就能看到更多海域。</p>
    <p class="bestiary-view__note">教学区域筛选，不代表唯一栖息区归属；物种可能跨区。</p>
    <p v-if="showStages && activeStage !== null && deepSeaStageById(activeStage)" class="bestiary-view__stage-label" data-testid="active-stage">
      第 {{ activeStage }} 关 · {{ deepSeaStageById(activeStage)?.name }}
    </p>
    <p v-if="bestiary.loading.value" role="status">正在读取图鉴…</p>
    <p v-else-if="bestiary.error.value" data-testid="bestiary-error" role="status">图鉴暂时打不开，请稍后再试</p>
    <p v-else-if="bestiary.items.value.length === 0">还没有可查看的生物</p>
    <p v-else-if="visibleItems.length === 0">这个教学区域暂无对应记录</p>
    <ul v-else class="bestiary-view__list">
      <li v-for="item in visibleItems" :key="item.creature.id">
        <CreatureCard :creature="item.creature" :unlocked="item.unlocked"
          :unlocked-zone-ids="unlockedZoneIds.size === 0 ? undefined : [...unlockedZoneIds]" @observe="emit('observe', $event)" />
      </li>
    </ul>
    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.bestiary-view { min-height: 100dvh; padding: var(--ds-space-lg) var(--ds-space-lg) calc(5rem + env(safe-area-inset-bottom)); color: var(--ds-text-primary); }
.bestiary-view__filters { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.bestiary-view__filters button { min-height: 2.75rem; }
.bestiary-view__stages { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.bestiary-view__stages button { flex: none; min-height: 2.5rem; padding: 0 10px; font-size: var(--ds-font-size-caption); }
.bestiary-view__stages button.is-current { border-color: var(--ds-accent-500); color: var(--ds-accent-text); }
.bestiary-view__stage-label { margin: 0; font-weight: 600; }
.bestiary-view__unlocked { color: var(--ds-accent-text); font-weight: 600; }
.bestiary-view__note { color: var(--ds-text-secondary); }
.bestiary-view__filters button:disabled { opacity: .42; cursor: not-allowed; }
.bestiary-view__list { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--ds-space-md); padding: 0; list-style: none; }
</style>
