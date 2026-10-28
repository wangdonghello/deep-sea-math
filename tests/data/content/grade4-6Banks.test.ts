import { describe, expect, it } from 'vitest'

import { QUESTION_BANK_BY_GRADE } from '@/data/content'

const GRADES = [4, 5, 6] as const
const TYPES = ['number-sense', 'mul-div', 'two-step-app', 'unknown-relation', 'unit-time-route', 'pattern-data'] as const

describe('grade 4–6 question banks', () => {
  for (const grade of GRADES) {
    const bank = QUESTION_BANK_BY_GRADE[grade]

    it(`grade ${grade} has 216 questions with balanced type/difficulty cells`, () => {
      expect(bank.questions).toHaveLength(216)
      for (const type of TYPES) {
        const ofType = bank.questions.filter((question) => question.type === type)
        expect(ofType, type).toHaveLength(36)
        for (const difficulty of [1, 2, 3] as const) {
          const cell = ofType.filter((question) => question.difficulty === difficulty)
          expect(cell, `${type} d${difficulty}`).toHaveLength(12)
          expect(cell.filter((question) => question.format === 'choice')).toHaveLength(4)
          expect(cell.filter((question) => question.format === 'open')).toHaveLength(8)
        }
      }
      expect(bank.questions.filter((question) => question.format === 'choice')).toHaveLength(72)
    })

    it(`grade ${grade} has unique ids/bodies and only its own grade`, () => {
      expect(new Set(bank.questions.map((question) => question.id)).size).toBe(216)
      expect(new Set(bank.questions.map((question) => question.story.body)).size).toBeGreaterThan(100)
      expect(bank.questions.every((question) => question.grade === grade)).toBe(true)
    })

    it(`grade ${grade} standards match the grade and source domain`, () => {
      for (const question of bank.questions) {
        const standards = question.tags.filter((tag) => tag.startsWith('standard:'))
        expect(standards.length, question.id).toBeGreaterThan(0)
        for (const tag of standards) {
          const match = /^standard:(\d+)\.([A-Z]+)\./.exec(tag)
          expect(match, `${question.id} ${tag}`).not.toBeNull()
          expect(match?.[1]).toBe(String(grade))
          const domain = match?.[2]
          expect(question.sources.some((source) => source.includes(`/Math/Content/${grade}/${domain}/`)), question.id).toBe(true)
        }
      }
    })

    it(`grade ${grade} covers at least five curriculum domains`, () => {
      const domains = new Set(bank.questions.flatMap((question) =>
        question.tags
          .filter((tag) => tag.startsWith('standard:'))
          .map((tag) => tag.split('.')[1]),
      ))
      expect(domains.size, [...domains].join(',')).toBeGreaterThanOrEqual(5)
    })

    it(`grade ${grade} choice options are unique and include the answer`, () => {
      for (const question of bank.questions.filter((item) => item.format === 'choice')) {
        const labels = question.options?.map((option) => option.label) ?? []
        expect(labels, question.id).toHaveLength(4)
        expect(new Set(labels).size, question.id).toBe(4)
        const optionId = question.answer.optionId
        const correct = question.options?.find((option) => option.id === optionId)
        expect(correct?.label, question.id).toBe(`${question.answer.value}${question.answer.unit ?? ''}`)
      }
    })
  }
})
