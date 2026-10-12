<script setup lang="ts">
import { computed } from 'vue'

import { HINT_LAYER_LABELS } from '@/domain/hint/hintChainSelector'
import type { Question } from '@/domain/model/types'

/**
 * 「答案与讲解」面板——答错后「看答案」或答对后「看答案详解」时在题目下方展开。
 *
 * 内容来源：五层提示直接取 `question.hints`（题目内容校验保证恰 5 层，顺序即
 * 规格的审题提醒 → 已知/未知识别 → 数量关系 → 算式提示 → 讲解示例），最终
 * 答案优先展示算式表达式，否则「数值 + 单位」。本组件纯展示，不写任何事件；
 * 是否记录 `answer-revealed` 由调用方（两处显示时机）决定。
 */
const props = defineProps<{ question: Question }>()

const answerText = computed(() => {
  const { expression, value, unit } = props.question.answer
  return expression ?? `${value}${unit ?? ''}`
})
</script>

<template>
  <section class="answer-explanation" data-testid="answer-explanation" aria-label="答案与讲解">
    <h2 class="answer-explanation__title">答案与讲解</h2>
    <ol class="answer-explanation__hints">
      <li
        v-for="(hint, index) in question.hints"
        :key="index"
        class="answer-explanation__hint"
        data-testid="explanation-hint"
      >
        <strong>{{ HINT_LAYER_LABELS[index] }}：</strong>{{ hint }}
      </li>
    </ol>
    <p class="answer-explanation__answer" data-testid="explanation-answer">
      答案：{{ answerText }}
    </p>
  </section>
</template>

<style scoped>
.answer-explanation { display: grid; gap: 0.75rem; padding: 1rem; border: 1px solid var(--ds-glass-border, rgba(140, 200, 255, 0.22)); border-radius: 1rem; }
.answer-explanation__title { margin: 0; font-size: 1.125rem; }
.answer-explanation__hints { display: grid; gap: 0.5rem; margin: 0; padding-left: 1.25rem; }
.answer-explanation__answer { margin: 0; font-weight: 700; color: var(--color-accent, #ffb454); }
</style>
