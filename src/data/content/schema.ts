import {
  FIVE_STEP_TYPES,
  QUEST_CATEGORIES,
  QUIZ_TYPES,
  type BestiaryEntry,
  type Difficulty,
  type QuestCategory,
  type Question,
  type QuizType,
} from '../../domain/model/types'
import { tokenizeExpression, unitAliases } from '../../domain/quiz/answerJudgement'

/** Supported mathematical answer units, including curriculum counting units. */
const QUESTION_UNITS = new Set([
  ...Object.values(unitAliases).flat(),
  '份', '项', '格', '瓶', '节', '次', '轮',
])

/** Versioned, validated question content. */
export interface QuestionBank {
  version: string
  questions: Question[]
}

/** Creature content adds the mandatory visual disclaimer used by observation views. */
export interface CreatureContent extends BestiaryEntry {
  illustrationLabel: '原创示意插画，非真实影像'
}

/** Versioned bestiary content. */
export interface CreatureBank {
  version: string
  creatures: CreatureContent[]
}

/** Precomputed views over the three independent question dimensions. */
export interface QuestionIndexes {
  byCategory: Record<QuestCategory, Question[]>
  byType: Record<QuizType, Question[]>
  byDifficulty: Record<Difficulty, Question[]>
}

/** Throws a path-aware content error when an unknown value is not an object. */
function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`)
  }
  return value as Record<string, unknown>
}

/** Throws when a required string is absent or contains only whitespace. */
function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path}: expected non-empty text`)
  return value
}

/** Throws unless a field is a non-empty array of non-empty strings. */
function stringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path}: expected non-empty text list`)
  return value.map((item, index) => nonEmptyString(item, `${path}[${index}]`))
}

/** Verifies a source list contains direct HTTP(S) citations rather than labels. */
function sourceList(value: unknown, path: string): string[] {
  const sources = stringList(value, path)
  for (const source of sources) {
    if (!/^https?:\/\//i.test(source)) throw new Error(`${path}: source must be an HTTP(S) URL`)
  }
  return sources
}

/** Evaluates a supported arithmetic expression, returning null for invalid syntax. */
function evaluateExpression(expression: string): number | null {
  const tokens = tokenizeExpression(expression)
  if (tokens.length < 3 || tokens.length % 2 === 0) return null
  let cursor = 0
  try {
    const factor = (): number => {
      const value = Number(tokens[cursor])
      if (!Number.isFinite(value)) throw new Error('expected number')
      cursor += 1
      return value
    }
    const term = (): number => {
      let value = factor()
      while (tokens[cursor] === '×' || tokens[cursor] === '÷') {
        const operator = tokens[cursor++]
        const next = factor()
        if (operator === '÷' && next === 0) throw new Error('division by zero')
        value = operator === '×' ? value * next : value / next
      }
      return value
    }
    let result = term()
    while (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const operator = tokens[cursor++]
      const next = term()
      result = operator === '+' ? result + next : result - next
    }
    return cursor === tokens.length && Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

/** Checks a question answer's numeric, expression, and unit semantics. */
function validateAnswer(value: unknown, path: string): void {
  const answer = record(value, path)
  if (typeof answer.value !== 'number' || !Number.isFinite(answer.value)) {
    throw new Error(`${path}.value: expected a finite number`)
  }
  if (answer.expression !== undefined) {
    const expression = nonEmptyString(answer.expression, `${path}.expression`)
    const result = evaluateExpression(expression)
    if (result === null || Math.abs(result - answer.value) > 1e-9) {
      throw new Error(`${path}.expression: invalid or inconsistent answer expression`)
    }
    if (answer.unit !== undefined) throw new Error(`${path}: expression answers cannot also declare a unit`)
  } else if (answer.unit !== undefined) {
    const unit = nonEmptyString(answer.unit, `${path}.unit`)
    if (!QUESTION_UNITS.has(unit)) throw new Error(`${path}.unit: unsupported unit`)
  }
}

/** Validates every required model field and returns the narrowed question. */
function validateQuestion(value: unknown, path: string): Question {
  const question = record(value, path)
  nonEmptyString(question.id, `${path}.id`)
  if (!(QUIZ_TYPES as readonly unknown[]).includes(question.type)) throw new Error(`${path}.type: unknown quiz type`)
  if (!(QUEST_CATEGORIES as readonly unknown[]).includes(question.category)) throw new Error(`${path}.category: unknown category`)
  if (![1, 2, 3].includes(question.difficulty as number)) throw new Error(`${path}.difficulty: expected 1, 2, or 3`)
  const story = record(question.story, `${path}.story`)
  nonEmptyString(story.title, `${path}.story.title`)
  nonEmptyString(story.body, `${path}.story.body`)
  if (typeof question.requiresFiveStep !== 'boolean') throw new Error(`${path}.requiresFiveStep: expected boolean`)
  if ((question.category === 'basic') === question.requiresFiveStep) {
    throw new Error(`${path}: basic questions skip five steps; applied/probe questions require them`)
  }
  const hints = question.hints
  if (!Array.isArray(hints) || hints.length !== 5) throw new Error(`${path}.hints: exactly five levels are required`)
  hints.forEach((hint, index) => nonEmptyString(hint, `${path}.hints[${index}]`))
  validateAnswer(question.answer, `${path}.answer`)
  stringList(question.tags, `${path}.tags`)
  sourceList(question.sources, `${path}.sources`)
  if (question.creatureRef !== undefined) nonEmptyString(question.creatureRef, `${path}.creatureRef`)

  if (!Array.isArray(question.similarQuestionIds)) throw new Error(`${path}.similarQuestionIds: expected an array`)
  question.similarQuestionIds.forEach((id, index) => nonEmptyString(id, `${path}.similarQuestionIds[${index}]`))
  if (question.requiresFiveStep) validateSteps(question.steps, `${path}.steps`)
  else if (question.steps !== undefined) validateSteps(question.steps, `${path}.steps`)
  return question as unknown as Question
}

/** Enforces the canonical five-step sequence for guided questions. */
function validateSteps(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== FIVE_STEP_TYPES.length) {
    throw new Error(`${path}: guided questions require exactly five steps`)
  }
  value.forEach((item, index) => {
    const step = record(item, `${path}[${index}]`)
    if (step.type !== FIVE_STEP_TYPES[index]) throw new Error(`${path}[${index}].type: invalid five-step order`)
    nonEmptyString(step.prompt, `${path}[${index}].prompt`)
  })
}

/**
 * Validates a versioned bank, each question, and all similar-question references.
 *
 * @param value Untrusted parsed JSON content.
 * @throws {Error} With the invalid field path when any content rule fails.
 */
export function assertValidQuestionBank(value: unknown): asserts value is QuestionBank {
  const bank = record(value, 'questionBank')
  nonEmptyString(bank.version, 'questionBank.version')
  if (!Array.isArray(bank.questions) || bank.questions.length === 0) {
    throw new Error('questionBank.questions: expected a non-empty array')
  }
  const ids = new Set<string>()
  const questions = bank.questions.map((question, index) => {
    const validated = validateQuestion(question, `questionBank.questions[${index}]`)
    if (ids.has(validated.id)) throw new Error(`questionBank.questions[${index}].id: duplicate ${validated.id}`)
    ids.add(validated.id)
    return validated
  })
  for (const [index, question] of questions.entries()) {
    for (const similarId of question.similarQuestionIds) {
      if (!ids.has(similarId) || similarId === question.id) {
        throw new Error(`questionBank.questions[${index}].similarQuestionIds: missing or self reference ${similarId}`)
      }
    }
  }
}

/**
 * Groups questions once for efficient category, type, and difficulty lookups.
 *
 * @param questions Validated question records.
 * @returns Mutable arrays indexed by each question dimension.
 */
export function createQuestionIndexes(questions: readonly Question[]): QuestionIndexes {
  const byCategory = Object.fromEntries(QUEST_CATEGORIES.map((category) => [category, []])) as unknown as QuestionIndexes['byCategory']
  const byType = Object.fromEntries(QUIZ_TYPES.map((type) => [type, []])) as unknown as QuestionIndexes['byType']
  const byDifficulty: QuestionIndexes['byDifficulty'] = { 1: [], 2: [], 3: [] }
  for (const question of questions) {
    byCategory[question.category].push(question)
    byType[question.type].push(question)
    byDifficulty[question.difficulty].push(question)
  }
  return { byCategory, byType, byDifficulty }
}

/**
 * Validates the four sourced bestiary entries and rejects fixed-depth wording.
 *
 * @param value Untrusted parsed JSON content.
 * @throws {Error} With the invalid field path when any content rule fails.
 */
export function assertValidCreatures(value: unknown): asserts value is CreatureBank {
  const bank = record(value, 'creatures')
  nonEmptyString(bank.version, 'creatures.version')
  if (!Array.isArray(bank.creatures) || bank.creatures.length !== 4) {
    throw new Error('creatures.creatures: exactly four entries are required')
  }
  const ids = new Set<string>()
  bank.creatures.forEach((item, index) => {
    const path = `creatures.creatures[${index}]`
    const creature = record(item, path)
    const id = nonEmptyString(creature.id, `${path}.id`)
    if (ids.has(id)) throw new Error(`${path}.id: duplicate ${id}`)
    ids.add(id)
    nonEmptyString(creature.name, `${path}.name`)
    nonEmptyString(creature.scientificName, `${path}.scientificName`)
    validateDepthRange(creature.depthRange, `${path}.depthRange`)
    const habitat = nonEmptyString(creature.habitat, `${path}.habitat`)
    const uniqueDepthClaim = /唯一(?:的)?(?:分布|栖息)?深度/.test(habitat)
    const qualifiedUniqueClaim = /(?:不是|并非|不代表|并不意味着).{0,5}唯一/.test(habitat)
    const absoluteDepthClaim = /只(?:生活|分布|出现)|绝不会|固定(?:深度|在|于|为)?\s*\d+|only|never occurs/i.test(habitat)
    if (absoluteDepthClaim || (uniqueDepthClaim && !qualifiedUniqueClaim)) {
      throw new Error(`${path}.habitat: fixed or exclusive depth claims are forbidden`)
    }
    const range = record(creature.depthRange, `${path}.depthRange`)
    const normalizedHabitat = habitat.replaceAll(',', '')
    const rangeLabel = new RegExp(`${range.min}[–-]${range.max}米`)
    if (!rangeLabel.test(normalizedHabitat)) {
      throw new Error(`${path}.habitat: must state its declared depth interval`)
    }
    if (!Array.isArray(creature.knowledgeCards) || creature.knowledgeCards.length < 3 || creature.knowledgeCards.length > 5) {
      throw new Error(`${path}.knowledgeCards: expected three to five cards`)
    }
    creature.knowledgeCards.forEach((card, cardIndex) => nonEmptyString(card, `${path}.knowledgeCards[${cardIndex}]`))
    sourceList(creature.sources, `${path}.sources`)
    if (typeof creature.illustrationRef !== 'string' || !/^original-[a-z0-9-]+$/.test(creature.illustrationRef)) {
      throw new Error(`${path}.illustrationRef: expected an original-* placeholder key`)
    }
    if (creature.illustrationLabel !== '原创示意插画，非真实影像') {
      throw new Error(`${path}.illustrationLabel: expected the original-illustration disclaimer`)
    }
  })
  const johnson = bank.creatures.find((item) => record(item, 'creatures.entry').id === 'johnson-anglerfish')
  if (johnson === undefined) throw new Error('creatures: Johnson’s anglerfish entry is required')
  const anglerfish = record(johnson, 'creatures.johnson-anglerfish')
  if (anglerfish.scientificName !== 'Melanocetus johnsonii') {
    throw new Error('creatures.johnson-anglerfish.scientificName: expected Melanocetus johnsonii')
  }
  const anglerfishDepth = record(anglerfish.depthRange, 'creatures.johnson-anglerfish.depthRange')
  if (anglerfishDepth.min !== 300 || anglerfishDepth.max !== 4000) {
    throw new Error('creatures.johnson-anglerfish.depthRange: expected approximately 300–4,000 meters')
  }
}

/** Validates a non-negative interval and preserves range semantics. */
function validateDepthRange(value: unknown, path: string): void {
  const range = record(value, path)
  if (typeof range.min !== 'number' || !Number.isFinite(range.min) || range.min < 0) {
    throw new Error(`${path}.min: expected a non-negative depth`)
  }
  if (typeof range.max !== 'number' || !Number.isFinite(range.max) || range.max <= range.min) {
    throw new Error(`${path}.max: expected a depth greater than min`)
  }
}
