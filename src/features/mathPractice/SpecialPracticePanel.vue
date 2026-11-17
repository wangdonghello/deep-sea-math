<script setup lang="ts">
/** 专项思维练习：8 类 × 10 题，答对一题双倍积分。 */
import { computed, ref } from 'vue'

import { SPECIAL_CATEGORIES, SPECIAL_QUESTIONS } from '@/data/content/specialPractice'

const props = defineProps<{ grade?: number }>()
const emit = defineEmits<{
  (event: 'answer', questionId: string, correct: boolean): void
  (event: 'close'): void
}>()

const category = ref<string>(SPECIAL_CATEGORIES[0])
const questions = computed(() => SPECIAL_QUESTIONS.filter((item) => item.category === category.value))
const index = ref(0)
const question = computed(() => questions.value[index.value])
const input = ref('')
const result = ref<'correct' | 'wrong' | null>(null)

function normalize(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，,。；;：:、\s（）()]/g, '')
    .replace(/[＋+]/g, '+')
    .toLowerCase()
}

function numbers(value: string): number[] {
  return (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

/** 数字答案按数字序列对；纯文字答案按包含关系对。 */
function isCorrect(submitted: string, answer: string): boolean {
  const expectedNumbers = numbers(answer)
  if (expectedNumbers.length > 0) {
    return JSON.stringify(numbers(submitted)) === JSON.stringify(expectedNumbers)
  }
  const expected = normalize(answer)
  const actual = normalize(submitted)
  return actual !== '' && (actual === expected || actual.includes(expected))
}

function chooseCategory(next: string): void {
  category.value = next
  index.value = 0
  input.value = ''
  result.value = null
}

function submit(): void {
  const current = question.value
  if (current === undefined || input.value.trim() === '' || result.value !== null) return
  const correct = isCorrect(input.value, current.answer)
  result.value = correct ? 'correct' : 'wrong'
  emit('answer', current.id, correct)
}

function next(): void {
  if (questions.value.length === 0) return
  index.value = (index.value + 1) % questions.value.length
  input.value = ''
  result.value = null
}
</script>

<template>
  <section class="special-practice" data-testid="special-practice">
    <header class="special-practice__head">
      <div>
        <strong>专项思维练习</strong>
        <span>三年级 · 8 类 80 题 · 答对 1 题 = 2 积分</span>
      </div>
      <button type="button" class="special-practice__close" data-testid="special-practice-close" @click="emit('close')">收起</button>
    </header>

    <p v-if="props.grade !== undefined && props.grade !== 3" class="special-practice__hint">
      当前专项题库为三年级内容，其他年级可以看看挑战一下。
    </p>

    <div class="special-practice__cats" role="tablist" aria-label="专项类别">
      <button
        v-for="item in SPECIAL_CATEGORIES"
        :key="item"
        type="button"
        role="tab"
        :aria-selected="item === category"
        class="special-practice__cat"
        :class="{ 'is-active': item === category }"
        @click="chooseCategory(item)"
      >{{ item }}</button>
    </div>

    <template v-if="question">
      <div class="special-practice__meta">
        <span>{{ '★'.repeat(question.stars) }}</span>
        <span>{{ index + 1 }} / {{ questions.length }}</span>
      </div>
      <p class="special-practice__prompt">{{ question.prompt }}</p>
      <form class="special-practice__form" @submit.prevent="submit">
        <input
          v-model="input"
          class="special-practice__input"
          data-testid="special-practice-input"
          :disabled="result !== null"
          placeholder="输入答案，多个答案用空格隔开"
          aria-label="专项练习答案"
        >
        <button type="submit" class="special-practice__submit" data-testid="special-practice-submit" :disabled="result !== null">检查</button>
      </form>
      <div v-if="result !== null" class="special-practice__feedback" :class="`is-${result}`" data-testid="special-practice-result">
        <strong>{{ result === 'correct' ? '答对了！+2 积分' : '再想想，看看思路' }}</strong>
        <p>答案：{{ question.answer }}</p>
        <p>{{ question.explanation }}</p>
        <button type="button" class="special-practice__next" data-testid="special-practice-next" @click="next">下一题</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.special-practice { display: grid; gap: var(--ds-space-sm); padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-lg); background: rgb(7 24 42 / 82%); }
.special-practice__head { display: flex; gap: var(--ds-space-sm); align-items: flex-start; justify-content: space-between; }
.special-practice__head strong { display: block; color: var(--ds-text-primary); }
.special-practice__head span { display: block; margin-top: .2rem; color: var(--ds-text-secondary); font-size: .72rem; }
.special-practice__close { border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-pill); background: transparent; color: var(--ds-text-secondary); font: inherit; font-size: .72rem; padding: .2rem .6rem; }
.special-practice__hint { margin: 0; color: #ffd0a6; font-size: .78rem; }
.special-practice__cats { display: flex; flex-wrap: wrap; gap: .35rem; }
.special-practice__cat { border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-pill); background: transparent; color: var(--ds-text-secondary); font: inherit; font-size: .72rem; padding: .25rem .55rem; }
.special-practice__cat.is-active { border-color: var(--ds-glow-primary); background: rgb(24 78 116 / 65%); color: var(--ds-text-primary); }
.special-practice__meta { display: flex; justify-content: space-between; color: var(--ds-accent-300); font-size: .75rem; }
.special-practice__prompt { margin: 0; color: var(--ds-text-primary); line-height: 1.6; }
.special-practice__form { display: flex; gap: var(--ds-space-sm); }
.special-practice__input { flex: 1; min-height: 2.6rem; padding: 0 var(--ds-space-sm); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: rgb(4 14 26 / 80%); color: var(--ds-text-primary); font: inherit; }
.special-practice__submit, .special-practice__next { min-height: 2.6rem; padding: 0 var(--ds-space-lg); border: 1px solid var(--ds-glow-primary); border-radius: var(--ds-radius-pill); background: rgb(24 78 116 / 82%); color: var(--ds-text-primary); font: inherit; font-weight: 700; }
.special-practice__feedback { display: grid; gap: .35rem; padding: var(--ds-space-sm); border: 1px solid #ffb27a; border-radius: var(--ds-radius-md); background: rgb(74 38 20 / 45%); }
.special-practice__feedback.is-correct { border-color: #7ee0a8; background: rgb(18 58 42 / 45%); }
.special-practice__feedback strong { color: var(--ds-text-primary); }
.special-practice__feedback p { margin: 0; color: var(--ds-text-secondary); font-size: .82rem; line-height: 1.5; }
.special-practice__next { justify-self: start; }
</style>
