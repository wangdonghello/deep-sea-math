<script setup lang="ts">
import { h } from 'vue'
import type { VNode } from 'vue'

import type { FiveStep, FiveStepType, Question } from '@/domain/model/types'
import Numpad from './Numpad.vue'

const props = defineProps<{ question: Question; step: FiveStep }>()
const emit = defineEmits<{ complete: [value: string]; submit: [value: string] }>()
/**
 * 数值步的输入值经此 model 上抛（`QuizStage` 再上抛给答题页动作区）。
 *
 * 答案步不再自带「提交答案」按钮——它已并入答题页底部统一动作区
 * （`data-testid="action-submit"`），避免同一页出现两个提交入口。
 */
const value = defineModel<string>('value', { default: '' })
type RenderStep = (question: Question, step: FiveStep, value: string) => VNode

function choice(testId: string, text: (q: Question, s: FiveStep) => string): RenderStep {
  return (question, step) => h('button', {
    type: 'button', 'data-testid': testId,
    onClick: () => emit('complete', text(question, step)),
  }, text(question, step))
}

function numberpad(current: string): VNode {
  return h(Numpad, { modelValue: current, 'onUpdate:modelValue': (next: string) => { value.value = next } })
}

/** 算式步：自带「确认算式」按钮，完成后由状态机前进到答案步。 */
function expressionStep(): RenderStep {
  return (_question, step, current) => h('section', { class: 'step-input' }, [
    h('p', step.prompt),
    h('output', { 'data-testid': 'step-input-value' }, current),
    numberpad(current),
    h('button', {
      type: 'button', 'data-testid': 'confirm-expression', disabled: current.trim() === '',
      onClick: () => emit('complete', current),
    }, '确认算式'),
  ])
}

/** 答案步：只采集输入，提交由答题页动作区统一处理。 */
function answerStep(): RenderStep {
  return (_question, step, current) => h('section', { class: 'step-input' }, [
    h('p', step.prompt),
    h('output', { 'data-testid': 'step-input-value' }, current),
    numberpad(current),
  ])
}

/** Render dispatch table keeps each five-step action mapped by its domain step type. */
const stepBodyByType: Record<FiveStepType, RenderStep> = {
  known: choice('known-choice', (question) => question.story.body),
  unknown: choice('unknown-choice', (_question, step) => step.prompt),
  relation: choice('relation-choice', (_question, step) => step.prompt),
  expression: expressionStep(),
  answer: answerStep(),
}
const renderCurrentStep = () => stepBodyByType[props.step.type](props.question, props.step, value.value)
</script>

<template>
  <div class="step-body" data-testid="step-body">
    <component :is="renderCurrentStep" />
  </div>
</template>
