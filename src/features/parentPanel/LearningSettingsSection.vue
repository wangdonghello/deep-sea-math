<script setup lang="ts">
/**
 * 家长区·学习设置与报告（P2）。
 *
 * 装配 `useParentPanel` 的三块能力：顶部切换孩子、`SettingsForm`（题量/时长）、
 * `ReportPanel`（当日/近 7 天统计与题型掌握分布）。业务规则（校验、落库、重放）
 * 全在 composable 里，本组件只把状态接上、把事件转回方法调用。
 *
 * 切换孩子后 `SettingsForm` / `ReportPanel` 跟着换人：`selectProfile` 会重读
 * 该孩子的设置与事件，因此两个子组件拿到的都是新孩子的数据（不会串台）。
 */
import { onMounted } from 'vue'

import ReportPanel from './ReportPanel.vue'
import SettingsForm from './SettingsForm.vue'
import ParentSectionShell from './ParentSectionShell.vue'
import { useParentPanel } from './useParentPanel'
import type { ParentSection, ParentStore } from './types'
import type { QuizType } from '@/domain/model/types'

const props = defineProps<{
  store: ParentStore
  /** 默认选中的孩子（当前登录档案或总览点进来的孩子）；可为 null。 */
  defaultProfileId?: string | null
  clock?: () => number
  questionTypeById?: Readonly<Record<string, QuizType>>
  logger?: (entry: Record<string, unknown>) => void
}>()
const emit = defineEmits<{
  (event: 'navigate', section: ParentSection): void
  (event: 'back'): void
}>()

const panel = useParentPanel({
  store: props.store,
  profileId: props.defaultProfileId ?? null,
  clock: props.clock,
  questionTypeById: props.questionTypeById,
  logger: props.logger,
})

function onChangeChild(event: Event): void {
  void panel.selectProfile((event.target as HTMLSelectElement).value)
}

function onPeriod(value: 'today' | '7days'): void {
  panel.reportPeriod.value = value
  void panel.refreshReport()
}

onMounted(() => {
  void panel.load()
})
</script>

<template>
  <ParentSectionShell
    title="学习设置与报告"
    active="settings"
    :degraded="panel.degraded.value"
    @navigate="emit('navigate', $event)"
    @back="emit('back')"
  >
    <p v-if="panel.errorMessage.value" role="alert" data-testid="settings-error">{{ panel.errorMessage.value }}</p>
    <p v-if="panel.successMessage.value" role="status" data-testid="settings-success">{{ panel.successMessage.value }}</p>

    <section v-if="panel.profiles.value.length === 0" data-testid="settings-empty">
      <p>还没有孩子档案，先去档案管理页添加一个吧。</p>
      <button type="button" data-testid="settings-goto-manage" @click="emit('navigate', 'manage')">去档案管理</button>
    </section>

    <template v-else>
      <label class="settings__picker">
        选择孩子
        <select
          data-testid="settings-child-select"
          :value="panel.selectedProfileId.value ?? ''"
          @change="onChangeChild"
        >
          <option v-for="profile in panel.profiles.value" :key="profile.id" :value="profile.id">
            {{ profile.nickname }}
          </option>
        </select>
      </label>

      <SettingsForm
        :settings="panel.settings.value"
        @update:settings="panel.settings.value = $event"
        @save="panel.saveSettings()"
      />
      <ReportPanel
        :report="panel.report.value"
        :period="panel.reportPeriod.value"
        @update:period="onPeriod"
      />
    </template>
  </ParentSectionShell>
</template>

<style scoped>
.settings__picker {
  display: grid;
  gap: var(--ds-space-xs);
}

.settings__picker select {
  min-height: 2.75rem;
  font: inherit;
}

[data-testid='settings-empty'] button {
  min-height: 2.75rem;
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  background: var(--ds-glass-surface);
  font: inherit;
}
</style>
