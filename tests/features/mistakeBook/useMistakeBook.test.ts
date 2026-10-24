import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import type { DomainEvent, QuizType } from '@/domain/model/types'
import { useMistakeBook } from '@/features/mistakeBook/useMistakeBook'

const profileId = 'p-current'
const catalog = {
  q1: { type: 'add-sub' as QuizType, similarQuestionIds: ['sim-1'] },
  q2: { type: 'add-sub' as QuizType, similarQuestionIds: [] },
  q3: { type: 'add-sub' as QuizType, similarQuestionIds: [] },
  foreign: { type: 'mul-div' as QuizType, similarQuestionIds: [] },
}

function harness(events: readonly DomainEvent[], logger?: (entry: Record<string, unknown>) => void) {
  let book!: ReturnType<typeof useMistakeBook>
  const store = { async listEvents() { return events } }
  const wrapper = mount(defineComponent({
    setup() {
      book = useMistakeBook(ref(profileId), store, catalog, logger)
      return () => h('div')
    },
  }))
  return { book, wrapper }
}

const independent = (eventId: string, questionId: string): DomainEvent => ({
  eventId, profileId, occurredAt: Number(eventId), type: 'answer-submitted', sessionId: 's-1',
  questionId, submitted: 'correct', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10,
})

describe('useMistakeBook', () => {
  it('isolates mixed-profile event streams before projecting mistakes', async () => {
    const mixedEvents: DomainEvent[] = [
      { eventId: 'wrong-current', profileId, occurredAt: 1, type: 'answer-submitted', sessionId: 's-1', questionId: 'q1', submitted: 'wrong', correct: false, usedHintLevel: 0, retryCount: 0, ms: 10 },
      { eventId: 'wrong-foreign', profileId: 'p-other', occurredAt: 2, type: 'answer-submitted', sessionId: 's-2', questionId: 'foreign', submitted: 'wrong', correct: false, usedHintLevel: 0, retryCount: 0, ms: 10 },
    ]
    const { book, wrapper } = harness(mixedEvents)
    await flushPromises()
    expect(book.items.value.map((item) => item.questionId)).toEqual(['q1'])
    wrapper.unmount()
  })

  it('matches stable by topic mastery while retaining independent question mastery', async () => {
    const events: DomainEvent[] = [independent('1', 'q1'), independent('2', 'q2'), independent('3', 'q3'),
      { eventId: '4', profileId, occurredAt: 4, type: 'answer-submitted', sessionId: 's-1', questionId: 'q1', submitted: 'wrong', correct: false, usedHintLevel: 0, retryCount: 0, ms: 10 }]
    const { book, wrapper } = harness(events)
    await flushPromises()
    book.filter.value = { type: 'all', masteryLevel: 'stable' }
    expect(book.visibleItems.value.map((item) => item.questionId)).toEqual(['q1'])
    expect(book.items.value[0]).toMatchObject({ questionMasteryLevel: 'independent', topicMasteryLevel: 'stable' })
    wrapper.unmount()
  })

  it('连续独立答对两次的错题会移出错题本并计入修复进度', async () => {
    const events: DomainEvent[] = [
      { eventId: 'wrong-1', profileId, occurredAt: 1, type: 'answer-submitted', sessionId: 's-1', questionId: 'q1', submitted: 'wrong', correct: false, usedHintLevel: 0, retryCount: 0, ms: 10 },
      { eventId: 'p1', profileId, occurredAt: 2, type: 'answer-submitted', sessionId: 'practice-q1-a', questionId: 'q1', submitted: '7', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
      { eventId: 'p2', profileId, occurredAt: 3, type: 'answer-submitted', sessionId: 'practice-q1-b', questionId: 'q1', submitted: '7', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
    ]
    const { book, wrapper } = harness(events)
    await flushPromises()

    expect(book.items.value).toEqual([])
    expect(book.practiceProgress.value).toMatchObject({ stars: 2, fixedQuestionIds: ['q1'] })
    wrapper.unmount()
  })

  it('logs a fixed failure category without error message or credentials', async () => {
    const logs: Record<string, unknown>[] = []
    let book!: ReturnType<typeof useMistakeBook>
    const store = { async listEvents() { throw new Error('token=secret-123') } }
    const wrapper = mount(defineComponent({
      setup() {
        book = useMistakeBook(ref(profileId), store, catalog, (entry) => logs.push(entry))
        return () => h('div')
      },
    }))
    await flushPromises()
    expect(book.errorMessage.value).toContain('暂时无法打开')
    expect(logs).toEqual([{ event: 'mistake-book-load-failed', errorType: 'read-failed' }])
    expect(JSON.stringify(logs)).not.toContain('secret-123')
    expect(JSON.stringify(logs)).not.toContain('token=')
    wrapper.unmount()
  })
})
