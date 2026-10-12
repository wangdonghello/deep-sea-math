<script setup lang="ts">
/**
 * 家长区·家庭总览（P2）。
 *
 * 只做装配：把 `useFamilyOverview` 派生的每个孩子摘要交给 `ChildSummaryCard`
 * 渲染。统计与"需要关注"提示全在 composable 里从事件投影一次算出，本组件不
 * 碰事件。点卡片 emit `open-child`，由路由封装翻译成该孩子的设置/报告页。
 */
import { onMounted } from 'vue'

import ChildSummaryCard from './ChildSummaryCard.vue'
import ParentSectionShell from './ParentSectionShell.vue'
import { useFamilyOverview } from './useFamilyOverview'
import type { ParentSection, ParentStore } from './types'
import type { QuizType } from '@/domain/model/types'

const props = defineProps<{
  store: ParentStore
  clock?: () => number
  questionTypeById?: Readonly<Record<string, QuizType>>
  logger?: (entry: Record<string, unknown>) => void
}>()
const emit = defineEmits<{
  (event: 'open-child', profileId: string): void
  (event: 'navigate', section: ParentSection): void
  (event: 'back'): void
}>()

const overview = useFamilyOverview({
  store: props.store,
  clock: props.clock,
  questionTypeById: props.questionTypeById,
  logger: props.logger,
})

onMounted(() => {
  void overview.load()
})
</script>

<template>
  <ParentSectionShell
    title="家庭总览"
    active="overview"
    :degraded="overview.degraded.value"
    @navigate="emit('navigate', $event)"
    @back="emit('back')"
  >
    <p v-if="overview.loading.value" data-testid="overview-loading">正在汇总…</p>

    <!--
      空态：本机还没有孩子档案。建档入口在档案管理页——这里给一条明确的路，
      而不是一句"暂无数据"让孩子/家长对着空白屏。
    -->
    <section v-else-if="overview.children.value.length === 0" class="overview__empty parent-card" data-testid="overview-empty">
      <p>还没有孩子档案，先去档案管理页添加一个吧。</p>
      <button type="button" class="parent-button" data-testid="overview-goto-manage" @click="emit('navigate', 'manage')">
        去档案管理
      </button>
    </section>

    <ul v-else class="overview__list">
      <li v-for="child in overview.children.value" :key="child.profileId">
        <ChildSummaryCard :child="child" @open="emit('open-child', $event)" />
      </li>
    </ul>

    <p v-if="overview.errorMessage.value" role="alert" data-testid="overview-error">
      {{ overview.errorMessage.value }}
    </p>
  </ParentSectionShell>
</template>

<style scoped>
/* 卡片的玻璃质感来自 ChildSummaryCard 自身；这里只管列表节奏 */
.overview__list,
.overview__empty {
  display: grid;
  gap: var(--ds-space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
