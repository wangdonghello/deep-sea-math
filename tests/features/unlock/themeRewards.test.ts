import { describe, expect, it } from 'vitest'

import { useUnlockFeedback } from '@/features/unlock/useUnlockFeedback'
import type { DomainEvent } from '@/domain/model/types'

const now = Date.now() + 5_000

function events(): DomainEvent[] {
  return [
    { eventId: 's1', profileId: 'p1', occurredAt: now, type: 'session-started', sessionId: 's1', questionIds: [], difficultyTrace: [] },
    { eventId: 'c1', profileId: 'p1', occurredAt: now + 1, type: 'session-completed', sessionId: 's1', rewards: ['quest-complete'] },
    { eventId: 'u1', profileId: 'p1', occurredAt: now + 2, type: 'unlock-granted', targetId: 'johnson-anglerfish', kind: 'creature', reason: 's1' },
  ]
}

describe('useUnlockFeedback theme rewards', () => {
  it('shows the current theme entries instead of deep-sea unlocks', async () => {
    const feedback = useUnlockFeedback({
      store: { listEvents: async () => events() },
      profileId: 'p1',
      themeId: 'space',
      pollIntervalMs: 0,
    })
    feedback.start()
    await feedback.check()
    const labels = feedback.rewards.value.map((reward) => reward.label)
    expect(labels).toContain('整组完成徽章')
    expect(labels.some((label) => label.includes('月球'))).toBe(true)
    expect(labels.some((label) => label.includes('火星'))).toBe(true)
    expect(labels.some((label) => label.includes('鮟鱇'))).toBe(false)
    feedback.stop()
  })
})
