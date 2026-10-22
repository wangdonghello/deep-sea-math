import { effectScope } from 'vue'
import { describe, expect, it } from 'vitest'

import { useThemeCollection } from '@/features/bestiary/useThemeCollection'
import type { DomainEvent } from '@/domain/model/types'

const profileId = 'p1'
const events: DomainEvent[] = [
  { eventId: 's1', profileId, occurredAt: 1, type: 'session-started', sessionId: 's1', questionIds: [], difficultyTrace: [] },
  { eventId: 'c1', profileId, occurredAt: 2, type: 'session-completed', sessionId: 's1', rewards: [] },
]

function mountCollection(themeId: 'deep-sea' | 'dinosaur' | 'space', seed: DomainEvent[] = events) {
  const scope = effectScope()
  const result = scope.run(() => useThemeCollection({
    store: { listEvents: async () => seed },
    profileId,
    themeId,
  }))!
  return { result, scope }
}

describe('useThemeCollection', () => {
  it('unlocks entries by completed sessions, capped at four', async () => {
    const { result, scope } = mountCollection('dinosaur')
    await result.load()
    expect(result.stage.value).toBe(1)
    expect(result.items.value.filter((item) => item.unlocked)).toHaveLength(2)
    scope.stop()
  })

  it('switches pack without losing the stage', async () => {
    const { result, scope } = mountCollection('dinosaur')
    await result.load()
    expect(result.pack.value.id).toBe('dinosaur')
    scope.stop()
  })
})
