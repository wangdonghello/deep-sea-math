<script setup lang="ts">
import { h, ref } from 'vue'
import type { VNode } from 'vue'

import type { FiveStep, FiveStepType, Question } from '@/domain/model/types'
import Numpad from './Numpad.vue'

const props = defineProps<{ question: Question; step: FiveStep }>()
const emit = defineEmits<{ complete: [value: string]; submit: [value: string] }>()
const input = ref('')
type RenderStep = (question: Question, step: FiveStep, value: string) => VNode

function choice(testId: string, text: (q: Question, s: FiveStep) => string): RenderStep {
  return (question, step) => h('button', {
    type: 'button', 'data-testid': testId,
    onClick: () => emit('complete', text(question, step)),
  }, text(question, step))
}

function numeric(testId: string, submit: boolean): RenderStep {
  return (_question, step, value) => h('section', { class: 'step-input' }, [
    h('p', step.prompt),
    h('output', { 'data-testid': 'step-input-value' }, value),
    h(Numpad, { modelValue: value, 'onUpdate:modelValue': (next: string) => { input.value = next } }),
    h('button', {
      type: 'button', 'data-testid': testId, disabled: value.trim() === '',
      onClick: () => submit ? emit('submit', value) : emit('complete', value),
    }, submit ? '提交答案' : '确认算式'),
  ])
}

/** Render dispatch table keeps each five-step action mapped by its domain step type. */
const stepBodyByType: Record<FiveStepType, RenderStep> = {
  known: choice('known-choice', (question) => question.story.body),
  unknown: choice('unknown-choice', (_question, step) => step.prompt),
  relation: choice('relation-choice', (_question, step) => step.prompt),
  expression: numeric('confirm-expression', false),
  answer: numeric('submit-step-answer', true),
}
const renderCurrentStep = () => stepBodyByType[props.step.type](props.question, props.step, input.value)
</script>

<template>
  <div class="step-body" data-testid="step-body">
    <component :is="renderCurrentStep" />
  </div>
</template>
