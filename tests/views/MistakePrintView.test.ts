import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DomainEvent, QuizType } from '@/domain/model/types'
import MistakePrintView from '@/views/MistakePrintView.vue'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'

const profileId = 'p1'
const catalog = {
  q1: {
    type: 'add-sub' as QuizType,
    story: { title: '魔法书', body: '魔法图书馆里有 126 本书，又送来 212 本，一共有多少本？' },
    options: [
      { id: 'A' as const, label: '328' },
      { id: 'B' as const, label: '338' },
      { id: 'C' as const, label: '348' },
      { id: 'D' as const, label: '358' },
    ],
    answer: { value: 338, unit: '本', optionId: 'B' as const },
    hints: ['读题', '找数量', '把两部分合起来', '列式 126+212', '先算一百多，再合并。'],
    similarQuestionIds: [],
  },
}
const events: DomainEvent[] = [
  { eventId: 'e1', profileId, occurredAt: 1, type: 'answer-submitted', sessionId: 's1', questionId: 'q1', submitted: 'A', correct: false, usedHintLevel: 0, retryCount: 0, ms: 10 },
]

beforeEach(() => {
  setActivePinia(createPinia())
  useProfileSessionStore().setActive({ profileId, nickname: '小魔法师', avatarId: 'angler' })
})

describe('MistakePrintView', () => {
  it('renders question and answer pages from the filtered mistakes', async () => {
    const view = mount(MistakePrintView, {
      props: {
        store: { listEvents: async () => events },
        catalog,
        filter: { type: 'all', masteryLevel: 'all' },
      },
    })
    await flushPromises()
    expect(view.get('[data-testid="print-question"]').text()).toContain('126')
    expect(view.get('[data-testid="print-answers"]').text()).toContain('正确答案')
    expect(view.get('[data-testid="print-answers"]').text()).toContain('338')
    expect(view.get('[data-testid="print-answers"]').text()).toContain('A. 328')
  })

  it('has a print button', async () => {
    const view = mount(MistakePrintView, {
      props: {
        store: { listEvents: async () => events },
        catalog,
        filter: { type: 'all', masteryLevel: 'all' },
      },
    })
    await flushPromises()
    expect(view.find('[data-testid="print-button"]').exists()).toBe(true)
  })
})
