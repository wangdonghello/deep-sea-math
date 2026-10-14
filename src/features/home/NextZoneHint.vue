<script setup lang="ts">
/**
 * `features/home/NextZoneHint.vue` —— 下一区推进提示。
 *
 * 回答「我还差多少」。此前四区地图只标出当前所在，孩子看完不知道"再做完几组
 * 题能去更深的地方"——下潜的动力因此只剩任务卡上的"开始下潜"，与深度这条
 * 主线脱钩。
 *
 * 提示语取**下一个尚未解锁的区域**（`resolveZoneProgress().nextZoneId`）,
 * 不自己算"还差几组"：完成一组解锁一区是 spec §完成题组推进深度的口径，
 * 而这个口径的唯一出处是 `zoneProgress`。四区全解锁时组件不渲染。
 */
import { computed } from 'vue'

import { ZONES } from './zones'

const props = defineProps<{
  /** 下一个待解锁区域 id；`undefined` 表示四区已全部解锁。 */
  nextZoneId: string | undefined
}>()

const nextZone = computed(() => ZONES.find((zone) => zone.id === props.nextZoneId))
</script>

<template>
  <p v-if="nextZone" class="next-zone-hint" data-testid="home-next-zone">
    再完成一组题组，就能下潜到<strong>{{ nextZone.name }}</strong>（{{ nextZone.depthLabel }}）
  </p>
</template>

<style scoped>
.next-zone-hint {
  position: relative;
  z-index: 1;
  margin: 0 var(--ds-space-lg) var(--ds-space-sm);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glow-primary);
  border-radius: var(--ds-radius-md);
  background: var(--ds-glass-surface);
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  line-height: 1.6;
}

.next-zone-hint strong {
  color: var(--ds-accent-text);
}
</style>
