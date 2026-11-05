import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ChineseQuestionCard from '@/features/chinese/ChineseQuestionCard.vue'
import type { ChineseQuestion } from '@/domain/chinese/types'

const question: ChineseQuestion = {
  id: 'q1', subject: 'chinese', grade: 1, difficulty: 1, kind: 'pinyin',
  skill: 'pinyin-tone', prompt: '“mā” 的声调？',
  options: [{ id: 'A', label: '第一声' }, { id: 'B', label: '第二声' }],
  answer: { value: '第一声', optionId: 'A' },
  explanation: 'ā 是第一声', hints: ['看声调符号', 'ā 是平的'], tags: [],
}

describe('ChineseQuestionCard', () => {
  it('渲染题干与选项，点击后 emit answer', async () => {
    const view = mount(ChineseQuestionCard, { props: { question } })
    expect(view.text()).toContain('mā')
    await view.get('[data-testid="option-A"]').trigger('click')
    expect(view.emitted('answer')?.[0]).toEqual(['q1', 'A'])
  })

  it('阅读题显示短文', () => {
    const reading: ChineseQuestion = {
      ...question, kind: 'reading', passageId: 'p1',
    }
    const view = mount(ChineseQuestionCard, {
      props: {
        question: reading,
        passage: { id: 'p1', grade: 1, title: '小鱼', body: '小鱼在水里游。' },
      },
    })
    expect(view.text()).toContain('小鱼在水里游')
  })
})
