import { describe, expect, it } from 'vitest'

import { QUESTION_BANK_BY_GRADE } from '@/data/content'
import { buildDailyQuest } from '@/domain/quiz/buildDailyQuest'
import type { Settings } from '@/domain/model/types'

const settings: Settings = { basicCount: 4, appliedCount: 4, probeCount: 1, maxMinutes: 15 }

describe('daily quest type balance on real banks', () => {
  for (const grade of [2, 3] as const) {
    it(`grade ${grade} mixes at least three question types`, () => {
      const pool = QUESTION_BANK_BY_GRADE[grade]?.questions ?? []
      const quest = buildDailyQuest({
        profileId: 'p1', settings, pool, grade, themeId: grade === 3 ? 'deep-sea' : undefined,
        history: { profileId: 'p1', events: [], now: Date.UTC(2026, 9, 22) },
        clock: () => Date.UTC(2026, 9, 22), idGenerator: (() => { let n = 0; return () => `id-${++n}` })(),
      })
      const byId = new Map(pool.map((question) => [question.id, question]))
      const types = new Set(quest.questionIds.map((id) => byId.get(id)?.type))
      expect(types.size).toBe(6)
      expect(types.has('mul-div')).toBe(true)
      expect(types.has('unit-time-route')).toBe(true)
      expect(types.has('pattern-data')).toBe(true)

      let nextId = 0
      const nextDay = buildDailyQuest({
        profileId: 'p1', settings, pool, grade, themeId: grade === 3 ? 'deep-sea' : undefined,
        history: { profileId: 'p1', events: [], now: Date.UTC(2026, 9, 23) },
        clock: () => Date.UTC(2026, 9, 23), idGenerator: () => `next-${++nextId}`,
      })
      expect(nextDay.questionIds).not.toEqual(quest.questionIds)
      expect(nextDay.questionIds.some((id) => !quest.questionIds.includes(id))).toBe(true)
    })
  }
})
