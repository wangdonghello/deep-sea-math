import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FreePracticePanel from '@/features/pet/FreePracticePanel.vue'

type PanelVm = { question: { id: string; answer: { value: unknown } } }
const vmOf = (view: { vm: unknown }): PanelVm => view.vm as PanelVm

describe('FreePracticePanel', () => {
  it('答对后 emit 正确答案，答错 emit false', async () => {
    const view = mount(FreePracticePanel, { props: { grade: 3 } })
    const question = vmOf(view).question
    expect(question).toBeDefined()
    const input = view.get('[data-testid="free-practice-input"]')
    await input.setValue(String(question.answer.value))
    await view.get('form').trigger('submit')
    expect(view.emitted('answer')?.[0]).toEqual([question.id, true])
  })

  it('可以进入下一题', async () => {
    const view = mount(FreePracticePanel, { props: { grade: 3 } })
    const first = vmOf(view).question.id
    const input = view.get('[data-testid="free-practice-input"]')
    await input.setValue('not-an-answer')
    await view.get('form').trigger('submit')
    await view.get('[data-testid="free-practice-next"]').trigger('click')
    expect(vmOf(view).question.id).not.toBe(first)
  })
})
