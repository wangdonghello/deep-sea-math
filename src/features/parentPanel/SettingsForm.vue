<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Settings } from '@/domain/model/types'

const props = defineProps<{ settings: Settings; saving?: boolean }>()
const emit = defineEmits<{ (event: 'update:settings', value: Settings): void; (event: 'save'): void }>()
const draft = ref({ ...props.settings })
watch(() => props.settings, (value) => { draft.value = { ...value } }, { deep: true })

function update(key: keyof Settings, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  draft.value = { ...draft.value, [key]: Number.isFinite(value) ? value : 0 }
  emit('update:settings', { ...draft.value })
}
</script>

<template>
  <form class="settings" data-testid="settings-form" @submit.prevent="emit('save')">
    <h2>每日学习设置</h2>
    <label>基础题数 <input type="number" min="0" :value="draft.basicCount" @input="update('basicCount', $event)"></label>
    <label>应用题数 <input type="number" min="0" :value="draft.appliedCount" @input="update('appliedCount', $event)"></label>
    <label>探测题数 <input type="number" min="0" :value="draft.probeCount" @input="update('probeCount', $event)"></label>
    <label>每日时长上限（分钟） <input type="number" min="1" :value="draft.maxMinutes" @input="update('maxMinutes', $event)"></label>
    <p>新设置从下一次生成题组起生效。</p>
    <p>时长上限将用于首页预估用时与后续答题计时；当前阶段先保存设置。</p>
    <button type="submit" :disabled="saving">保存设置</button>
  </form>
</template>
