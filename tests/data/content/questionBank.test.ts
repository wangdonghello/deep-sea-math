import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { QUEST_CATEGORIES, QUIZ_TYPES } from '../../../src/domain/model/types'
import { assertValidQuestionBank } from '../../../src/data/content/schema'
import { CREATURE_BANK, QUESTION_BANK, QUESTION_INDEX } from '../../../src/data/content'

/** Loads the checked-in question bank as JSON so tests exercise shipped content. */
function readQuestionBank(): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/content/questionBank.json'), 'utf8'))
}

describe('question bank content', () => {
  it('contains 60–80 complete questions spanning all types and difficulties', () => {
    const bank = readQuestionBank() as { questions: Array<Record<string, any>> }
    expect(bank.questions.length).toBeGreaterThanOrEqual(60)
    expect(bank.questions.length).toBeLessThanOrEqual(80)
    assertValidQuestionBank(bank)

    for (const type of QUIZ_TYPES) {
      for (const difficulty of [1, 2, 3]) {
        const cell = bank.questions.filter((question) => question.type === type && question.difficulty === difficulty)
        expect(cell).toHaveLength(4)
        expect(QUEST_CATEGORIES.map((category) => cell.filter((question) => question.category === category).length))
          .toEqual([2, 1, 1])
      }
    }
    expect(QUESTION_INDEX.byCategory.basic).toHaveLength(36)
    expect(QUESTION_INDEX.byCategory.applied).toHaveLength(18)
    expect(QUESTION_INDEX.byCategory.probe).toHaveLength(18)
    expect(QUESTION_INDEX.byType['add-sub']).toHaveLength(12)
    expect(QUESTION_INDEX.byDifficulty[3]).toHaveLength(24)
    const creatureIds = new Set(CREATURE_BANK.creatures.map((creature) => creature.id))
    expect(QUESTION_BANK.questions.every((question) => creatureIds.has(question.creatureRef ?? ''))).toBe(true)
  })

  it('rejects a question with fewer than five hints', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[0].hints.pop()
    expect(() => assertValidQuestionBank(invalid)).toThrow(/questions/)
  })

  it('rejects dangling similar-question IDs', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[0].similarQuestionIds = ['not-in-bank']
    expect(() => assertValidQuestionBank(invalid)).toThrow(/similarQuestionIds/)
  })

  it('rejects an expression that does not produce its declared value', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[0].answer = { value: 9, expression: '2 × 3' }
    expect(() => assertValidQuestionBank(invalid)).toThrow(/expression/)
  })

  it('rejects category/five-step mismatches and empty sources', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[0].requiresFiveStep = true
    expect(() => assertValidQuestionBank(invalid)).toThrow(/questions/)

    const missingSources = structuredClone(bank)
    missingSources.questions[1].sources = []
    expect(() => assertValidQuestionBank(missingSources)).toThrow(/sources/)
  })

  it('rejects a guided question with missing or reordered steps', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const missingSteps = structuredClone(bank)
    delete missingSteps.questions[2].steps
    expect(() => assertValidQuestionBank(missingSteps)).toThrow(/steps/)

    const reorderedSteps = structuredClone(bank)
    reorderedSteps.questions[2].steps.reverse()
    expect(() => assertValidQuestionBank(reorderedSteps)).toThrow(/steps/)
  })
})
