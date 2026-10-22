<script setup lang="ts">
import { computed } from 'vue'

import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { useMistakeBook } from '@/features/mistakeBook/useMistakeBook'
import type { MistakeBookStore, MistakeFilterState, MistakeQuestionCatalog } from '@/features/mistakeBook/types'
import { answerText, choiceOptionLabel } from '@/shared/choiceAnswer'
import '@/styles/print.css'

const props = defineProps<{
  store: MistakeBookStore
  catalog: MistakeQuestionCatalog
  filter: MistakeFilterState
}>()
const emit = defineEmits<{ (event: 'back'): void }>()

const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)
const book = useMistakeBook(profileId, props.store, props.catalog, undefined, props.filter)

const printable = computed(() => book.visibleItems.value.flatMap((item) => {
  const question = props.catalog[item.questionId]
  return question === undefined ? [] : [{ item, question }]
}))
const skipped = computed(() => book.visibleItems.value.length - printable.value.length)
const today = new Date().toLocaleDateString('zh-CN')

function selectedOptionLabel(questionId: string, submitted: string | undefined): string {
  if (submitted === undefined) return '未作答（看过答案）'
  const question = props.catalog[questionId]
  if (question === undefined) return submitted
  if (question.options === undefined) return submitted
  return `${submitted}. ${choiceOptionLabel(question as never, submitted)}`
}

function printPage(): void {
  window.print()
}
</script>

<template>
  <main class="print-page" data-testid="mistake-print-page">
    <header class="print-header">
      <h1>错题练习纸</h1>
      <p>{{ session.projection?.nickname ?? '孩子' }} · {{ today }} · 共 {{ printable.length }} 题</p>
      <p v-if="skipped > 0" class="print-note">{{ skipped }} 道题内容已更新，暂不可打印，已跳过。</p>
    </header>

    <p v-if="book.loading.value" data-testid="print-loading">正在准备打印内容…</p>
    <p v-else-if="printable.length === 0" data-testid="print-empty">当前筛选下没有可打印的错题。</p>

    <template v-else>
      <section class="print-questions">
        <article v-for="(row, index) in printable" :key="row.item.questionId" class="print-question" data-testid="print-question">
          <h2>第 {{ index + 1 }} 题 · {{ row.question.type }}</h2>
          <p class="print-story">{{ row.question.story?.body ?? row.question.story?.title ?? row.item.questionId }}</p>
          <ol v-if="row.question.options?.length" class="print-options">
            <li v-for="option in row.question.options" :key="option.id">{{ option.id }}. {{ option.label }}</li>
          </ol>
        </article>
      </section>

      <section class="print-answers" data-testid="print-answers">
        <h2>答案与解析</h2>
        <article v-for="(row, index) in printable" :key="`answer-${row.item.questionId}`" class="print-answer">
          <h3>第 {{ index + 1 }} 题</h3>
          <p>孩子答案：{{ selectedOptionLabel(row.item.questionId, row.item.lastWrongAnswer) }}</p>
          <p v-if="row.question.answer">正确答案：{{ answerText(row.question as never) }}</p>
          <p>解析：{{ row.question.hints?.[4] ?? '暂无解析' }}</p>
        </article>
      </section>
    </template>

    <div class="print-actions">
      <button type="button" data-testid="print-button" @click="printPage">打印</button>
      <button type="button" data-testid="print-back" @click="emit('back')">返回错题本</button>
    </div>
  </main>
</template>

<style scoped>
.print-page { display: grid; gap: 1.25rem; max-width: 48rem; margin: 0 auto; padding: 1rem 1rem 3rem; color: var(--ds-text-primary); }
.print-header h1 { margin: 0 0 .5rem; }
.print-header p { margin: .25rem 0; color: var(--ds-text-secondary); }
.print-note { color: #c77a00; }
.print-questions, .print-answers { display: grid; gap: 1rem; }
.print-question, .print-answer { break-inside: avoid; border: 1px solid var(--ds-glass-border); border-radius: .8rem; padding: 1rem; background: var(--ds-glass-surface); }
.print-question h2, .print-answer h3 { margin: 0 0 .5rem; }
.print-story { margin: 0 0 .75rem; line-height: 1.7; }
.print-options { display: grid; gap: .35rem; margin: 0; padding-left: 1.25rem; }
.print-actions { display: flex; gap: .75rem; }
.print-actions button { min-height: 2.75rem; padding: 0 1.25rem; }
</style>
