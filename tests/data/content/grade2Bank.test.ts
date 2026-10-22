import { describe, expect, it } from 'vitest'

import { GRADE2_BANK, QUESTION_INDEX_BY_GRADE } from '@/data/content'
import { assertValidQuestionBank } from '@/data/content/schema'

describe('grade 2 question bank', () => {
  it('has 216 grade 2 questions and at least 72 choice questions', () => {
    expect(GRADE2_BANK.questions).toHaveLength(216)
    expect(GRADE2_BANK.questions.every((question) => question.grade === 2)).toBe(true)
    expect(GRADE2_BANK.questions.filter((question) => question.format === 'choice')).toHaveLength(72)
    expect(GRADE2_BANK.questions.filter((question) => question.category === 'applied')).toHaveLength(72)
  })

  it('keeps grade 2 multiplication within the multiplication table', () => {
    const mulDiv = GRADE2_BANK.questions.filter((question) => question.type === 'mul-div')
    expect(mulDiv.length).toBeGreaterThan(0)
    expect(mulDiv.every((question) => question.answer.value <= 81)).toBe(true)
  })

  it('passes the full grade 2 validation', () => {
    expect(() => assertValidQuestionBank({ version: '4.0.0', questions: GRADE2_BANK.questions })).not.toThrow()
  })

  it('builds a grade 2 index bucket', () => {
    expect(QUESTION_INDEX_BY_GRADE[2].byGrade[2]).toHaveLength(216)
  })
})
