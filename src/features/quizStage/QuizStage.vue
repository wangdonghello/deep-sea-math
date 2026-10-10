<script setup lang="ts">
import { computed, ref } from 'vue'

import type { FiveStep, FiveStepType, Question } from '@/domain/model/types'
import type { FiveStepState } from '@/domain/quiz/fiveStepMachine'
import FiveStepBar from './FiveStepBar.vue'
import Numpad from './Numpad.vue'
import StepBody from './StepBody.vue'

const props = defineProps<{
  question: Question
  steps: readonly FiveStep[]
  machine: FiveStepState | null
  stepFeedback: string
}>()
const emit = defineEmits<{
  submit: [answer: string]
  completeStep: [value: string]
  revisitStep: [step: FiveStepType]
  resumeProgress: []
}>()
const directAnswer = ref('')
const currentTemplate = computed(() => props.steps.find((step) => step.type === props.machine?.current))
const currentIsComplete = computed(() => props.machine?.completed.includes(props.machine.current) ?? false)
</script>

<template>
  <section class="quiz-stage" data-testid="quiz-stage">
    <p class="question-body">{{ question.story.body }}</p>
    <template v-if="machine && currentTemplate">
      <FiveStepBar :steps="steps" :current="machine.current" :completed="machine.completed" @revisit="emit('revisitStep', $event)" />
      <p v-if="currentIsComplete" class="step-review">已完成这一步，可以回看或继续。</p>
      <p v-if="stepFeedback" data-testid="step-feedback">{{ stepFeedback }}</p>
      <button v-if="currentIsComplete" type="button" data-testid="resume-progress" @click="emit('resumeProgress')">继续</button>
      <StepBody
        v-else
        :key="currentTemplate.type"
        :question="question"
        :step="currentTemplate"
        @complete="emit('completeStep', $event)"
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
