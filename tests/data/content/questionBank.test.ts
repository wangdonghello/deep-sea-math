import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { QUEST_CATEGORIES, QUIZ_TYPES } from '../../../src/domain/model/types'
import { assertValidQuestionBank } from '../../../src/data/content/schema'
import { CREATURE_BANK, QUESTION_BANK, QUESTION_INDEX } from '../../../src/data/content'

const PATTERN_SEQUENCE_SKILLS = [
  'skill-constant-difference-sequence',
  'skill-second-difference-sequence',
  'skill-square-number-sequence',
  'skill-doubling-sequence',
  'skill-double-and-add-one-sequence',
] as const

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
    for (const category of QUEST_CATEGORIES) {
      expect(QUESTION_INDEX.byCategory[category]).toEqual(bank.questions.filter((question) => question.category === category))
    }
    for (const type of QUIZ_TYPES) {
      expect(QUESTION_INDEX.byType[type]).toEqual(bank.questions.filter((question) => question.type === type))
      for (const difficulty of [1, 2, 3]) {
        const bucket = QUESTION_INDEX.byType[type].filter((question) => question.difficulty === difficulty)
        expect(bucket).toEqual(bank.questions.filter((question) => question.type === type && question.difficulty === difficulty))
        for (const category of QUEST_CATEGORIES) {
          const indexed = QUESTION_INDEX.byCategory[category].filter((question) => question.type === type && question.difficulty === difficulty)
          expect(indexed).toEqual(bank.questions.filter((question) => question.type === type && question.difficulty === difficulty && question.category === category))
        }
      }
    }
    for (const difficulty of [1, 2, 3] as const) {
      expect(QUESTION_INDEX.byDifficulty[difficulty]).toEqual(bank.questions.filter((question) => question.difficulty === difficulty))
    }
    const creatureIds = new Set(CREATURE_BANK.creatures.map((creature) => creature.id))
    expect(QUESTION_BANK.questions.every((question) => creatureIds.has(question.creatureRef ?? ''))).toBe(true)
  })

  it('rejects a question with fewer than five hints', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[0].hints.pop()
    expect(() => assertValidQuestionBank(invalid)).toThrow(/questions/)
  })

  it('rejects question sources without the skill-matched standards domain', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[0].sources = ['https://www.thecorestandards.org/']
    expect(() => assertValidQuestionBank(invalid)).toThrow(/standards domain/i)
    const invalidProtocol = structuredClone(bank)
    invalidProtocol.questions[0].sources = ['ftp://www.thecorestandards.org/Math/Content/3/NBT/']
    expect(() => assertValidQuestionBank(invalidProtocol)).toThrow(/HTTP\(S\)/i)
    const malformedUrl = structuredClone(bank)
    malformedUrl.questions[0].sources = ['https://']
    expect(() => assertValidQuestionBank(malformedUrl)).toThrow(/valid HTTP\(S\) URL/i)
    const mismatchedStandard = structuredClone(bank)
    mismatchedStandard.questions[36].tags = mismatchedStandard.questions[36].tags.map((tag: string) => tag === 'standard:3.OA.8' ? 'standard:3.OA.4' : tag)
    expect(() => assertValidQuestionBank(mismatchedStandard)).toThrow(/standard tag does not match/i)
    const wrongUnknownSkill = structuredClone(bank)
    wrongUnknownSkill.questions[36].tags = wrongUnknownSkill.questions[36].tags.map((tag: string) => tag === 'skill-addsub-unknown' ? 'skill-muldiv-unknown' : tag)
    expect(() => assertValidQuestionBank(wrongUnknownSkill)).toThrow(/expected skill-addsub-unknown/i)
  })

  it('rejects a sequence skill mislabeled as data-table standard with an MD source', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    const q062 = invalid.questions.find((question) => question.id === 'q062')!
    q062.tags = q062.tags.filter((tag: string) => tag !== 'standard:3.OA.9')
    q062.tags.push('standard:3.MD')
    q062.sources = ['https://www.thecorestandards.org/Math/Content/3/MD/']

    expect(() => assertValidQuestionBank(invalid)).toThrow(/standard tag does not match/i)
  })

  it('maps every pattern sequence skill to 3.OA.9 even when presented as a data table', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const patternQuestions = bank.questions.filter((question) => question.type === 'pattern-data')
    expect(patternQuestions.every((question) => question.tags.some((tag: string) => PATTERN_SEQUENCE_SKILLS.includes(tag as typeof PATTERN_SEQUENCE_SKILLS[number])))).toBe(true)

    for (const skill of PATTERN_SEQUENCE_SKILLS) {
      const candidate = structuredClone(bank)
      for (const question of candidate.questions.filter((item) => item.type === 'pattern-data')) {
        question.tags = question.tags.filter((tag: string) => !tag.startsWith('skill-') && !tag.startsWith('standard:'))
        question.tags.push(skill, 'standard:3.OA.9')
        question.sources = question.sources.map((source: string) =>
          source.replace(/\/Math\/Content\/3\/(?:OA|MD)\//, '/Math/Content/3/OA/'))
      }
      expect(() => assertValidQuestionBank(candidate), skill).not.toThrow()
    }
  })

  it('requires 60–80 questions and every type/difficulty bucket', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const tooSmall = structuredClone(bank)
    tooSmall.questions = tooSmall.questions.slice(0, 59)
    expect(() => assertValidQuestionBank(tooSmall)).toThrow(/60–80/)
    const tooLarge = structuredClone(bank)
    tooLarge.questions.push(...structuredClone(bank.questions.slice(0, 9)))
    expect(() => assertValidQuestionBank(tooLarge)).toThrow(/60–80/)
    const missingBucket = structuredClone(bank)
    missingBucket.questions = missingBucket.questions.filter((question) => !(question.type === 'pattern-data' && question.difficulty === 3))
    expect(() => assertValidQuestionBank(missingBucket)).toThrow(/pattern-data.*3/)
  })

  it('maps precise standard tags to accessible Common Core domain pages', () => {
    const bank = readQuestionBank() as { questions: Array<Record<string, any>> }
    for (const question of bank.questions) {
      const tags = question.tags as string[]
      const standards = tags.filter((tag) => tag.startsWith('standard:'))
      const expected = question.type === 'add-sub' ? ['3.NBT.2']
        : question.type === 'mul-div' ? [tags.includes('skill-muldiv-unknown') ? '3.OA.4' : '3.OA.3']
          : question.type === 'two-step-app' ? ['3.OA.8']
            : question.type === 'unknown-relation' ? tags.includes('skill-addsub-unknown') ? ['3.OA.8', '3.NBT.2'] : ['3.OA.4']
              : question.type === 'unit-time-route' ? tags.some((tag) => /elapsed-time|time-unit/.test(tag)) ? ['3.MD.1']
                : tags.some((tag) => ['mass', 'liquid-volume', 'skill-mass-total'].includes(tag)) ? ['3.MD.2'] : ['3.MD.4']
              : ['3.OA.9']
      for (const standard of expected) expect(standards, `${question.id} standard`).toContain(`standard:${standard}`)
      for (const standardTag of standards) {
        const standard = standardTag.slice('standard:'.length)
        const domain = standard.includes('NBT') ? 'NBT' : standard.includes('OA') ? 'OA' : 'MD'
        expect(question.sources, `${question.id} ${standard} domain`)
          .toContain(`https://www.thecorestandards.org/Math/Content/3/${domain}/`)
      }
      expect(question.sources.every((source: string) => !/\/3\/(?:NBT|OA|MD)\/\d/.test(source)), `${question.id} uses domain URL only`).toBe(true)
    }
  })

  it('links only same-type questions with a shared precise skill tag', () => {
    for (const question of QUESTION_BANK.questions) {
      expect(new Set(question.similarQuestionIds).size, `${question.id} has no duplicate links`).toBe(question.similarQuestionIds.length)
      for (const id of question.similarQuestionIds) {
        const target = QUESTION_BANK.questions.find((candidate) => candidate.id === id)!
        expect(target.type, `${question.id} → ${id} type`).toBe(question.type)
        expect(question.tags.filter((tag) => tag.startsWith('skill-') && target.tags.includes(tag)), `${question.id} → ${id} skill`).not.toHaveLength(0)
        expect(target.answer.unit, `${question.id} → ${id} answer unit`).toBe(question.answer.unit)
        expect(Boolean(target.answer.expression), `${question.id} → ${id} expression presence`).toBe(Boolean(question.answer.expression))
      }
    }
  })

  it('rejects cross-skill and cross-type similar-question references', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const crossSkill = structuredClone(bank)
    crossSkill.questions[2].similarQuestionIds = ['q005']
    crossSkill.questions[4].tags = crossSkill.questions[4].tags.filter((tag: string) => !tag.startsWith('skill-'))
    expect(() => assertValidQuestionBank(crossSkill)).toThrow(/similarQuestionIds.*skill/i)
    const crossType = structuredClone(bank)
    crossType.questions[2].similarQuestionIds = ['q013']
    crossType.questions[12].tags.push('skill-addition')
    expect(() => assertValidQuestionBank(crossType)).toThrow(/similarQuestionIds.*type/i)
  })

  it('rejects similar answers with different units or expression shape', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const unitMismatch = structuredClone(bank)
    unitMismatch.questions[1].similarQuestionIds = ['q006']
    expect(() => assertValidQuestionBank(unitMismatch)).toThrow(/similarQuestionIds.*answer unit/i)
    const expressionMismatch = structuredClone(bank)
    expressionMismatch.questions[2].answer = { value: 17 }
    expressionMismatch.questions[2].similarQuestionIds = []
    for (const question of expressionMismatch.questions) {
      question.similarQuestionIds = question.similarQuestionIds.filter((id: string) => id !== 'q003')
    }
    expressionMismatch.questions[0].similarQuestionIds = ['q003']
    expect(() => assertValidQuestionBank(expressionMismatch)).toThrow(/similarQuestionIds.*expression/i)
  })

  it('rejects dangling similar-question IDs', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[0].similarQuestionIds = ['not-in-bank']
    expect(() => assertValidQuestionBank(invalid)).toThrow(/similarQuestionIds/)
  })

  it('rejects duplicate similar-question IDs', () => {
    const bank = readQuestionBank() as { version: string; questions: Array<Record<string, any>> }
    const invalid = structuredClone(bank)
    invalid.questions[2].similarQuestionIds = ['q009', 'q009']
    expect(() => assertValidQuestionBank(invalid)).toThrow(/similarQuestionIds.*duplicate/i)
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
