import type { DomainEvent, Profile } from '@/domain/model/types'
import { useFamilyOverview } from '@/features/parentPanel/useFamilyOverview'

import { makeParentStore } from './makeParentStore'

const DAY = 86_400_000
const profiles: Profile[] = [
  { id: 'a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'h', salt: 's', createdAt: 1 },
  { id: 'b', nickname: '珊瑚', avatarId: 'avatar-2', pinHash: 'h', salt: 's', createdAt: 1 },
]

const events: DomainEvent[] = [
  { type: 'session-started', eventId: 's1', profileId: 'a', occurredAt: 1000, sessionId: 'q-a', questionIds: ['a1', 'a2'], difficultyTrace: [1] },
  { type: 'answer-submitted', eventId: 'e1', profileId: 'a', occurredAt: 2000, sessionId: 'q-a', questionId: 'a1', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 1000 },
  { type: 'answer-submitted', eventId: 'e2', profileId: 'a', occurredAt: 3000, sessionId: 'q-a', questionId: 'a2', submitted: '1', correct: true, usedHintLevel: 1, retryCount: 0, ms: 3000 },
  { type: 'hint-used', eventId: 'h1', profileId: 'a', occurredAt: 2500, sessionId: 'q-a', questionId: 'a2', level: 1 },
  { type: 'answer-submitted', eventId: 'e3', profileId: 'b', occurredAt: 4000, sessionId: 'q-b', questionId: 'b1', submitted: '9', correct: false, usedHintLevel: 0, retryCount: 0, ms: 500 },
]

const questionTypeById = { a1: 'add-sub', a2: 'mul-div', b1: 'two-step-app' } as const

describe('useFamilyOverview', () => {
  it('derives per-child weekly stats and a focus hint from a single projection pass', async () => {
    const fake = makeParentStore({ profiles, events })
    const overview = useFamilyOverview({ store: fake.store, clock: () => 5000, questionTypeById })

    await overview.load()

    const [childA, childB] = overview.children.value
    expect(childA).toMatchObject({ profileId: 'a', nickname: '海星', daysStudied: 1, completedQuestions: 2, averageMs: 2000 })
    // 最弱项是"提示后掌握"的乘除法，而不是已独立的加减法。
    expect(childA.focusHint).toContain('乘除法')
    expect(childB).toMatchObject({ profileId: 'b', nickname: '珊瑚', daysStudied: 1, completedQuestions: 0, averageMs: 0 })
    expect(childB.focusHint).toContain('两步应用题')
  })

  it('counts only events from the last seven days', async () => {
    const old: DomainEvent = { type: 'answer-submitted', eventId: 'old', profileId: 'a', occurredAt: 5000 - 8 * DAY, sessionId: 'q-old', questionId: 'a9', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 9000 }
    const fake = makeParentStore({ profiles, events: [...events, old] })
    const overview = useFamilyOverview({ store: fake.store, clock: () => 5000, questionTypeById })

    await overview.load()

    expect(overview.children.value[0]).toMatchObject({ completedQuestions: 2, averageMs: 2000 })
  })

  it('falls back to a neutral hint when no topic table is injected', async () => {
    const fake = makeParentStore({ profiles, events })
    const overview = useFamilyOverview({ store: fake.store, clock: () => 5000 })

    await overview.load()

    expect(overview.children.value[0].focusHint).toContain('学习记录')
  })

  it('returns no children when the device has no profile yet', async () => {
    const overview = useFamilyOverview({ store: makeParentStore().store, clock: () => 5000 })

    await overview.load()

    expect(overview.children.value).toEqual([])
  })
})
