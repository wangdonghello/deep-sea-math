<script setup lang="ts">
import { computed } from 'vue'
import CreatureCanvas from './CreatureCanvas.vue'
import type { CreatureContent } from '@/data/content/schema'
import { overlapsZone } from './zoneFilter'
import { ZONES } from '@/features/home/zones'

const props = defineProps<{ creature: CreatureContent; unlocked: boolean }>()
const emit = defineEmits<{ (event: 'observe', creatureId: string): void }>()
const teachingZones = computed(() => ZONES.filter((zone) => overlapsZone(props.creature, zone)))
</script>

<template>
  <article class="creature-card" :data-testid="`creature-card-${creature.id}`">
    <!--
      图鉴卡片：有授权 3D 模型的物种默认展示模型（家长明确要求图鉴里先看到 3D），
      没有模型时展示该物种的真实影像；两种视觉都可一键切换到影像/模型。

      影像仍是每个物种的必备素材：它负责"这是什么鱼"的快速识别，也是 WebGL
      不可用、模型加载失败时的兜底。
    -->
    <CreatureCanvas :creature="creature" :locked="!unlocked" :thumbnail="true"
      allow-model prefer-model />
    <h2 v-if="unlocked">{{ creature.name }}</h2>
    <p v-if="unlocked" class="creature-card__zones" data-testid="creature-zones">
      可见于：{{ teachingZones.map((zone) => zone.name).join(' · ') }}
    </p>
    <p v-else>继续下潜解锁</p>
    <button v-if="unlocked" type="button" data-testid="creature-observe"
      @click="emit('observe', creature.id)">进入观察舱</button>
  </article>
</template>

<style scoped>
.creature-card { padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: var(--ds-glass-surface); }
.creature-card__zones { margin: var(--ds-space-xs) 0 var(--ds-space-sm); color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); line-height: 1.5; }
.creature-card button { min-height: 2.75rem; }
</style>
