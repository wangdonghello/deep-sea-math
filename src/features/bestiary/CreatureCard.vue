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
      图鉴卡片一律显示该物种的真实影像。

      卡片此前显示 3D 模型缩略图：家长直接反馈"图鉴的鱼太丑、太抽象"。照片既更好
      认也更省电（4 张实拍共约 200 KB，而 WebGL 缩略图要加载 GLB + 建 context）。
      3D 模型仍保留在观察舱，用"看 3D 模型"按钮切换。
    -->
    <CreatureCanvas :creature="creature" :locked="!unlocked" :thumbnail="true" />
    <h2 v-if="unlocked">{{ creature.name }}</h2>
    <p v-if="unlocked" class="creature-card__zones" data-testid="creature-zones">
      可见于：{{ teachingZones.map((zone) => zone.name).join(' · ') }}
    </p>
    <p v-else>继续下潜解锁</p>
    <button v-if="unlocked" type="button" @click="emit('observe', creature.id)">进入观察舱</button>
  </article>
</template>

<style scoped>
.creature-card { padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: var(--ds-glass-surface); }
.creature-card__zones { margin: var(--ds-space-xs) 0 var(--ds-space-sm); color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); line-height: 1.5; }
.creature-card button { min-height: 2.75rem; }
</style>
