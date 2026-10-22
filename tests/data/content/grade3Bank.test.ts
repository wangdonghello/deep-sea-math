import { describe, expect, it } from 'vitest'

import { QUESTION_BANK, QUESTION_INDEX } from '@/data/content'
import { assertValidQuestionBank } from '@/data/content/schema'

describe('grade 3 question bank', () => {
  it('has 216 grade 3 questions and at least 72 choice questions', () => {
    const questions = QUESTION_BANK.questions
    expect(questions).toHaveLength(216)
    expect(questions.every((question) => question.grade === 3)).toBe(true)
    expect(questions.filter((question) => question.format === 'choice')).toHaveLength(72)
    expect(questions.filter((question) => question.category === 'applied')).toHaveLength(72)
  })

  it('keeps all choice questions valid and unique', () => {
    const choices = QUESTION_BANK.questions.filter((question) => question.format === 'choice')
    for (const question of choices) {
      expect(question.options, question.id).toHaveLength(4)
      expect(question.options!.map((option) => option.label)).toHaveLength(new Set(question.options!.map((option) => option.label)).size)
      expect(question.options!.some((option) => option.id === question.answer.optionId), question.id).toBe(true)
      expect(question.answer.expression, question.id).toBeUndefined()
    }
  })

  it('exposes a grade 3 index bucket', () => {
    expect(QUESTION_INDEX.byGrade[3]).toHaveLength(216)
    expect(QUESTION_INDEX.byGrade[1]).toHaveLength(0)
    expect(QUESTION_INDEX.byGrade[2]).toHaveLength(0)
  })

  it('validates the full grade 3 bank without partial mode', () => {
    expect(() => assertValidQuestionBank({ version: '4.0.0', questions: QUESTION_BANK.questions })).not.toThrow()
  })
})
