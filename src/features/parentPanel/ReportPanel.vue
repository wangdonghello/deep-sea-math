<script setup lang="ts">
import { QUIZ_TYPES } from '@/domain/model/types'
import type { MasteryLevel } from '@/domain/model/types'
import type { ParentReport } from './types'

defineProps<{ report: ParentReport; period: 'today' | '7days' }>()
const emit = defineEmits<{ (event: 'update:period', value: 'today' | '7days'): void }>()
const labels: Record<MasteryLevel, string> = { unmastered: '未掌握', hinted: '提示后掌握', independent: '独立掌握', stable: '稳定掌握' }
</script>

<template>
  <section class="report" data-testid="report-panel">
    <h2>学习报告</h2>
    <label>统计范围
      <select :value="period" @change="emit('update:period', ($event.target as HTMLSelectElement).value as 'today' | '7days')">
        <option value="today">今天</option><option value="7days">近 7 天</option>
      </select>
    </label>
    <dl>
      <div><dt>完成题数</dt><dd data-testid="report-completed">{{ report.completedQuestions }}</dd></div>
      <div><dt>平均用时</dt><dd data-testid="report-average">{{ report.averageMs }} 毫秒</dd></div>
      <div><dt>提示次数</dt><dd data-testid="report-hints">{{ report.hintCount }}</dd></div>
    </dl>
    <h3>题型掌握分布</h3>
    <ul>
      <li v-for="type in QUIZ_TYPES" :key="type">{{ type }}：
        <span v-for="level in Object.keys(labels) as MasteryLevel[]" :key="level">
          {{ labels[level] }} {{ report.masteryByTopic[type]?.[level] ?? 0 }} </span>
      </li>
    </ul>
  </section>
</template>
