import { describe, expect, it } from 'vitest'

import type { SessionStartedEvent, SubjectId } from '@/domain/model/types'

describe('subject', () => {
  it('题组可以标注学科', () => {
    const subject: SubjectId = 'chinese'
    const event: SessionStartedEvent = {
      eventId: 's', profileId: 'p1', occurredAt: 1, type: 'session-started',
      sessionId: 's1', questionIds: ['cn-001'], difficultyTrace: [], subject,
    }
    expect(event.subject).toBe('chinese')
  })
})
