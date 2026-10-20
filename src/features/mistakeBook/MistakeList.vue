<script setup lang="ts">
import type { MasteryLevel } from '@/domain/model/types'
import { quizTypeLabel } from '@/shared/quizTypeLabel'
import type { MistakeBookItem } from './types'

defineProps<{ entries: readonly MistakeBookItem[] }>()
const emit = defineEmits<{ (event: 'practice', questionId: string): void }>()

const masteryLabels: Record<MasteryLevel, string> = {
  unmastered: '还在练习', hinted: '提示后掌握', independent: '独立掌握', stable: '稳定掌握',
}
function displayTime(value: number | null): string {
  return value === null ? '尚无答错时间记录' : new Date(value).toISOString()
}
</script>

<template>
  <ul class="mistake-list" data-testid="mistake-list">
    <li v-for="entry in entries" :key="entry.questionId" data-testid="mistake-entry">
      <article>
        <h2>{{ entry.title ?? entry.questionId }}</h2>
        <p>题目编号：{{ entry.questionId }}</p>
        <p>题型：{{ quizTypeLabel(entry.type) }}</p>
        <p>单题掌握状态：{{ masteryLabels[entry.questionMasteryLevel] }}</p>
        <p>题型掌握状态：{{ entry.topicMasteryLevel === null ? '待补充' : masteryLabels[entry.topicMasteryLevel] }}</p>
        <p>答错次数：{{ entry.wrongCount }}</p>
        <p>最近答错：{{ displayTime(entry.lastWrongAt) }}</p>
        <button type="button" :data-testid="`practice-${entry.questionId}`" @click="emit('practice', entry.questionId)">
          重新练习
        </button>
      </article>
    </li>
  </ul>
</template>
