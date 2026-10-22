import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createQuestion } from '@/domain/model/types'
import type { DomainEvent, Question } from '@/domain/model/types'
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

describe('QuizStage', () => {
  it('只渲染题干、输入与数字键盘，不再渲染任何五步引导', () => {
    const view = mount(QuizStage, { props: { question: question(), answer: '' } })
    expect(view.find('[data-testid="five-step-bar"]').exists()).toBe(false)
    expect(view.find('[data-testid="direct-answer"]').exists()).toBe(true)
    expect(view.text()).toContain(question().story.body)
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

  it('showRevealButton=false 时隐藏提示按钮，交由答题页动作区统一入口', () => {
    const view = mount(HintStack, { props: { hints: [], used: 0, showRevealButton: false } })
    expect(view.find('[data-testid="reveal-hint"]').exists()).toBe(false)
    expect(view.find('[data-testid="hint-layer"]').exists()).toBe(false)
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

  it('底部动作区按作答阶段渐进只显示两个按钮', async () => {
    const events: DomainEvent[] = [{
      eventId: 'started', profileId: 'profile', occurredAt: 1, type: 'session-started',
      sessionId: 'session', questionIds: ['basic'], difficultyTrace: [1],
    }]
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const view = mount(QuestView, {
      props: { sessionId: 'session', profileId: 'profile', questions: [question()], store },
    })
    await flushPromises()
    // 未作答：提交答案 + 我需要提示
    expect(view.find('[data-testid="action-submit"]').exists()).toBe(true)
    expect(view.find('[data-testid="action-hint"]').exists()).toBe(true)
    expect(view.find('[data-testid="action-next"]').exists()).toBe(false)
    expect(view.find('[data-testid="reveal-hint"]').exists()).toBe(false)

    // 答对：下一题 + 看答案详解
    await view.get('[data-key="7"]').trigger('click')
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="action-submit"]').exists()).toBe(false)
    expect(view.find('[data-testid="action-next"]').exists()).toBe(true)
    expect(view.find('[data-testid="action-explain"]').exists()).toBe(true)

    // 看答案详解：展开释义面板，且不写 answer-revealed（答对的题不该被降级）
    await view.get('[data-testid="action-explain"]').trigger('click')
    expect(view.find('[data-testid="answer-explanation"]').exists()).toBe(true)
    expect(events.some((event) => event.type === 'answer-revealed')).toBe(false)

    // 下一题：单题题组落到完成态
    await view.get('[data-testid="action-next"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="quest-completed"]').exists()).toBe(true)

    // 完成态必须有出口：只说"继续探索深海吧"而不给按钮 = 死路
    const back = view.get('[data-testid="quest-back-home"]')
    expect(back.text()).toContain('返回首页')
    await back.trigger('click')
    expect(view.emitted('go-home')).toEqual([[]])
  })

  it('答错后看答案展开五层提示与最终答案', async () => {
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
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    // 答错：提交答案 + 看答案
    expect(view.find('[data-testid="action-reveal"]').exists()).toBe(true)
    await view.get('[data-testid="action-reveal"]').trigger('click')
    await flushPromises()
    const panel = view.get('[data-testid="answer-explanation"]')
    expect(panel.findAll('[data-testid="explanation-hint"]')).toHaveLength(5)
    expect(panel.text()).toContain('审题提醒')
    expect(panel.text()).toContain('提示五')
    expect(panel.get('[data-testid="explanation-answer"]').text()).toContain('7')
    // 看过答案：只剩「下一题」
    expect(view.find('[data-testid="action-next"]').exists()).toBe(true)
    expect(view.find('[data-testid="action-reveal"]').exists()).toBe(false)
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
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    expect(view.find('[role="alert"]').exists()).toBe(false)
    expect(view.find('[data-testid="quiz-feedback"]').text()).toContain('再想想')
    expect(view.text()).not.toContain('答题失败')
    // 答错仍按规格自动展开提示链第一层
    expect(view.findAll('[data-testid="hint-layer"]')).toHaveLength(1)
    // 但答错态底部只留「提交答案 / 看答案」两个按钮，不再显示「我需要提示」
    expect(view.find('[data-testid="action-submit"]').exists()).toBe(true)
    expect(view.find('[data-testid="action-reveal"]').exists()).toBe(true)
    expect(view.find('[data-testid="action-hint"]').exists()).toBe(false)
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
    await view.get('[data-testid="action-hint"]').trigger('click')
    await flushPromises()
    expect(events.some((event) => event.type === 'hint-used' && event.level === 1)).toBe(true)
    // 「看答案」入口只在答错后出现：先提交一个错答案进入答错态
    await view.get('[data-key="8"]').trigger('click')
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    await view.get('[data-testid="action-reveal"]').trigger('click')
    await flushPromises()
    expect(events.some((event) => event.type === 'answer-revealed' && event.revealedAnswer === true)).toBe(true)
    expect(events.some((event) => event.type === 'session-completed')).toBe(false)
  })

  it('续做已看过答案的旧题组时提供继续练习，作答后才显示完成并发奖', async () => {
    // 旧版界面允许「直接看答案」而不先作答，留下的会话可能整组只被 reveal、
    // 没有任何 answer-submitted。这种"未完成"的存量会话在新界面里仍要能续做：
    // 这里用已落库的 answer-revealed 事件重放该状态（新界面本身已不允许
    // 不作答就 reveal，故无法从 UI 点击走到这里）。
    const events: DomainEvent[] = [
      {
        eventId: 'started', profileId: 'profile', occurredAt: 1, type: 'session-started',
        sessionId: 'session', questionIds: ['basic', 'second'], difficultyTrace: [1, 1],
      },
      {
        eventId: 'reveal-1', profileId: 'profile', occurredAt: 2, type: 'answer-revealed',
        sessionId: 'session', questionId: 'basic', revealedAnswer: true,
      },
      {
        eventId: 'reveal-2', profileId: 'profile', occurredAt: 3, type: 'answer-revealed',
        sessionId: 'session', questionId: 'second', revealedAnswer: true,
      },
    ]
    const store = {
      async listEvents() { return [...events] },
      async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return [...events] },
    }
    const view = mount(QuestView, {
      props: { sessionId: 'session', profileId: 'profile', questions: [question(), question(false, 'second')], store },
    })
    await flushPromises()
    expect(view.find('[data-testid="quest-completed"]').exists()).toBe(false)
    expect(view.text()).toContain('已看完题目，但直接看答案不计入任务完成')
    expect(view.get('[data-testid="continue-practice"]').text()).toContain('继续练习')
    expect(events.some((event) => event.type === 'session-completed')).toBe(false)

    // 回到第一题作答：答错 8 → 订正为 7
    await view.get('[data-testid="continue-practice"]').trigger('click')
    expect(view.find('[data-testid="direct-answer"]').exists()).toBe(true)
    await view.get('[data-key="8"]').trigger('click')
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    await view.get('[data-key="backspace"]').trigger('click')
    await view.get('[data-key="7"]').trigger('click')
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    // 答对后停在本题，点「下一题」后再续做第二题
    await view.get('[data-testid="action-next"]').trigger('click')
    await flushPromises()
    await view.get('[data-testid="continue-practice"]').trigger('click')
    await view.get('[data-key="7"]').trigger('click')
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    expect(events.some((event) => event.type === 'session-completed')).toBe(true)
    // 答对后停在本题：点「下一题」才落到完成态
    await view.get('[data-testid="action-next"]').trigger('click')
    await flushPromises()
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
    await view.get('[data-testid="action-submit"]').trigger('click')
    await flushPromises()
    expect(view.find('[role="status"]').text()).toContain('暂时无法保存')
    expect(JSON.stringify(logs)).not.toContain('sensitive-value')
  })
})

describe('QuizStage choice questions', () => {
  function choiceQuestion(): Question {
    return createQuestion({
      id: 'choice-1', type: 'add-sub', difficulty: 1, category: 'basic',
      format: 'choice',
      story: { title: '选择答案', body: '3 + 4 等于几？' },
      hints: ['读题', '看加数', '相加', '列式 3+4', '先算三加四'],
      options: [
        { id: 'A', label: '6' },
        { id: 'B', label: '7' },
        { id: 'C', label: '8' },
        { id: 'D', label: '9' },
      ],
      answer: { value: 7, optionId: 'B' },
      similarQuestionIds: [], tags: [], sources: ['test'],
    })
  }

  it('renders four options and no number pad', () => {
    const wrapper = mount(QuizStage, { props: { question: choiceQuestion(), answer: '' } })
    expect(wrapper.find('[data-testid="choice-options"]').exists()).toBe(true)
    for (const id of ['A', 'B', 'C', 'D']) {
      expect(wrapper.find(`[data-testid="choice-${id}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('.numpad').exists()).toBe(false)
  })

  it('emits the selected option id', async () => {
    const wrapper = mount(QuizStage, { props: { question: choiceQuestion(), answer: '' } })
    await wrapper.get('[data-testid="choice-B"]').trigger('click')
    expect(wrapper.emitted('update:answer')?.at(-1)).toEqual(['B'])
  })
})
