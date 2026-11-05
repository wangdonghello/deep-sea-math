<script setup lang="ts">
/**
 * 自由练习：完成当日任务与错题后仍想练一题时使用。
 *
 * 每题按半速结算：积分每答对 2 题记 1 分，宠物 XP 每题 +2（由投影结算）。
 * 这里只负责出题、判分与把结果 emit 给房间，不直接写事件。
 */
import { computed, ref } from 'vue'

import { QUESTION_BANK_BY_GRADE } from '@/data/content'
import type { Question } from '@/domain/model/types'
import { isCorrect } from '@/domain/quiz/answerJudgement'

const props = defineProps<{ grade: number }>()
const emit = defineEmits<{
  (event: 'answer', questionId: string, correct: boolean): void
  (event: 'close'): void
}>()

const pool = computed<readonly Question[]>(() => {
  const bank = QUESTION_BANK_BY_GRADE[props.grade as 1 | 2 | 3 | 4 | 5 | 6]
  return (bank?.questions ?? []).filter(
    (question) => question.format === 'open' && question.answer.expression === undefined,
  )
})

const index = ref(pool.value.length === 0 ? 0 : Math.floor(Math.random() * pool.value.length))
const question = computed<Question | undefined>(() => pool.value[index.value % Math.max(1, pool.value.length)])
const input = ref('')
const result = ref<'correct' | 'wrong' | null>(null)

function submit(): void {
  const current = question.value
  if (current === undefined || input.value.trim() === '' || result.value !== null) return
  const correct = isCorrect(input.value, current.answer)
  result.value = correct ? 'correct' : 'wrong'
  emit('answer', current.id, correct)
}

defineExpose({ question })

function next(): void {
  if (pool.value.length === 0) return
  index.value = (index.value + 1) % pool.value.length
  input.value = ''
  result.value = null
}
</script>

<template>
  <section class="free-practice" data-testid="free-practice">
    <header class="free-practice__head">
      <strong>自由练习</strong>
      <span>答对 2 题 = 1 积分 · 每题 +2 XP</span>
      <button type="button" class="free-practice__close" data-testid="free-practice-close" @click="emit('close')">收起</button>
    </header>

    <template v-if="question">
      <p class="free-practice__title">{{ question.story.title }}</p>
      <p class="free-practice__body">{{ question.story.body }}</p>
      <form class="free-practice__form" @submit.prevent="submit">
        <input
          v-model="input"
          class="free-practice__input"
          data-testid="free-practice-input"
          inputmode="decimal"
          :disabled="result !== null"
          placeholder="输入答案"
          aria-label="自由练习答案"
        >
        <button type="submit" class="free-practice__submit" data-testid="free-practice-submit" :disabled="result !== null">检查</button>
      </form>
      <p v-if="result !== null" class="free-practice__result" :class="`free-practice__result--${result}`" data-testid="free-practice-result">
        {{ result === 'correct' ? '答对了！积分与经验已按半速记录。' : `再想想，答案是 ${question.answer.value}${question.answer.unit ?? ''}。` }}
      </p>
      <button v-if="result !== null" type="button" class="free-practice__next" data-testid="free-practice-next" @click="next">下一题</button>
    </template>
    <p v-else class="free-practice__body">这个年级暂时没有可练习的题目。</p>
  </section>
</template>

<style scoped>
.free-practice {
  display: grid;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: rgb(7 24 42 / 82%);
}
.free-practice__head { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); align-items: baseline; justify-content: space-between; }
.free-practice__head strong { color: var(--ds-text-primary); }
.free-practice__head span { color: var(--ds-text-secondary); font-size: .72rem; }
.free-practice__close { border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-pill); background: transparent; color: var(--ds-text-secondary); font: inherit; font-size: .72rem; padding: .2rem .6rem; }
.free-practice__title { margin: 0; color: var(--ds-accent-300); font-size: .85rem; }
.free-practice__body { margin: 0; color: var(--ds-text-primary); line-height: 1.5; }
.free-practice__form { display: flex; gap: var(--ds-space-sm); }
.free-practice__input { flex: 1; min-height: 2.6rem; padding: 0 var(--ds-space-sm); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: rgb(4 14 26 / 80%); color: var(--ds-text-primary); font: inherit; }
.free-practice__submit, .free-practice__next { min-height: 2.6rem; padding: 0 var(--ds-space-lg); border: 1px solid var(--ds-glow-primary); border-radius: var(--ds-radius-pill); background: rgb(24 78 116 / 82%); color: var(--ds-text-primary); font: inherit; font-weight: 700; }
.free-practice__result { margin: 0; font-size: .85rem; }
.free-practice__result--correct { color: #9ef0b8; }
.free-practice__result--wrong { color: #ffd0a6; }
</style>
