import { describe, expect, it } from 'vitest'

import { QUESTION_BANK_BY_GRADE } from '@/data/content'

describe('grade 1/2 two-step answer semantics', () => {
  for (const grade of [1, 2] as const) {
    it(`grade ${grade}: 算的是题干描述的操作顺序，而不是固定 a+b-c`, () => {
      const questions = QUESTION_BANK_BY_GRADE[grade]?.questions.filter(
        (question) => question.type === 'two-step-app',
      ) ?? []
      expect(questions.length).toBeGreaterThan(0)
      for (const question of questions) {
        const numbers = question.story.body.match(/\d+/g)?.map(Number) ?? []
        expect(numbers.length, question.story.body).toBeGreaterThanOrEqual(3)
        const [a, b, c] = numbers
        const increaseThenDecrease = /(来了.*(?:走|离开|转移走))/.test(question.story.body)
        const expected = increaseThenDecrease ? a + b - c : a - b + c
        expect(question.answer.value, question.story.body).toBe(expected)
      }
    })
  }
})
