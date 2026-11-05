import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ChineseQuestView from '@/views/ChineseQuestView.vue'
import type { DomainEvent } from '@/domain/model/types'
import type { ChineseQuestion } from '@/domain/chinese/types'

const questions: ChineseQuestion[] = [
  {
    id: 'q1', subject: 'chinese', grade: 1, difficulty: 1, kind: 'pinyin', skill: 'pinyin-tone',
    prompt: '“mā” 的声调？', options: [{ id: 'A', label: '第一声' }, { id: 'B', label: '第二声' }],
    answer: { value: '第一声', optionId: 'A' }, explanation: 'ā 是第一声', hints: ['a', 'b'], tags: [],
  },
  {
    id: 'q2', subject: 'chinese', grade: 1, difficulty: 1, kind: 'character', skill: 'character-recognition',
    prompt: '“rì” 是哪个字？', options: [{ id: 'A', label: '日' }, { id: 'B', label: '目' }],
    answer: { value: '日', optionId: 'A' }, explanation: 'rì 是日', hints: ['a', 'b'], tags: [],
  },
]

function makeStore() {
  const events: DomainEvent[] = []
  return {
    events,
    async appendEvents(incoming: readonly DomainEvent[]) {
      events.push(...incoming)
      return incoming
    },
  }
}

describe('ChineseQuestView', () => {
  it('答完题写入 started/answers/completed 并 emit complete', async () => {
    const store = makeStore()
    const view = mount(ChineseQuestView, {
      props: { profileId: 'p1', store, questions, passages: [], clock: () => 100 },
    })
    await flushPromises()
    expect(store.events[0].type).toBe('session-started')
    expect((store.events[0] as { subject?: string }).subject).toBe('chinese')

    await view.get('[data-testid="option-A"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('答对了')
    await view.get('[data-testid="chinese-next"]').trigger('click')

    await view.get('[data-testid="option-A"]').trigger('click')
    await flushPromises()
    await view.get('[data-testid="chinese-next"]').trigger('click')
    await flushPromises()

    expect(store.events.filter((event) => event.type === 'answer-submitted')).toHaveLength(2)
    expect(store.events.at(-1)?.type).toBe('session-completed')
    expect(view.emitted('complete')).toHaveLength(1)
  })
})
