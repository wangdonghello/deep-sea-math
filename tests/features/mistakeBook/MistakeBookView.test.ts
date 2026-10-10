import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DomainEvent, QuizType } from '@/domain/model/types'
import MistakeBookView from '@/views/MistakeBookView.vue'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'

const profileId = 'p-current'
const catalog = {
  'wrong-add': { type: 'add-sub' as QuizType, story: { title: '海星数贝壳' }, similarQuestionIds: ['sim-add'] },
  'wrong-mul': { type: 'mul-div' as QuizType, story: { title: '章鱼分珍珠' }, similarQuestionIds: ['sim-mul'] },
}

const events: DomainEvent[] = [
  { eventId: 'wrong-1', profileId, occurredAt: 100, type: 'answer-submitted', sessionId: 's-1', questionId: 'wrong-add', submitted: '2', correct: false, usedHintLevel: 0, retryCount: 0, ms: 10 },
  { eventId: 'reveal-1', profileId, occurredAt: 200, type: 'answer-revealed', sessionId: 's-1', questionId: 'wrong-mul', revealedAnswer: true },
  { eventId: 'foreign-1', profileId: 'p-other', occurredAt: 300, type: 'answer-submitted', sessionId: 's-2', questionId: 'foreign', submitted: '2', correct: false, usedHintLevel: 0, retryCount: 0, ms: 10 },
]

function mountView(seed: readonly DomainEvent[] = events) {
  const requestedProfiles: string[] = []
  const store = {
    async listEvents(id: string) {
      requestedProfiles.push(id)
      return seed
    },
  }
  const view = mount(MistakeBookView, { props: { store, catalog } })
  return { view, requestedProfiles }
}

beforeEach(() => {
  setActivePinia(createPinia())
  useProfileSessionStore().setActive({ profileId, nickname: '小深', avatarId: 'angler' })
})

describe('MistakeBookView', () => {
  it('没有当前档案时不读取存储，也不误显示为空错题本', async () => {
    useProfileSessionStore().clear()
    const { view, requestedProfiles } = mountView()
    await flushPromises()
    expect(requestedProfiles).toEqual([])
    expect(view.find('[data-testid="mistake-no-profile"]').exists()).toBe(true)
    expect(view.find('[data-testid="mistake-empty"]').exists()).toBe(false)
  })

  it('只加载当前档案的事件重放出的错题，并展示错题摘要', async () => {
    const { view, requestedProfiles } = mountView()
    await flushPromises()
    expect(requestedProfiles).toEqual([profileId])
    expect(view.text()).toContain('海星数贝壳')
    expect(view.text()).toContain('wrong-add')
    expect(view.text()).toContain('1')
    expect(view.text()).not.toContain('foreign')
  })

  it('按题型和掌握状态组合筛选投影记录', async () => {
    const { view } = mountView()
    await flushPromises()
    await view.get('[data-testid="filter-type"]').setValue('add-sub')
    await view.get('[data-testid="filter-mastery"]').setValue('unmastered')
    expect(view.findAll('[data-testid="mistake-entry"]')).toHaveLength(1)
    expect(view.text()).toContain('wrong-add')
    expect(view.text()).not.toContain('wrong-mul')
  })

  it('筛选无匹配项时保留错题本并提示可调整条件', async () => {
    const { view } = mountView()
    await flushPromises()
    await view.get('[data-testid="filter-type"]').setValue('pattern-data')
    expect(view.find('[data-testid="mistake-filter-empty"]').text()).toContain('调整筛选')
    expect(view.find('[data-testid="mistake-empty"]').exists()).toBe(false)
  })

  it('重练只发原题及 catalog 相似题，不写事件或导航', async () => {
    const { view } = mountView()
    await flushPromises()
    await view.get('[data-testid="practice-wrong-add"]').trigger('click')
    expect(view.emitted('practice')).toEqual([[
      { questionIds: ['wrong-add'], similarQuestionIds: ['sim-add'] },
    ]])
    expect(view.emitted('navigate')).toBeUndefined()
  })

  it('没有错题时展示温和空态而不是错误提示', async () => {
    const { view } = mountView([])
    await flushPromises()
    expect(view.find('[data-testid="mistake-empty"]').exists()).toBe(true)
    expect(view.find('[role="alert"]').exists()).toBe(false)
  })

  it('读取失败显示中性提示且日志不包含错误文本', async () => {
    const logs: Record<string, unknown>[] = []
    const view = mount(MistakeBookView, {
      props: {
        store: { async listEvents() { throw new Error('token=secret-123') } },
        catalog,
        logger: (entry) => logs.push(entry),
      },
    })
    await flushPromises()
    expect(view.get('[data-testid="mistake-error"]').text()).toContain('暂时无法打开')
    expect(JSON.stringify(logs)).toEqual(JSON.stringify([
      { event: 'mistake-book-load-failed', errorType: 'read-failed' },
    ]))
    expect(JSON.stringify(logs)).not.toContain('secret-123')
    expect(JSON.stringify(logs)).not.toContain('token=')
  })
})
