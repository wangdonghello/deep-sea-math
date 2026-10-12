<script setup lang="ts">
import type { Question } from '@/domain/model/types'
import Numpad from './Numpad.vue'

/**
 * 答题舞台：题干 + 输入回显 + 数字键盘。
 *
 * 当前版本**只有这一条渲染路径**——解题思路不再以内联五步流程铺开，而是
 * 由题目页底部的「我需要提示」按需展开 5 层提示链（见 RETRO R27）。
 */
defineProps<{ question: Question }>()
defineEmits<{ submit: [answer: string] }>()
/**
 * 当前输入（数字或算式）。
 *
 * 提交按钮在答题页底部统一动作区（`data-testid="action-submit"`），
 * 因此输入值需经此 model 上抛给父级；本组件只负责采集与渲染。
 */
const answer = defineModel<string>('answer', { default: '' })
</script>

<template>
  <section class="quiz-stage" data-testid="quiz-stage">
    <p class="question-body">{{ question.story.body }}</p>
    <div data-testid="direct-answer">
      <output data-testid="answer-value">{{ answer }}</output>
      <Numpad v-model="answer" />
    </div>
  </section>
</template>

<style scoped>
.quiz-stage { display: grid; gap: 1rem; }
.question-body { font-size: 1.25rem; line-height: 1.6; }
</style>
