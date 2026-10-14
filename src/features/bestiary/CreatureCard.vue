<script setup lang="ts">
import CreatureCanvas from './CreatureCanvas.vue'
import type { CreatureContent } from '@/data/content/schema'

defineProps<{ creature: CreatureContent; unlocked: boolean }>()
const emit = defineEmits<{ (event: 'observe', creatureId: string): void }>()
</script>

<template>
  <article class="creature-card" :data-testid="`creature-card-${creature.id}`">
    <!--
      图鉴卡片同样用 3D 模型（缩略图模式：单帧、无控制按钮）。

      此前卡片只显示 2D 示意插画，而观察舱用 3D —— 同一物种在两个页面长得不
      一样，孩子会在图鉴里认不出刚在观察舱看过的鱼。改为同一份模型后两边一致；
      缩略图模式关掉持续旋转与交互，是因为列表里同时存在多张卡，每张都跑渲染
      循环会让低端机合成层持续满载。
    -->
    <CreatureCanvas :creature="creature" :locked="!unlocked" :prefer-model="true" :thumbnail="true" />
    <h2 v-if="unlocked">{{ creature.name }}</h2>
    <p v-else>继续下潜解锁</p>
    <button v-if="unlocked" type="button" @click="emit('observe', creature.id)">进入观察舱</button>
  </article>
</template>

<style scoped>
.creature-card { padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: var(--ds-glass-surface); }
.creature-card button { min-height: 2.75rem; }
</style>
