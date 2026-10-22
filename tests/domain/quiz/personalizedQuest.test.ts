import { describe, expect, it } from 'vitest'

import { GRADE1_BANK, QUESTION_BANK } from '@/data/content'
import { buildDailyQuest } from '@/domain/quiz/buildDailyQuest'
import type { Settings } from '@/domain/model/types'

const settings: Settings = { basicCount: 4, appliedCount: 4, probeCount: 1, maxMinutes: 15 }
const history = { profileId: 'p1', events: [], now: 1_700_000_000_000 }

describe('personalized daily quest', () => {
  it('filters by grade and records a grade/theme snapshot', () => {
    const pool = [
      ...GRADE1_BANK.questions.map((question) => question.category === 'applied'
        ? { ...question, themeStories: { dinosaur: { title: '恐龙', body: `恐龙：${question.story.body}` } } }
        : question),
      { ...QUESTION_BANK.questions[0], id: 'grade3-only', grade: 3 as const },
    ]
    const result = buildDailyQuest({
      profileId: 'p1', grade: 1, themeId: 'dinosaur', settings, history, pool,
    })

    expect(result.session.grade).toBe(1)
    expect(result.session.themeId).toBe('dinosaur')
    expect(result.sessionStartedEvent.grade).toBe(1)
    expect(result.sessionStartedEvent.themeId).toBe('dinosaur')
    expect(result.session.questionIds).toHaveLength(9)
    expect(result.session.questionIds).not.toContain('grade3-only')
  })

  it('keeps at least two themed questions when available', () => {
    const pool = GRADE1_BANK.questions.map((question) => question.category === 'applied'
      ? { ...question, themeStories: { dinosaur: { title: '恐龙', body: `恐龙：${question.story.body}` } } }
      : question)
    const result = buildDailyQuest({
      profileId: 'p1', grade: 1, themeId: 'dinosaur', settings, history, pool,
    })
    const themed = result.session.questionIds.filter((id) => {
      const question = pool.find((candidate) => candidate.id === id)
      return question?.themeStories?.dinosaur !== undefined
    })
    expect(themed.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to same-grade neutral questions when the theme has no stories', () => {
    const result = buildDailyQuest({
      profileId: 'p1', grade: 1, themeId: 'space', settings, history, pool: GRADE1_BANK.questions,
    })
    expect(result.session.questionIds).toHaveLength(9)
    expect(result.session.questionIds.every((id) => GRADE1_BANK.questions.some((question) => question.id === id))).toBe(true)
  })
})
