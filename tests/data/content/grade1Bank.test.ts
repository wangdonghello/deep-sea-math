import { describe, expect, it } from 'vitest'

import { GRADE1_BANK, QUESTION_INDEX_BY_GRADE } from '@/data/content'
import { assertValidQuestionBank } from '@/data/content/schema'

describe('grade 1 question bank', () => {
  it('has 216 grade 1 questions without multiplication or division', () => {
    expect(GRADE1_BANK.questions).toHaveLength(216)
    expect(GRADE1_BANK.questions.every((question) => question.grade === 1)).toBe(true)
    expect(GRADE1_BANK.questions.some((question) => question.type === 'mul-div')).toBe(false)
    expect(GRADE1_BANK.questions.some((question) => question.type === 'number-sense')).toBe(true)
  })

  it('has 72 choice and 72 applied questions', () => {
    expect(GRADE1_BANK.questions.filter((question) => question.format === 'choice')).toHaveLength(72)
    expect(GRADE1_BANK.questions.filter((question) => question.category === 'applied')).toHaveLength(72)
  })

  it('passes the full grade 1 validation', () => {
    expect(() => assertValidQuestionBank({ version: '4.0.0', questions: GRADE1_BANK.questions })).not.toThrow()
  })

  it('builds a grade 1 index bucket', () => {
    expect(QUESTION_INDEX_BY_GRADE[1].byGrade[1]).toHaveLength(216)
  })
})
