import { describe, expect, it } from 'vitest'

import { QUESTION_BANK_BY_GRADE } from '@/data/content'

const scene = /洛克王国|魔法学院|宠物园|天空城|彩虹湿地|咕噜球工坊|星辉广场|魔法图书馆|云朵农场|星际驿站|魔法列车/

describe('grade 2/3 curriculum mix', () => {
  for (const grade of [2, 3] as const) {
    it(`grade ${grade} stories use Roco scenes and include ordering/rank`, () => {
      const questions = QUESTION_BANK_BY_GRADE[grade]?.questions ?? []
      expect(questions).toHaveLength(216)
      expect(questions.every((question) => scene.test(question.story.body))).toBe(true)
      expect(questions.filter((question) => question.tags.includes('ordering')).length).toBeGreaterThanOrEqual(6)
      expect(questions.filter((question) => question.tags.includes('ordinal')).length).toBeGreaterThanOrEqual(2)
    })
  }

  it('grade 2 time/distance contexts include comparison and total questions', () => {
    const questions = QUESTION_BANK_BY_GRADE[2]?.questions.filter((question) => question.type === 'unit-time-route') ?? []
    expect(questions.some((question) => question.story.body.includes('远多少'))).toBe(true)
    expect(questions.some((question) => question.story.body.includes('多用'))).toBe(true)
    expect(questions.some((question) => question.story.body.includes('一共'))).toBe(true)
  })
})
