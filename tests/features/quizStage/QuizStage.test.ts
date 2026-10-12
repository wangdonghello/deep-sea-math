import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createQuestion } from '@/domain/model/types'
import type { DomainEvent, FiveStep, Question } from '@/domain/model/types'
import { completeCurrentStep, createFiveStepMachine } from '@/domain/quiz/fiveStepMachine'
import QuizStage from '@/features/quizStage/QuizStage.vue'
import HintStack from '@/features/quizStage/HintStack.vue'
import Numpad from '@/features/quizStage/Numpad.vue'
import QuestView from '@/views/QuestView.vue'

function question(requiresFiveStep = false, id = requiresFiveStep ? 'applied' : 'basic'): Question {
  return createQuestion({
    id, type: 'add-sub', difficulty: 1,
    category: requiresFiveStep ? 'applied' : 'basic',
    story: { title: '海星收集贝壳', body: '收集 3 个，又找到 4 个，一共有几个？' },
    requiresFiveStep,
    steps: requiresFiveStep ? [
      { type: 'known', prompt: '找出题目里的已知条件' },
      { type: 'unknown', prompt: '找出题目要求的内容' },
      { type: 'relation', prompt: '选择数量关系' },
      { type: 'expression', prompt: '写出算式' },
      { type: 'answer', prompt: '写出结果' },
    ] : undefined,
    hints: ['提示一', '提示二', '提示三', '提示四', '提示五'],
    answer: { value: 7, unit: '个' }, similarQuestionIds: [], tags: [], sources: ['test'],
  })
}

const fallbackSteps: FiveStep[] = [
  { type: 'known', prompt: '已知' }, { type: 'unknown', prompt: '未知' },
  { type: 'relation', prompt: '关系' }, { type: 'expression', prompt: '算式' },
  { type: 'answer', prompt: '答案' },
]
function stageProps(value: Question, completedSteps = 0) {
  const steps = value.steps ?? fallbackSteps
  let machine = value.requiresFiveStep ? createFiveStepMachine(steps) : null
  if (machine !== null) {
    for (let index = 0; index < completedSteps; index += 1) machine = completeCurrentStep(machine)
  }
  return { question: value, steps, machine, stepFeedback: '' }
}

describe('QuizStage', () => {
  it('基础题直答且不显示 FiveStepBar', () => {
    const view = mount(QuizStage, { props: stageProps(question()) })
    expect(view.find('[data-testid="five-step-bar"]').exists()).toBe(false)
    expect(view.find('[data-testid="direct-answer"]').exists()).toBe(true)
  })

  it('已知步动作只转发完成请求', async () => {
    const view = mount(QuizStage, { props: stageProps(question(true)) })
    expect(view.find('[data-testid="five-step-bar"]').exists()).toBe(true)
    expect(view.find('[data-current-step="known"]').exists()).toBe(true)
    await view.get('[data-testid="known-choice"]').trigger('click')
    expect(view.emitted('completeStep')).toEqual([[question(true).story.body]])
  })

  it('答案步只转发提交，由 composable 判定并推进状态', async () => {
    const source = question(true)
    const applied = createQuestion({ ...source, answer: { value: 7, unit: '个', expression: '3+4' } })
    const view = mount(QuizStage, { props: stageProps(applied, 4) })
    await view.get('[data-key="7"]').trigger('click')
    await view.get('[data-testid="submit-step-answer"]').trigger('click')
    expect(view.emitted('submit')).toEqual([['7']])
  })
})

describe('HintStack', () => {
  it('按点击次数逐层展开题级提示', async () => {
    const view = mount(HintStack, { props: { hints: [], used: 0 } })
    expect(view.findAll('[data-testid="hint-layer"]')).toHaveLength(0)
    await view.get('[data-testid="reveal-hint"]').trigger('click')
    await view.setProps({ hints: [{ layer: 1, text: '提示一' }], used: 1 })
    expect(view.findAll('[data-testid="hint-layer"]')).toHaveLength(1)
    expect(view.text()).toContain('提示一')
    await view.get('[data-testid="reveal-hint"]').trigger('click')
    await view.get('[data-testid="reveal-hint"]').trigger('click')
    await view.setProps({ hints: [1, 2, 3].map((layer) => ({ layer, text: `提示${['一', '二', '三'][layer - 1]}` })), used: 3 })
    expect(view.findAll('[data-testid="hint-layer"]')).toHaveLength(3)
    expect(view.text()).toContain('提示三')
    await view.setProps({ hints: [1, 2, 3, 4, 5].map((layer) => ({ layer, text: `提示${['一', '二', '三', '四', '五'][layer - 1]}` })), used: 5 })
    expect(view.findAll('[data-testid="hint-layer"]')).toHaveLength(5)
    expect((view.get('[data-testid="reveal-hint"]').element as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Numpad', () => {
  it('支持数字输入、退格和四则运算符', async () => {
    const view = mount(Numpad, { props: { modelValue: '' } })
    let value = ''
    for (const key of ['2', '4', '÷', '4']) {
      await view.get(`[data-key="${key}"]`).trigger('click')
      value = view.emitted('update:modelValue')?.at(-1)?.[0] as string
      await view.setProps({ modelValue: value })
    }
    expect(view.emitted('update:modelValue')?.at(-1)).toEqual(['24÷4'])
    await view.get('[data-key="backspace"]').trigger('click')
    await view.setProps({ modelValue: '24÷' })
    expect(view.emitted('update:modelValue')?.at(-1)).toEqual(['24÷'])
  })
})

describe('QuestView feedback', () => {
  it('题组槽位重复时明确提示已合并，不静默重复推进', async () => {
    const questions = [question(false, 'dup-1'), question(false, 'dup-2')]
    const events: DomainEvent[] = [{
      eventId: 'started', profileId: 'profile', occurredAt: 1, type: 'session-started',
      sessionId: 'session', questionIds: ['dup-1', 'dup-1', 'dup-2'],
      difficultyTrace: [1, 1, 1],
    }]
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const view = mount(QuestView, {
      props: { sessionId: 'session', profileId: 'profile', questions, store },
    })
    await flushPromises()
    expect(view.find('[data-testid="duplicate-slot-fallback"]').text()).toContain('重复题目已合并')
  })

  it('答错显示正向提示，不渲染失败弹窗或 alert', async () => {
    const events: DomainEvent[] = []
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const view = mount(QuestView, {
      props: { sessionId: 'session', profileId: 'profile', questions: [question()], store },
    })
    await flushPromises()
    await view.get('[data-key="8"]').trigger('click')
    await view.get('[data-testid="submit-answer"]').trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(view.find('[data-testid="quiz-feedback"]').text()).toContain('再想想')
    expect(view.text()).not.toContain('答题失败')
    expect(view.findAll('[data-testid="hint-layer"]')).toHaveLength(1)
  })

  it('持久化分层提示与直接看答案事件', async () => {
    const events: DomainEvent[] = []
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const view = mount(QuestView, {
      props: { sessionId: 'session', profileId: 'profile', questions: [question()], store },
    })
    await flushPromises()
    await view.get('[data-testid="reveal-hint"]').trigger('click')
    await flushPromises()
    expect(events.some((event) => event.type === 'hint-used' && event.level === 1)).toBe(true)
    await view.get('[data-testid="reveal-answer"]').trigger('click')
    await flushPromises()
    expect(events.some((event) => event.type === 'answer-revealed' && event.revealedAnswer === true)).toBe(true)
    expect(events.some((event) => event.type === 'session-completed')).toBe(false)
  })

  it('看完题但未完成时提供继续练习，订正后才显示完成并发奖', async () => {
    const events: DomainEvent[] = [{
      eventId: 'started', profileId: 'profile', occurredAt: 1, type: 'session-started',
      sessionId: 'session', questionIds: ['basic', 'second'], difficultyTrace: [1, 1],
    }]
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const view = mount(QuestView, {
      props: { sessionId: 'session', profileId: 'profile', questions: [question(), question(false, 'second')], store },
    })
    await flushPromises()
    await view.get('[data-testid="reveal-answer"]').trigger('click')
    await flushPromises()
    await view.get('[data-testid="reveal-answer"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="quest-completed"]').exists()).toBe(false)
    expect(view.text()).toContain('已看完题目，但直接看答案不计入任务完成')
    expect(view.get('[data-testid="continue-practice"]').text()).toContain('继续练习')
    expect(events.some((event) => event.type === 'session-completed')).toBe(false)

    await view.get('[data-testid="continue-practice"]').trigger('click')
    expect(view.find('[data-testid="direct-answer"]').exists()).toBe(true)
    await view.get('[data-key="8"]').trigger('click')
    await view.get('[data-testid="submit-answer"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="direct-answer"]').exists()).toBe(true)
    await view.get('[data-key="backspace"]').trigger('click')
    await view.get('[data-key="7"]').trigger('click')
    await view.get('[data-testid="submit-answer"]').trigger('click')
    await flushPromises()
    await view.get('[data-testid="continue-practice"]').trigger('click')
    await view.get('[data-key="7"]').trigger('click')
    await view.get('[data-testid="submit-answer"]').trigger('click')
    await flushPromises()
    expect(events.some((event) => event.type === 'session-completed')).toBe(true)
    expect(view.find('[data-testid="quest-completed"]').exists()).toBe(true)
  })

  it('存储错误只显示中性状态，日志脱敏', async () => {
    const logs: Record<string, unknown>[] = []
    const store = {
      async listEvents() { return [] as DomainEvent[] },
      async appendEvents() {
        throw Object.assign(new Error('存储不可用'), { token: 'sensitive-value' })
      },
    }
    const view = mount(QuestView, {
      props: {
        sessionId: 'session', profileId: 'profile', questions: [question()], store,
        logger: (entry: Record<string, unknown>) => logs.push(entry),
      },
    })
    await flushPromises()
    await view.get('[data-key="8"]').trigger('click')
    await view.get('[data-testid="submit-answer"]').trigger('click')
    await flushPromises()
    expect(view.find('[role="status"]').text()).toContain('暂时无法保存')
    expect(JSON.stringify(logs)).not.toContain('sensitive-value')
  })
})
