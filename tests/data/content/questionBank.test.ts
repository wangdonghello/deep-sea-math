import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { QUEST_CATEGORIES, QUIZ_TYPES } from '../../../src/domain/model/types'
import { assertValidQuestionBank, QUESTION_BANK_LIMITS } from '../../../src/data/content/schema'
import { CREATURE_BANK, QUESTION_BANK, QUESTION_INDEX } from '../../../src/data/content'

/**
 * `tests/data/content/questionBank.test.ts` —— 正式题库的内容契约。
 *
 * 题库由 `scripts/generate-question-bank.mjs` 生成（216 题 = 6 题型 × 3 难度
 * × 12 题，固定种子）。这里锁：
 * 1. 规模与覆盖（216 题、每格 12 题、category 分布 6/4/2、索引桶对拍）；
 * 2. 来源域映射（技能 → standard:* → Common Core 领域页）；
 * 3. 相似题链接约束（同题型、共享技能、答案形态一致、双向值不同）；
 * 4. hints 五层语义，尤其第 5 层讲解示例不泄露本题答案；
 * 5. **数字量级下限**（三年级水平：加减三位数、乘除至少两位数 × 一位数，
 *    除数保持一位数）；
 * 6. 严格口径下的规模 / 每格下限 / 五步字段负测。
 */

/** 五类"规律与数据"技能的精确标签（都映射到 3.OA.9）。 */
const PATTERN_SEQUENCE_SKILLS = [
  'skill-constant-difference-sequence',
  'skill-second-difference-sequence',
  'skill-square-number-sequence',
  'skill-doubling-sequence',
  'skill-double-and-add-one-sequence',
] as const

/** 技能 → 独立声明的 Common Core 标准（与 schema 的真源对拍）。 */
const EXPECTED_STANDARDS_BY_SKILL: Record<string, string[]> = {
  'skill-addition': ['3.NBT.2'], 'skill-subtraction': ['3.NBT.2'],
  'skill-repeated-subtraction': ['3.NBT.2'], 'skill-merge-and-remove-duplicates': ['3.NBT.2', '3.OA.8'],
  'skill-equal-groups-multiplication': ['3.OA.3'], 'skill-equal-share-division': ['3.OA.3'],
  'skill-multiplication-addition': ['3.OA.8'], 'skill-division-addition': ['3.OA.8'],
  'skill-multiplication-subtraction': ['3.OA.8'], 'skill-addsub-unknown': ['3.OA.8', '3.NBT.2'],
  'skill-muldiv-unknown': ['3.OA.4'], 'skill-add-length': ['3.NBT.2'],
  'skill-add-elapsed-time': ['3.MD.1'], 'skill-multi-step-distance': ['3.OA.8'],
  'skill-subtract-elapsed-time': ['3.MD.1'], 'skill-mass-total': ['3.MD.2'],
  'skill-rate-distance': ['3.OA.3'], 'skill-subtract-length': ['3.NBT.2'],
  'skill-constant-difference-sequence': ['3.OA.9'], 'skill-doubling-sequence': ['3.OA.9'],
  'skill-second-difference-sequence': ['3.OA.9'], 'skill-square-number-sequence': ['3.OA.9'],
  'skill-double-and-add-one-sequence': ['3.OA.9'],
}

type RawQuestion = Record<string, any>
interface RawBank { version: string; questions: RawQuestion[] }

/** Loads the checked-in question bank as JSON so tests exercise shipped content. */
function readQuestionBank(): RawBank {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/content/questionBank.grade3.json'), 'utf8')) as RawBank
}

/** 六个题型 × 三档难度的全部组合。 */
const CELLS = QUIZ_TYPES.filter((type) => type !== 'number-sense').flatMap((type) => [1, 2, 3].map((difficulty) => ({ type, difficulty })))

/** 提取文本里的整数 token。 */
function numbers(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map(Number)
}

/** 第 3 层「算式提示」里的操作数（生成脚本统一写成「列式：…」）。 */
function expressionOperands(question: RawQuestion): number[] {
  return numbers(question.hints[3])
}

/**
 * 按给定的「每格题数」克隆出题库规模的真题库，供严格口径下的题量与每格
 * 下限负测使用。模板只取题库里合法的题目，负测要卡的是规模 / 覆盖规则。
 */
function syntheticBank(counts: number[]): RawBank {
  const base = readQuestionBank()
  const questions: RawQuestion[] = []
  CELLS.forEach((cell, index) => {
    const template = base.questions.find((question) => question.type === cell.type && question.difficulty === cell.difficulty)!
    for (let n = 0; n < counts[index]; n += 1) {
      questions.push({ ...structuredClone(template), id: `${cell.type}-${cell.difficulty}-${n}`, similarQuestionIds: [] })
    }
  })
  return { version: base.version, questions }
}

/** 18 格平均铺满到总题量 `total`。 */
function evenCounts(total: number): number[] {
  const base = Math.floor(total / CELLS.length)
  return CELLS.map((_, index) => (index === CELLS.length - 1 ? total - base * (CELLS.length - 1) : base))
}

/** 按 id 查题（测试里多次需要拿链接目标对拍）。 */
function byId(id: string): RawQuestion {
  return QUESTION_BANK.questions.find((question) => question.id === id)!
}

describe('question bank content', () => {
  it('contains 216 complete questions spanning every type × difficulty cell', () => {
    const bank = readQuestionBank()
    expect(bank.questions).toHaveLength(216)
    expect(QUESTION_BANK_LIMITS.maxQuestions).toBeGreaterThanOrEqual(216)
    assertValidQuestionBank(bank)

    for (const { type, difficulty } of CELLS) {
      const cell = bank.questions.filter((question) => question.type === type && question.difficulty === difficulty)
      expect(cell, `${type} difficulty ${difficulty}`).toHaveLength(12)
      const split = QUEST_CATEGORIES.map((category) => cell.filter((question) => question.category === category).length)
      expect(split, `${type} difficulty ${difficulty} category split`).toEqual([6, 4, 2])
    }
    expect(QUESTION_INDEX.byCategory.basic).toHaveLength(108)
    expect(QUESTION_INDEX.byCategory.applied).toHaveLength(72)
    expect(QUESTION_INDEX.byCategory.probe).toHaveLength(36)
    expect(QUESTION_INDEX.byDifficulty[3]).toHaveLength(72)

    const creatureIds = new Set(CREATURE_BANK.creatures.map((creature) => creature.id))
    expect(bank.questions.every((question) => creatureIds.has(question.creatureRef ?? ''))).toBe(true)
  })

  it('keeps every index bucket in lockstep with the bank', () => {
    for (const category of QUEST_CATEGORIES) {
      expect(QUESTION_INDEX.byCategory[category]).toEqual(QUESTION_BANK.questions.filter((question) => question.category === category))
    }
    for (const type of QUIZ_TYPES.filter((candidate) => candidate !== 'number-sense')) {
      expect(QUESTION_INDEX.byType[type]).toEqual(QUESTION_BANK.questions.filter((question) => question.type === type))
      for (const difficulty of [1, 2, 3]) {
        const bucket = QUESTION_INDEX.byType[type].filter((question) => question.difficulty === difficulty)
        expect(bucket).toEqual(QUESTION_BANK.questions.filter((question) => question.type === type && question.difficulty === difficulty))
        for (const category of QUEST_CATEGORIES) {
          const indexed = QUESTION_INDEX.byCategory[category].filter((question) => question.type === type && question.difficulty === difficulty)
          expect(indexed).toEqual(QUESTION_BANK.questions.filter((question) => question.type === type && question.difficulty === difficulty && question.category === category))
        }
      }
    }
    for (const difficulty of [1, 2, 3] as const) {
      expect(QUESTION_INDEX.byDifficulty[difficulty]).toEqual(QUESTION_BANK.questions.filter((question) => question.difficulty === difficulty))
    }
    for (const grade of [1, 2, 3] as const) {
      expect(QUESTION_INDEX.byGrade[grade]).toEqual(QUESTION_BANK.questions.filter((question) => question.grade === grade))
    }
  })

  it('maps each tagged skill to its independently specified standard domain', () => {
    for (const question of readQuestionBank().questions) {
      const tags = question.tags as string[]
      const standards = tags.filter((tag) => tag.startsWith('standard:'))
      const skills = tags.filter((tag) => tag.startsWith('skill-'))
      expect(skills, `${question.id} has one mapped skill`).toHaveLength(1)
      const expected = EXPECTED_STANDARDS_BY_SKILL[skills[0]]
      expect(expected, `${question.id} skill ${skills[0]} is mapped`).toBeDefined()
      expect(standards.sort(), `${question.id} standards`).toEqual([...expected].map((standard) => `standard:${standard}`).sort())
      for (const standardTag of standards) {
        const standard = standardTag.slice('standard:'.length)
        const domain = standard.includes('NBT') ? 'NBT' : standard.includes('OA') ? 'OA' : 'MD'
        expect(question.sources, `${question.id} ${standard} domain`)
          .toContain(`https://www.thecorestandards.org/Math/Content/3/${domain}/`)
      }
      expect(question.sources.every((source: string) => !/\/3\/(?:NBT|OA|MD)\/\d/.test(source)), `${question.id} uses domain URL only`).toBe(true)
    }
  })

  it('maps every pattern sequence skill to 3.OA.9 even when presented as a data table', () => {
    const bank = readQuestionBank()
    const patternQuestions = bank.questions.filter((question) => question.type === 'pattern-data')
    expect(patternQuestions).toHaveLength(36)
    expect(patternQuestions.every((question) => question.tags.some((tag: string) => (PATTERN_SEQUENCE_SKILLS as readonly string[]).includes(tag)))).toBe(true)

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

  it('links only same-type questions with a shared precise skill tag', () => {
    for (const question of QUESTION_BANK.questions) {
      expect(new Set(question.similarQuestionIds).size, `${question.id} has no duplicate links`).toBe(question.similarQuestionIds.length)
      for (const id of question.similarQuestionIds) {
        const target = byId(id)
        expect(target.type, `${question.id} → ${id} type`).toBe(question.type)
        expect(question.tags.filter((tag) => tag.startsWith('skill-') && target.tags.includes(tag)), `${question.id} → ${id} skill`).not.toHaveLength(0)
        expect(target.answer.unit, `${question.id} → ${id} answer unit`).toBe(question.answer.unit)
        expect(Boolean(target.answer.expression), `${question.id} → ${id} expression presence`).toBe(Boolean(question.answer.expression))
        // 生成脚本只在同格内成对建链，不会跨题型或跨难度。
        expect(target.difficulty, `${question.id} → ${id} difficulty`).toBe(question.difficulty)
        expect(byId(id).similarQuestionIds, `${question.id} → ${id} is bidirectional`).toContain(question.id)
      }
    }
    const linked = QUESTION_BANK.questions.filter((question) => question.similarQuestionIds.length > 0)
    expect(linked.length).toBeGreaterThan(0)
    expect(linked.length).toBeLessThan(QUESTION_BANK.questions.length)
  })

  it('gives every bidirectional link a distinct answer value', () => {
    for (const question of QUESTION_BANK.questions) {
      for (const id of question.similarQuestionIds) {
        const target = byId(id)
        if (target.similarQuestionIds.includes(question.id)) {
          expect(target.answer.value, `${question.id} ↔ ${id}`).not.toBe(question.answer.value)
        }
      }
    }
  })

  it('keeps the worked-example layer free of the answer digits', () => {
    for (const question of readQuestionBank().questions) {
      const forbidden = new Set<number>([question.answer.value])
      if (typeof question.answer.expression === 'string') {
        numbers(question.answer.expression).forEach((value) => forbidden.add(value))
      }
      expect(numbers(question.hints[4]).filter((value) => forbidden.has(value)), `${question.id} worked example`).toEqual([])
      expect(question.hints, `${question.id} hint layers`).toHaveLength(5)
      expect(question.hints[4].length, `${question.id} worked example length`).toBeGreaterThanOrEqual(6)
    }
  })

  it('keeps the first hint layer a reading cue instead of restating the numbers', () => {
    for (const question of readQuestionBank().questions) {
      const storyNumbers = new Set(numbers(question.story.body))
      expect(numbers(question.hints[0]).filter((value) => storyNumbers.has(value)), question.id).toEqual([])
    }
  })

  it('keeps add-sub questions at grade-3 magnitude (three-digit operands and up)', () => {
    const addSub = readQuestionBank().questions.filter((question) => question.type === 'add-sub')
    expect(addSub.length).toBeGreaterThan(0)
    for (const question of addSub) {
      const operands = expressionOperands(question)
      expect(operands.length, `${question.id} has an equation hint`).toBeGreaterThanOrEqual(2)
      for (const operand of operands) {
        // 三年级量级：加减法以三位数为主，不再出现两位数或个位数操作数。
        expect(operand, `${question.id} operand magnitude`).toBeGreaterThanOrEqual(100)
      }
    }
  })

  it('starts mul-div at grade-3 magnitude (two-digit factor or dividend)', () => {
    const cell = readQuestionBank().questions.filter((question) => question.type === 'mul-div' && question.difficulty === 1)
    expect(cell).toHaveLength(12)
    for (const question of cell) {
      const operands = expressionOperands(question)
      expect(operands.length, `${question.id} has an equation hint`).toBeGreaterThanOrEqual(2)
      const [left, right] = operands
      // d1 的乘法是两位数 × 一位数、除法是两位数 ÷ 一位数（商两位数），
      // 不再是乘法表事实（如 5 × 6、48 ÷ 8）。
      expect(left, `${question.id} two-digit factor or dividend`).toBeGreaterThanOrEqual(12)
      expect(right, `${question.id} second operand`).toBeGreaterThanOrEqual(2)
    }
  })

  it('moves multiplication to two-digit × two-digit at difficulty 3', () => {
    const cell = readQuestionBank().questions.filter((question) =>
      question.type === 'mul-div' && question.difficulty === 3 && question.hints[3].includes('×'))
    expect(cell.length).toBeGreaterThan(0)
    for (const question of cell) {
      const [left, right] = expressionOperands(question)
      expect(Math.min(left, right), `${question.id} two-digit factors`).toBeGreaterThanOrEqual(12)
    }
  })

  it('keeps every division divisor a single digit (grade-3 除数是一位数)', () => {
    for (const question of readQuestionBank().questions) {
      const hint = String(question.hints[3])
      if (!hint.includes('÷')) continue
      const [, divisor] = numbers(hint)
      expect(divisor, `${question.id} divisor`).toBeLessThan(10)
    }
  })

  it('never uses one-digit-only arithmetic in any cell', () => {
    for (const question of readQuestionBank().questions) {
      if (question.tags.includes('ordering') || question.tags.includes('ordinal')) continue
      const operands = expressionOperands(question)
      expect(Math.max(...operands), `${question.id} magnitude`).toBeGreaterThanOrEqual(12)
    }
  })

  it('keeps length questions within 1000 and every answer a positive count', () => {
    for (const question of readQuestionBank().questions) {
      expect(Number.isInteger(question.answer.value) && question.answer.value > 0, `${question.id} answer value`).toBe(true)
      if (question.tags.includes('skill-add-length') || question.tags.includes('skill-subtract-length')) {
        const content = [question.story.body, ...question.hints].join(' ')
        expect(numbers(content).every((value) => value <= 1000), `${question.id} length operands within 1000`).toBe(true)
        expect(question.answer.value, `${question.id} length result`).toBeLessThanOrEqual(1000)
      }
    }
  })

  it('spreads every cell across at least six distinct story templates', () => {
    const bank = readQuestionBank()
    for (const { type, difficulty } of CELLS) {
      const cell = bank.questions.filter((question) => question.type === type && question.difficulty === difficulty)
      const titles = new Set(cell.map((question) => question.story.title))
      expect(titles.size, `${type} difficulty ${difficulty} story variety`).toBeGreaterThanOrEqual(6)
    }
    // 每个题型整体至少准备了 8 个不同的故事模板（避免"换数字换物品名"）。
    for (const type of QUIZ_TYPES.filter((candidate) => candidate !== 'number-sense')) {
      const titles = new Set(bank.questions.filter((question) => question.type === type).map((question) => question.story.title))
      expect(titles.size, `${type} story templates`).toBeGreaterThanOrEqual(8)
    }
  })

  it('enforces the 200–648 question range', () => {
    expect(() => assertValidQuestionBank(syntheticBank(evenCounts(199)))).toThrow(/expected 200–648 questions/)
    expect(() => assertValidQuestionBank(syntheticBank(evenCounts(649)))).toThrow(/expected 200–648 questions/)
  })

  it('rejects a bank with a type/difficulty cell below the eight-question floor', () => {
    const counts = evenCounts(216)
    // pattern-data × difficulty 3 是第 18 格（5 * 3 + 2）
    counts[17] = 7
    expect(() => assertValidQuestionBank(syntheticBank(counts))).toThrow(/pattern-data difficulty 3 needs at least 8 questions/)
  })

  it('rejects a bank missing an entire type/difficulty cell', () => {
    const invalid = readQuestionBank()
    invalid.questions = invalid.questions.filter((question) => !(question.type === 'pattern-data' && question.difficulty === 3))
    expect(() => assertValidQuestionBank(invalid)).toThrow(/pattern-data difficulty 3 needs at least 8 questions/)
  })

  it('rejects five-step content fields under the strict regime', () => {
    const flagged = syntheticBank(evenCounts(200))
    flagged.questions[0].requiresFiveStep = true
    expect(() => assertValidQuestionBank(flagged)).toThrow(/不再使用五步引导/)

    const withSteps = syntheticBank(evenCounts(200))
    withSteps.questions[0].steps = [{ type: 'known', prompt: '引导' }]
    expect(() => assertValidQuestionBank(withSteps)).toThrow(/不再使用五步引导/)
  })

  it('rejects a question with fewer than five hints', () => {
    const invalid = readQuestionBank()
    invalid.questions[0].hints.pop()
    expect(() => assertValidQuestionBank(invalid)).toThrow(/exactly five levels/)
  })

  it('rejects question sources without the skill-matched standards domain', () => {
    const missing = readQuestionBank()
    missing.questions[0].sources = ['https://www.thecorestandards.org/']
    expect(() => assertValidQuestionBank(missing)).toThrow(/standards domain/i)

    const wrongProtocol = readQuestionBank()
    wrongProtocol.questions[0].sources = ['ftp://www.thecorestandards.org/Math/Content/3/NBT/']
    expect(() => assertValidQuestionBank(wrongProtocol)).toThrow(/HTTP\(S\)/i)

    const malformed = readQuestionBank()
    malformed.questions[0].sources = ['https://']
    expect(() => assertValidQuestionBank(malformed)).toThrow(/valid HTTP\(S\) URL/i)
  })

  it('rejects a standard tag that does not match the question skill', () => {
    const invalid = readQuestionBank()
    const target = invalid.questions.find((question) => question.tags.includes('skill-addition'))!
    target.tags = target.tags.map((tag: string) => (tag === 'standard:3.NBT.2' ? 'standard:3.OA.4' : tag))
    expect(() => assertValidQuestionBank(invalid)).toThrow(/standard tag does not match/i)
  })

  it('requires skill-addsub-unknown for a missing-part unknown relation', () => {
    const invalid = readQuestionBank()
    const target = invalid.questions.find((question) => question.type === 'unknown-relation' && question.tags.includes('missing-part'))!
    target.tags = target.tags.map((tag: string) => (tag === 'skill-addsub-unknown' ? 'skill-muldiv-unknown' : tag))
    expect(() => assertValidQuestionBank(invalid)).toThrow(/expected skill-addsub-unknown/i)
  })

  it('rejects length addition and subtraction operands above 1000', () => {
    const invalid = readQuestionBank()
    const target = invalid.questions.find((question) => question.tags.includes('skill-subtract-length'))!
    target.hints[3] = '列式：2500 - 120。'
    expect(() => assertValidQuestionBank(invalid)).toThrow(/length operands.*1000/i)
  })

  it('rejects a worked-example layer that reuses the answer digits', () => {
    const invalid = readQuestionBank()
    const target = invalid.questions[0]
    target.hints[4] = `比如 4 + 8 = ${target.answer.value}，你就能得到答案。`
    expect(() => assertValidQuestionBank(invalid)).toThrow(/worked example must not reuse the answer digits/)
  })

  it('rejects a worked-example layer that is too short to teach', () => {
    const invalid = readQuestionBank()
    invalid.questions[0].hints[4] = '算一下'
    expect(() => assertValidQuestionBank(invalid)).toThrow(/at least six characters/)
  })

  it('does not treat a longer run as a prefix of the answer digits', () => {
    const valid = readQuestionBank()
    valid.questions[0].hints[4] = '比如先数到 120 个，就能看出比原数更接近。'
    expect(() => assertValidQuestionBank(valid), 'answer 12 must not match inside 120').not.toThrow()
  })

  it('rejects dangling and duplicated similar-question references', () => {
    const dangling = readQuestionBank()
    for (const question of dangling.questions) question.similarQuestionIds = []
    dangling.questions[0].similarQuestionIds = ['not-in-bank']
    expect(() => assertValidQuestionBank(dangling)).toThrow(/missing or self reference/)

    const duplicated = readQuestionBank()
    for (const question of duplicated.questions) question.similarQuestionIds = []
    duplicated.questions[0].similarQuestionIds = ['q005', 'q005']
    expect(() => assertValidQuestionBank(duplicated)).toThrow(/duplicate references/)
  })

  it('rejects cross-skill, cross-type, cross-unit and cross-shape similar links', () => {
    const crossSkill = readQuestionBank()
    const source = crossSkill.questions[0]
    const sameTypeOtherSkill = crossSkill.questions.find((question) =>
      question.type === source.type && question.tags.includes('skill-subtraction'))!
    source.similarQuestionIds = [sameTypeOtherSkill.id]
    expect(() => assertValidQuestionBank(crossSkill)).toThrow(/no shared skill tag/)

    const crossType = readQuestionBank()
    const base = crossType.questions[0]
    const otherType = crossType.questions.find((question) => question.type !== base.type)!
    otherType.tags = [...otherType.tags, 'skill-addition']
    base.similarQuestionIds = [otherType.id]
    expect(() => assertValidQuestionBank(crossType)).toThrow(/type mismatch/)

    const unitMismatch = readQuestionBank()
    const additions = unitMismatch.questions.filter((question) =>
      question.type === 'add-sub' && question.tags.includes('skill-addition') && question.answer.unit !== undefined)
    const unitBase = additions[0]
    const otherUnit = additions.find((question) => question.answer.unit !== unitBase.answer.unit)!
    unitBase.similarQuestionIds = [otherUnit.id]
    expect(() => assertValidQuestionBank(unitMismatch)).toThrow(/answer unit mismatch/)

    const shapeMismatch = readQuestionBank()
    for (const question of shapeMismatch.questions) question.similarQuestionIds = []
    const expressionBase = shapeMismatch.questions.find((question) => question.answer.expression)!
    const plain = shapeMismatch.questions.find((question) =>
      question.type === expressionBase.type && question.tags.includes('skill-addition') && question.answer.expression === undefined)!
    plain.answer = { value: 987 }
    plain.hints[4] = '比如 12 + 7 = 19，合并的方法完全一样。'
    expressionBase.similarQuestionIds = [plain.id]
    expect(() => assertValidQuestionBank(shapeMismatch)).toThrow(/expression shape mismatch/)
  })

  it('rejects a similar-question pair that shares the same answer value', () => {
    const invalid = readQuestionBank()
    for (const question of invalid.questions) question.similarQuestionIds = []
    const additions = invalid.questions.filter((question) =>
      question.type === 'add-sub' && question.tags.includes('skill-addition') && question.answer.unit !== undefined)
    const first = additions[0]
    const second = additions.find((question) => question.answer.unit === first.answer.unit && question.id !== first.id)!
    const safeHint = '比如 12 + 7 = 19，合并的方法完全一样。'
    first.answer = { value: 86, unit: first.answer.unit }
    first.hints[4] = safeHint
    second.answer = { value: 86, unit: second.answer.unit }
    second.hints[4] = safeHint
    first.similarQuestionIds = [second.id]
    second.similarQuestionIds = [first.id]
    expect(() => assertValidQuestionBank(invalid)).toThrow(/must differ in value/)
  })
})

