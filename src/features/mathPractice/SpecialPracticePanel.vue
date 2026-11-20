<script setup lang="ts">
/** 专项思维练习：8 类 × 10 题，答对一题双倍积分。 */
import { computed, ref, watch } from 'vue'

import { SPECIAL_CATEGORIES, SPECIAL_QUESTIONS } from '@/data/content/specialPractice'

const props = defineProps<{
  grade?: number
  /** 今天每个专项已经答过的题数（父组件从事件里读）。 */
  answered?: Readonly<Record<string, number>>
}>()
const emit = defineEmits<{
  (event: 'answer', questionId: string, correct: boolean, category: string): void
  (event: 'close'): void
}>()

const category = ref<string>(SPECIAL_CATEGORIES[0])
const questions = computed(() => SPECIAL_QUESTIONS.filter((item) => item.category === category.value))
const index = ref(0)
const localAnswered = ref(0)
const input = ref('')
const result = ref<'correct' | 'wrong' | null>(null)

/** 每个专项每天一轮：最多 10 题，题目不足 10 道时以实际题数为准。 */
const roundSize = computed(() => Math.min(10, questions.value.length))
const answeredCount = computed(() => Math.max(localAnswered.value, props.answered?.[category.value] ?? 0))
const locked = computed(() => questions.value.length > 0 && answeredCount.value >= roundSize.value)

/** 按天轮换题目顺序，避免每天总是前 10 题。 */
const orderedQuestions = computed(() => {
  const list = questions.value
  if (list.length === 0) return list
  const offset = Math.floor(Date.now() / 86400000) % list.length
  return [...list.slice(offset), ...list.slice(0, offset)]
})
const question = computed(() => orderedQuestions.value[index.value])

function countFor(name: string): number {
  return name === category.value ? answeredCount.value : (props.answered?.[name] ?? 0)
}

function isCategoryDone(name: string): boolean {
  const size = Math.min(10, SPECIAL_QUESTIONS.filter((item) => item.category === name).length)
  return size > 0 && countFor(name) >= size
}

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

function syncCategory(): void {
  localAnswered.value = props.answered?.[category.value] ?? 0
  index.value = localAnswered.value % Math.max(1, orderedQuestions.value.length)
  input.value = ''
  result.value = null
}

function chooseCategory(next: string): void {
  category.value = next
  syncCategory()
}

watch(() => props.answered?.[category.value], (value) => {
  if (typeof value === 'number' && value > localAnswered.value) localAnswered.value = value
})

function submit(): void {
  const current = question.value
  if (current === undefined || input.value.trim() === '' || result.value !== null) return
  const correct = isCorrect(input.value, current.answer)
  result.value = correct ? 'correct' : 'wrong'
  localAnswered.value += 1
  emit('answer', current.id, correct, category.value)
}

function next(): void {
  if (questions.value.length === 0) return
  if (localAnswered.value >= roundSize.value) {
    result.value = null
    return
  }
  index.value = (index.value + 1) % orderedQuestions.value.length
  input.value = ''
  result.value = null
}
</script>

<template>
  <section class="special-practice" data-testid="special-practice">
    <header class="special-practice__head">
      <div>
        <strong>专项思维练习</strong>
        <span>三年级 · {{ SPECIAL_CATEGORIES.length }} 类 {{ SPECIAL_QUESTIONS.length }} 题 · 答对 1 题 = 2 积分</span>
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
        :class="{ 'is-active': item === category, 'is-done': isCategoryDone(item) }"
        @click="chooseCategory(item)"
      >{{ item }}{{ isCategoryDone(item) ? ' ✓' : '' }}</button>
    </div>

    <template v-if="result !== null && question">
      <div class="special-practice__meta">
        <span>{{ '★'.repeat(question.stars) }}</span>
        <span>{{ answeredCount }} / {{ roundSize }}</span>
      </div>
      <p class="special-practice__prompt">{{ question.prompt }}</p>
      <div class="special-practice__feedback" :class="`is-${result}`" data-testid="special-practice-result">
        <strong>{{ result === 'correct' ? '答对了！+2 积分' : '再想想，看看思路' }}</strong>
        <p>答案：{{ question.answer }}</p>
        <p>{{ question.explanation }}</p>
        <p v-if="locked" class="special-practice__done">今天这个专项已经完成，明天再来。</p>
        <button v-else type="button" class="special-practice__next" data-testid="special-practice-next" @click="next">下一题</button>
      </div>
    </template>
    <p v-else-if="locked" class="special-practice__locked" data-testid="special-practice-locked">
      今天这个专项已经完成一轮（{{ roundSize }} 题），明天再来。
    </p>
    <template v-else-if="question">
      <div class="special-practice__meta">
        <span>{{ '★'.repeat(question.stars) }}</span>
        <span>{{ answeredCount + 1 }} / {{ roundSize }}</span>
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
.special-practice__cat.is-done { border-color: rgb(126 224 168 / 55%); color: #9ef0b8; }
.special-practice__locked, .special-practice__done { margin: 0; color: #9ef0b8; font-size: .82rem; }
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
