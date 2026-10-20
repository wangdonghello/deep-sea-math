<script setup lang="ts">
import { MASTERY_LEVELS, QUIZ_TYPES } from '@/domain/model/types'
import type { MasteryLevel, QuizType } from '@/domain/model/types'
import { quizTypeLabel } from '@/shared/quizTypeLabel'
import type { MistakeFilterState } from './types'

const props = defineProps<{ modelValue: MistakeFilterState }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: MistakeFilterState): void }>()

const masteryLabels: Record<MasteryLevel, string> = {
  unmastered: '还在练习', hinted: '提示后掌握', independent: '独立掌握', stable: '稳定掌握',
}
function updateType(type: QuizType | 'all'): void {
  emit('update:modelValue', { ...props.modelValue, type })
}
function updateMastery(masteryLevel: MasteryLevel | 'all'): void {
  emit('update:modelValue', { ...props.modelValue, masteryLevel })
}
</script>

<template>
  <fieldset class="mistake-filter" data-testid="mistake-filter">
    <legend>筛选错题</legend>
    <label>题型
      <select data-testid="filter-type" :value="modelValue.type" @change="updateType(($event.target as HTMLSelectElement).value as QuizType | 'all')">
        <option value="all">全部题型</option>
        <option v-for="type in QUIZ_TYPES" :key="type" :value="type">{{ quizTypeLabel(type) }}</option>
      </select>
    </label>
    <label>掌握状态（稳定按题型，其余按单题）
      <select data-testid="filter-mastery" :value="modelValue.masteryLevel" @change="updateMastery(($event.target as HTMLSelectElement).value as MasteryLevel | 'all')">
        <option value="all">全部状态</option>
        <option v-for="level in MASTERY_LEVELS" :key="level" :value="level">{{ masteryLabels[level] }}</option>
      </select>
    </label>
  </fieldset>
</template>
