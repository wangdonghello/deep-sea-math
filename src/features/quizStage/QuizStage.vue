<script setup lang="ts">
import { computed, ref } from 'vue'

import { completeCurrentStep, createFiveStepMachine, resumeProgress, revisitStep } from '@/domain/quiz/fiveStepMachine'
import { matchesExpression } from '@/domain/quiz/answerJudgement'
import type { FiveStep, FiveStepType, Question } from '@/domain/model/types'
import FiveStepBar from './FiveStepBar.vue'
import Numpad from './Numpad.vue'
import StepBody from './StepBody.vue'

const props = defineProps<{ question: Question; position?: number; total?: number }>()
const emit = defineEmits<{ submit: [answer: string] }>()
const directAnswer = ref('')
const stepFeedback = ref('')

// Temporary DEMO_QUESTION_POOL five-step records lack templates until Task 8 supplies questionBank.json.
const fallbackSteps: FiveStep[] = [
  { type: 'known', prompt: '找出题目里的已知条件' },
  { type: 'unknown', prompt: '找出题目要求的内容' },
  { type: 'relation', prompt: '选择已知与未知的数量关系' },
  { type: 'expression', prompt: '写出算式' },
  { type: 'answer', prompt: '写出计算结果' },
]
const steps = props.question.steps ?? fallbackSteps
const machine = ref(props.question.requiresFiveStep ? createFiveStepMachine(steps) : null)
const current = computed(() => machine.value?.steps.find((step) => step === machine.value?.current))
const currentTemplate = computed(() => steps.find((step) => step.type === current.value))
const currentIsComplete = computed(() => machine.value?.completed.includes(machine.value.current) ?? false)

function completeStep(value: string): void {
  if (machine.value === null || currentIsComplete.value) return
  if (
    machine.value.current === 'expression' && props.question.answer.expression !== undefined &&
    !matchesExpression(value, props.question.answer.expression)
  ) {
    stepFeedback.value = '再看看数量关系，试着列出对应的算式。'
    return
  }
  stepFeedback.value = ''
  machine.value = completeCurrentStep(machine.value)
}
function revisit(step: FiveStepType): void {
  if (machine.value !== null && machine.value.completed.includes(step)) machine.value = revisitStep(machine.value, step)
}
function resume(): void {
  if (machine.value !== null) machine.value = resumeProgress(machine.value)
}
</script>

<template>
  <section class="quiz-stage" data-testid="quiz-stage">
    <p class="question-body">{{ question.story.body }}</p>
    <template v-if="machine && currentTemplate">
      <FiveStepBar :steps="steps" :current="machine.current" :completed="machine.completed" @revisit="revisit" />
      <p v-if="currentIsComplete" class="step-review">已完成这一步，可以回看或继续。</p>
      <p v-if="stepFeedback" data-testid="step-feedback">{{ stepFeedback }}</p>
      <button v-if="currentIsComplete" type="button" data-testid="resume-progress" @click="resume">继续</button>
      <StepBody
        v-else
        :key="currentTemplate.type"
        :question="question"
        :step="currentTemplate"
        @complete="completeStep"
        @submit="emit('submit', $event)"
      />
    </template>
    <div v-else data-testid="direct-answer">
      <output data-testid="answer-value">{{ directAnswer }}</output>
      <Numpad v-model="directAnswer" />
      <button type="button" data-testid="submit-answer" :disabled="!directAnswer.trim()" @click="emit('submit', directAnswer)">提交答案</button>
    </div>
  </section>
</template>

<style scoped>
.quiz-stage { display: grid; gap: 1rem; }
.question-body { font-size: 1.25rem; line-height: 1.6; }
.step-review { color: var(--color-muted, #b5c7df); }
</style>
