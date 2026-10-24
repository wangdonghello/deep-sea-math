<script setup lang="ts">
/**
 * 错题练习奖励条：在深海图鉴 / 主题图鉴顶部展示错题星、修复徽章与图鉴装饰。
 *
 * 数据直接重放该档案的事件（与错题本同一投影口径），不额外落任何奖励状态。
 */
import { computed, ref, watch } from 'vue'

import { replayProjections } from '@/domain/eventLog/replay'
import type { DomainEvent } from '@/domain/model/types'
import { rewardLabel } from './rewardLabels'

const props = defineProps<{
  profileId: string | null
  store: { listEvents(profileId: string): Promise<readonly DomainEvent[]> }
}>()

const events = ref<readonly DomainEvent[]>([])
const loading = ref(false)

async function load(profileId: string | null): Promise<void> {
  if (profileId === null) {
    events.value = []
    return
  }
  loading.value = true
  try {
    events.value = await props.store.listEvents(profileId)
  } catch {
    events.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.profileId, (profileId) => { void load(profileId) }, { immediate: true })

const progress = computed(() => replayProjections(events.value, {
  profileId: props.profileId ?? undefined,
}).practiceProgress)

const chips = computed(() => [...progress.value.badgeIds, ...progress.value.decorationIds])
</script>

<template>
  <p v-if="!loading && progress.stars > 0" class="mistake-reward-strip" data-testid="mistake-reward-strip">
    错题星 {{ progress.stars }} · 已修复 {{ progress.fixedQuestionIds.length }} 道
    <span v-for="chip in chips" :key="chip" class="mistake-reward-strip__chip">{{ rewardLabel(chip) }}</span>
  </p>
</template>

<style scoped>
.mistake-reward-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ds-accent-text);
  font-size: var(--ds-font-size-caption);
  font-weight: 600;
}
.mistake-reward-strip__chip {
  padding: 2px 8px;
  border: 1px solid var(--ds-accent-500);
  border-radius: 999px;
  font-weight: 500;
}
</style>
