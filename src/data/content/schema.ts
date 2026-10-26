import {
  QUEST_CATEGORIES,
  QUIZ_TYPES,
  THEME_IDS,
  type BestiaryEntry,
  type ChoiceId,
  type Difficulty,
  type Grade,
  type QuestCategory,
  type Question,
  type QuestionFormat,
  type QuizType,
} from '../../domain/model/types'
import { tokenizeExpression, unitAliases } from '../../domain/quiz/answerJudgement'

/** Supported mathematical answer units, including curriculum counting units. */
const QUESTION_UNITS = new Set([
  ...Object.values(unitAliases).flat(),
  '份', '项', '格', '瓶', '节', '次', '轮', '人', '毫升', '组',
])

/** 第二版首发的三个年级。 */
const GRADES: readonly Grade[] = [1, 2, 3]

/** 选择题固定四个选项。 */
const CHOICE_IDS: readonly ChoiceId[] = ['A', 'B', 'C', 'D']

/**
 * 题库规模与覆盖下限（spec `daily-math-quest` §题型与难度覆盖）。
 *
 * 总量 200–400，且每个 `QuizType × Difficulty` 组合至少 8 题——18 格 × 8 =
 * 144，8 是**下限而非目标**；当前题库 216 题，每格 12 题。
 */
export const QUESTION_BANK_LIMITS = {
  minQuestions: 200,
  maxQuestions: 648,
  perGrade: 216,
  minPerCell: 8,
} as const

const STANDARDS_BY_SKILL: Record<string, readonly string[]> = {
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

const DEFAULT_STANDARDS_BY_TYPE: Partial<Record<QuizType, readonly string[]>> = {
  'add-sub': ['3.NBT.2'], 'mul-div': ['3.OA.3'], 'two-step-app': ['3.OA.8'],
  'unknown-relation': ['3.OA.4'], 'pattern-data': ['3.OA.9'],
}

/** Versioned, validated question content. */
export interface QuestionBank {
  version: string
  questions: Question[]
}

/** A locally hosted 3D model with explicit license and source attribution. */
export interface CreatureModelAsset {
  /** Safe filename stem resolved under the application base URL in public/models. */
  ref: string
  /** Compact visible credit for dense contexts (e.g. gallery cards). */
  creditSummary: string
  attribution: string
  license: string
  licenseUrl: string
  sourceUrl: string
  /** Clarifies whether the model is species-accurate or an illustrative representation. */
  note: string
}

/**
 * A locally hosted photograph of the animal, with mandatory attribution.
 *
 * 每个条目必须有一张许可明确的水下实拍或馆藏影像：家长明确不要示意插画。
 * `note` 必须写清影像**实际是什么**（活体/标本/模型，以及鉴定到属还是种），
 * 因为图鉴只拿得到属级实拍时，孩子看到的并不一定是本页那个物种。
 */
export interface CreaturePhotoAsset {
  /** Safe filename stem resolved under the application base URL in public/photos. */
  ref: string
  /** Compact visible credit for dense contexts (e.g. gallery cards). */
  creditSummary: string
  /** Full credit sentence required by the licence (CC BY / CC BY-SA 强制署名). */
  attribution: string
  license: string
  licenseUrl: string
  sourceUrl: string
  /** What the image actually depicts, including any identification caveat. */
  note: string
}

/** Creature content pairs the species facts with licensed imagery and optional 3D media. */
export interface CreatureContent extends BestiaryEntry {
  /** Maximum body measurement; preserve total length (TL), standard length (SL), or mantle length (ML) and never conflate bases. */
  bodySize: string
  photo: CreaturePhotoAsset
  model?: CreatureModelAsset
}

/** 带版本号的图鉴内容。 */
export interface CreatureBank {
  version: string
  creatures: CreatureContent[]
}

/** 三个正交维度上的题目分组视图。 */
export interface QuestionIndexes {
  byCategory: Record<QuestCategory, Question[]>
  byType: Record<QuizType, Question[]>
  byDifficulty: Record<Difficulty, Question[]>
  /** 按年级索引；组题时先查这里，禁止跨年级。 */
  byGrade: Record<Grade, Question[]>
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

/** Requires a well-formed HTTPS URL for links attached to third-party model metadata. */
function secureHttpsUrl(value: unknown, path: string): string {
  const source = nonEmptyString(value, path)
  let parsed: URL
  try {
    parsed = new URL(source)
  } catch {
    throw new Error(`${path}: expected an HTTPS URL`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${path}: expected an HTTPS URL`)
  return source
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
    try {
      if (!new URL(source).hostname) throw new Error('missing hostname')
    } catch {
      throw new Error(`${path}: source must be a valid HTTP(S) URL`)
    }
  }
  return sources
}

/** Accepts identifiable species pages or taxon/observation IDs, not category homepages. */
function hasSpeciesScopedSource(sources: readonly string[]): boolean {
  return sources.some((source) => {
    const url = new URL(source)
    const host = url.hostname.toLowerCase()
    const fishBasePage = ['fishbase.se', 'www.fishbase.se'].includes(host) && /^\/summary\/[^/]+\.html$/i.test(url.pathname)
    const seaLifeBasePage = ['sealifebase.se', 'www.sealifebase.se'].includes(host) && /^\/summary\/[^/]+\.html$/i.test(url.pathname)
    const mbariPage = host === 'www.mbari.org' && /^\/animal\/[^/]+\/?$/i.test(url.pathname) && !/deep-sea-anglerfish/i.test(url.pathname)
    const obisId = host === 'api.obis.org' && (/^\/v3\/taxon\/\d+$/.test(url.pathname) || url.searchParams.has('taxonid') && /^\d+$/.test(url.searchParams.get('taxonid') ?? ''))
    const noaaRecord = (host === 'noaa.gov' || host.endsWith('.noaa.gov')) && /\/(?:observation|species)\/[^/]+\/?$/i.test(url.pathname)
    const inatTaxonOrObservation = host === 'www.inaturalist.org' &&
      (/^\/taxa\/\d+$/i.test(url.pathname) || /^\/observations\/\d+$/i.test(url.pathname))
    const noaaMultimedia = host === 'oceanexplorer.noaa.gov' && /^\/(?:multimedia|expedition-feature)\/[^/]+\/?$/i.test(url.pathname)
    return fishBasePage || seaLifeBasePage || mbariPage || obisId || noaaRecord || inatTaxonOrObservation || noaaMultimedia
  })
}

/** Returns the curriculum standard codes required by the tagged question skill. */
function requiredStandards(type: QuizType, tags: readonly string[]): string[] {
  const skill = tags.find((tag) => tag in STANDARDS_BY_SKILL)
  return skill === undefined ? [...(DEFAULT_STANDARDS_BY_TYPE[type] ?? [])] : [...STANDARDS_BY_SKILL[skill]]
}

/** Requires standards evidence to match the subject domain, without claiming URL authority. */
function validateQuestionSources(
  value: unknown,
  path: string,
  type: QuizType,
  tags: readonly string[],
  grade: Grade,
): void {
  const sources = sourceList(value, path)
  if (grade !== 3) {
    // 1、2 年级使用该年级的 Common Core 领域页；只校验「年级 + 领域」，
    // 不把三年级的具体标准编号强行套到低年级题目上。
    const declared = tags.filter((tag) => tag.startsWith('standard:')).map((tag) => tag.slice('standard:'.length))
    const prefix = `${grade}.`
    if (!declared.some((standard) => standard.startsWith(prefix))) {
      throw new Error(`${path}: missing grade ${grade} standard tag`)
    }
    for (const standard of declared) {
      const domain = standard.includes('NBT') ? 'NBT' : standard.includes('OA') ? 'OA' : 'MD'
      const domainUrl = new RegExp(`^https?://www\.thecorestandards\.org/Math/Content/${grade}/${domain}/?$`, 'i')
      if (!sources.some((source) => domainUrl.test(source))) {
        throw new Error(`${path}: missing matching grade ${grade} standards domain URL`)
      }
    }
    return
  }
  const standards = requiredStandards(type, tags)
  const declaredStandards = tags.filter((tag) => tag.startsWith('standard:')).map((tag) => tag.slice('standard:'.length))
  if (declaredStandards.some((standard) => !standards.includes(standard))) throw new Error(`${path}: standard tag does not match question skill`)
  for (const standard of standards) {
    if (!tags.includes(`standard:${standard}`)) throw new Error(`${path}: missing standard:${standard} tag for skill`)
    const domain = standard.includes('NBT') ? 'NBT' : standard.includes('OA') ? 'OA' : 'MD'
    const domainUrl = new RegExp(`^https?://www\\.thecorestandards\\.org/Math/Content/3/${domain}/?$`, 'i')
    if (!sources.some((source) => domainUrl.test(source))) throw new Error(`${path}: missing matching standards domain URL`)
  }
}

/** Keeps length addition/subtraction data within the tagged grade-level range. */
function validateLengthOperands(question: Record<string, unknown>, path: string, tags: readonly string[]): void {
  if (!tags.some((tag) => ['skill-add-length', 'skill-subtract-length'].includes(tag))) return
  const story = record(question.story, `${path}.story`)
  const evidence = [nonEmptyString(story.body, `${path}.story.body`)]
  if (Array.isArray(question.hints)) evidence.push(...question.hints.filter((hint): hint is string => typeof hint === 'string'))
  if (Array.isArray(question.steps)) {
    for (const item of question.steps) {
      const step = record(item, `${path}.steps`)
      if (step.type === 'expression') evidence.push(nonEmptyString(step.prompt, `${path}.steps.expression.prompt`))
    }
  }
  const values = evidence.flatMap((text) => (text.match(/\d+/g) ?? []).map(Number))
  const answer = record(question.answer, `${path}.answer`)
  if (values.some((value) => value > 1000) || (typeof answer.value === 'number' && answer.value > 1000)) {
    throw new Error(`${path}: length operands and result must be at most 1000`)
  }
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

/** Extracts whole-number tokens so multi-digit runs stay atomic (13 never matches inside 130). */
function numberTokens(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map(Number)
}

/**
 * 让讲解示例层（`hints[4]`）有教学价值，同时不泄露答案。
 *
 * 该层至少是一句完整的话，且不得复用答案值或答案算式的任一操作数——数字按
 * **整数边界**比对，因此 `13` 不会被误判成 `130` 的前缀。
 */
function validateWorkedExampleHint(hints: unknown, answer: Record<string, unknown>, path: string): void {
  const finalLayer = nonEmptyString((hints as unknown[])[4], `${path}.hints[4]`)
  if (finalLayer.length < 6) {
    throw new Error(`${path}.hints[4]: the worked-example layer needs at least six characters`)
  }
  const forbidden = new Set<number>()
  if (typeof answer.value === 'number' && Number.isFinite(answer.value)) forbidden.add(answer.value)
  if (typeof answer.expression === 'string') {
    for (const token of numberTokens(answer.expression)) forbidden.add(token)
  }
  const revealed = numberTokens(finalLayer).filter((token) => forbidden.has(token))
  if (revealed.length > 0) {
    throw new Error(`${path}.hints[4]: worked example must not reuse the answer digits ${revealed.join(', ')}`)
  }
}

/** 校验年级：只允许 1–3。 */
function validateGrade(value: unknown, path: string): Grade {
  if (!GRADES.includes(value as Grade)) throw new Error(`${path}: expected grade 1, 2, or 3`)
  return value as Grade
}

/** 校验作答形态：只允许 open / choice。 */
function validateFormat(value: unknown, path: string): QuestionFormat {
  if (value !== 'open' && value !== 'choice') throw new Error(`${path}: expected open or choice`)
  return value
}

/** 校验选择题选项：四个、A–D 各一次、文本非空且不重复。 */
function validateChoiceOptions(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${path}: choice requires exactly four options`)
  const seen = new Set<string>()
  for (const [index, item] of value.entries()) {
    const option = record(item, `${path}[${index}]`)
    const id = nonEmptyString(option.id, `${path}[${index}].id`)
    if (!CHOICE_IDS.includes(id as ChoiceId)) throw new Error(`${path}[${index}].id: expected A, B, C, or D`)
    if (seen.has(id)) throw new Error(`${path}[${index}].id: duplicate ${id}`)
    seen.add(id)
    nonEmptyString(option.label, `${path}[${index}].label`)
  }
}

/** 校验按主题覆盖的题干：键只能是已发布主题。 */
function validateThemeStories(value: unknown, path: string): void {
  const stories = record(value, path)
  for (const [themeId, storyValue] of Object.entries(stories)) {
    if (!(THEME_IDS as readonly string[]).includes(themeId)) {
      throw new Error(`${path}.${themeId}: unknown theme id`)
    }
    const story = record(storyValue, `${path}.${themeId}`)
    nonEmptyString(story.title, `${path}.${themeId}.title`)
    nonEmptyString(story.body, `${path}.${themeId}.body`)
  }
}

/** Validates every required model field and returns the narrowed question. */
function validateQuestion(value: unknown, path: string): Question {
  const question = record(value, path)
  nonEmptyString(question.id, `${path}.id`)
  if (!(QUIZ_TYPES as readonly unknown[]).includes(question.type)) throw new Error(`${path}.type: unknown quiz type`)
  if (!(QUEST_CATEGORIES as readonly unknown[]).includes(question.category)) throw new Error(`${path}.category: unknown category`)
  if (![1, 2, 3].includes(question.difficulty as number)) throw new Error(`${path}.difficulty: expected 1, 2, or 3`)
  const grade = validateGrade(question.grade ?? 3, `${path}.grade`)
  const format = validateFormat(question.format ?? 'open', `${path}.format`)
  if (grade === 1 && question.type === 'mul-div') {
    throw new Error(`${path}.type: grade 1 must not contain mul-div questions`)
  }
  const story = record(question.story, `${path}.story`)
  nonEmptyString(story.title, `${path}.story.title`)
  nonEmptyString(story.body, `${path}.story.body`)
  if (typeof question.requiresFiveStep !== 'boolean') throw new Error(`${path}.requiresFiveStep: expected boolean`)
  // 当前版本界面不再渲染五步流程：作者若仍然声明五步字段，会被界面静默忽略，
  // 属最难排查的一类缺陷，因此一律拒绝（`requiresFiveStep` 只允许 false 且
  // MUST NOT 声明 `steps`）。
  if (question.requiresFiveStep || question.steps !== undefined) {
    throw new Error(`${path}: 当前版本不再使用五步引导，requiresFiveStep / steps MUST NOT 声明`)
  }
  const hints = question.hints
  if (!Array.isArray(hints) || hints.length !== 5) throw new Error(`${path}.hints: exactly five levels are required`)
  hints.forEach((hint, index) => nonEmptyString(hint, `${path}.hints[${index}]`))
  validateAnswer(question.answer, `${path}.answer`)
  const answerRecord = record(question.answer, `${path}.answer`)
  if (format === 'choice') {
    validateChoiceOptions(question.options, `${path}.options`)
    const optionId = answerRecord.optionId
    if (typeof optionId !== 'string' || !CHOICE_IDS.includes(optionId as ChoiceId)) {
      throw new Error(`${path}.answer.optionId: expected A, B, C, or D`)
    }
    if (!(question.options as Array<{ id: string }>).some((option) => option.id === optionId)) {
      throw new Error(`${path}.answer.optionId: correct option is not in options`)
    }
  } else {
    if (question.options !== undefined) throw new Error(`${path}.options: open question must not declare options`)
    if (answerRecord.optionId !== undefined) throw new Error(`${path}.answer.optionId: open question must not declare optionId`)
  }
  if (question.themeStories !== undefined) validateThemeStories(question.themeStories, `${path}.themeStories`)
  validateWorkedExampleHint(hints, answerRecord, path)
  const tags = stringList(question.tags, `${path}.tags`)
  validateLengthOperands(question, path, tags)
  if (question.type === 'unknown-relation') {
    const expectedSkill = tags.some((tag) => ['missing-part', 'inverse-addition', 'inverse-subtraction'].includes(tag))
      ? 'skill-addsub-unknown' : 'skill-muldiv-unknown'
    if (!tags.includes(expectedSkill)) throw new Error(`${path}.tags: expected ${expectedSkill} for unknown relation`)
  }
  validateQuestionSources(question.sources, `${path}.sources`, question.type as QuizType, tags, grade)
  if (question.creatureRef !== undefined) nonEmptyString(question.creatureRef, `${path}.creatureRef`)

  if (!Array.isArray(question.similarQuestionIds)) throw new Error(`${path}.similarQuestionIds: expected an array`)
  question.similarQuestionIds.forEach((id, index) => nonEmptyString(id, `${path}.similarQuestionIds[${index}]`))
  if (new Set(question.similarQuestionIds).size !== question.similarQuestionIds.length) {
    throw new Error(`${path}.similarQuestionIds: duplicate references are forbidden`)
  }
  // 五步字段已在上面一律拒绝，这里不再需要按 `requiresFiveStep` 分叉校验步骤。
  return { ...(question as unknown as Question), grade, format }
}

/**
 * 校验带版本号的题库：版本字段、逐题规则，以及全部相似题引用。
 *
 * 一律按严格口径校验（题量 200–400、每格 ≥ 8、禁止五步字段）；C1 的过渡
 * 豁免常量与 `legacyContent` 选项已在 C2 题库扩容后删除。
 *
 * @param value 不可信的解析后 JSON 内容。
 * @throws {Error} 任一内容规则不满足时抛出，消息带出错的字段路径。
 */
export interface QuestionBankValidationOptions {
  /** 单元测试构造小样本时跳过总量/每格下限；生产加载 MUST 保持 false。 */
  allowPartial?: boolean
}

export function assertValidQuestionBank(
  value: unknown,
  options: QuestionBankValidationOptions = {},
): asserts value is QuestionBank {
  const bank = record(value, 'questionBank')
  nonEmptyString(bank.version, 'questionBank.version')
  const { minQuestions, maxQuestions, perGrade, minPerCell } = QUESTION_BANK_LIMITS
  if (!Array.isArray(bank.questions)) throw new Error('questionBank.questions: expected an array')
  const ids = new Set<string>()
  const questions = bank.questions.map((question, index) => {
    const validated = validateQuestion(question, `questionBank.questions[${index}]`)
    if (ids.has(validated.id)) throw new Error(`questionBank.questions[${index}].id: duplicate ${validated.id}`)
    ids.add(validated.id)
    return validated
  })

  if (!options.allowPartial) {
    if (questions.length < minQuestions || questions.length > maxQuestions) {
      throw new Error(`questionBank.questions: expected ${minQuestions}–${maxQuestions} questions`)
    }
    const grades = [...new Set(questions.map((question) => question.grade))].sort()
    for (const grade of grades) {
      const gradeQuestions = questions.filter((question) => question.grade === grade)
      for (const type of QUIZ_TYPES) {
        for (const difficulty of [1, 2, 3]) {
          const cell = gradeQuestions.filter((question) => question.type === type && question.difficulty === difficulty)
          // 该题型在该年级不适用（如 1 年级的乘除法）时允许为 0；其余题型/
          // 难度格必须达到下限，整格缺失同样失败。
          const applicable = grade === 1
            ? type !== 'mul-div'
            : type !== 'number-sense'
          if (applicable && cell.length < minPerCell) {
            throw new Error(
              `questionBank.questions: grade ${grade} ${type} difficulty ${difficulty} needs at least ${minPerCell} questions`,
            )
          }
        }
      }
      if (gradeQuestions.length !== perGrade) {
        throw new Error(`questionBank.questions: grade ${grade} needs exactly ${perGrade} questions`)
      }
    }
  }

  // 相似题引用是可选的：空数组合法（订正流程遇到空相似题时自动跳过，
  // 见 `useQuizSession` 的 queue）；一旦声明就必须指向同年级、同题型、
  // 共享技能、且答案表示（单位 / 算式形状）一致的题目。
  for (const [index, question] of questions.entries()) {
    for (const similarId of question.similarQuestionIds) {
      const target = questions.find((candidate) => candidate.id === similarId)
      if (target === undefined || similarId === question.id) {
        throw new Error(`questionBank.questions[${index}].similarQuestionIds: missing or self reference ${similarId}`)
      }
      if (target.grade !== question.grade) {
        throw new Error(`questionBank.questions[${index}].similarQuestionIds: grade mismatch ${similarId}`)
      }
      if (target.type !== question.type) throw new Error(`questionBank.questions[${index}].similarQuestionIds: type mismatch ${similarId}`)
      const skills = question.tags.filter((tag) => tag.startsWith('skill-') && target.tags.includes(tag))
      if (skills.length === 0) throw new Error(`questionBank.questions[${index}].similarQuestionIds: no shared skill tag with ${similarId}`)
      if (target.answer.unit !== question.answer.unit) throw new Error(`questionBank.questions[${index}].similarQuestionIds: answer unit mismatch ${similarId}`)
      if (Boolean(target.answer.expression) !== Boolean(question.answer.expression)) {
        throw new Error(`questionBank.questions[${index}].similarQuestionIds: answer expression shape mismatch ${similarId}`)
      }
      if (target.similarQuestionIds.includes(question.id) && target.answer.value === question.answer.value) {
        throw new Error(`questionBank.questions[${index}].similarQuestionIds: linked answer ${similarId} must differ in value from ${question.id}`)
      }
    }
  }
}

/**
 * 一次性把题目按三个正交维度分组，供按维度取题（避免每次查询都全量遍历）。
 *
 * @param questions 已通过校验的题目记录。
 * @returns 各维度下的可变数组（题目在题库加载后不再变动）。
 */
export function createQuestionIndexes(questions: readonly Question[]): QuestionIndexes {
  const byCategory = Object.fromEntries(QUEST_CATEGORIES.map((category) => [category, []])) as unknown as QuestionIndexes['byCategory']
  const byType = Object.fromEntries(QUIZ_TYPES.map((type) => [type, []])) as unknown as QuestionIndexes['byType']
  const byDifficulty: QuestionIndexes['byDifficulty'] = { 1: [], 2: [], 3: [] }
  const byGrade: QuestionIndexes['byGrade'] = { 1: [], 2: [], 3: [] }
  for (const question of questions) {
    byCategory[question.category].push(question)
    byType[question.type].push(question)
    byDifficulty[question.difficulty].push(question)
    byGrade[question.grade].push(question)
  }
  return { byCategory, byType, byDifficulty, byGrade }
}

/**
 * 校验 4 条带来源的图鉴条目，并拒绝"唯一固定深度"的表述。
 *
 * @param value 不可信的解析后 JSON 内容。
 * @throws {Error} 任一内容规则不满足时抛出，消息带出错的字段路径。
 */
export function assertValidCreatures(value: unknown): asserts value is CreatureBank {
  const bank = record(value, 'creatures')
  nonEmptyString(bank.version, 'creatures.version')
  if (!Array.isArray(bank.creatures) || bank.creatures.length < 4 || bank.creatures.length > 40) {
    throw new Error('creatures.creatures: expected four to eight entries')
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
    nonEmptyString(creature.bodySize, `${path}.bodySize`)
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
    const sources = sourceList(creature.sources, `${path}.sources`)
    if (!hasSpeciesScopedSource(sources)) {
      throw new Error(`${path}.sources: expected a species-scoped or species-specific source`)
    }
    const photo = record(creature.photo, `${path}.photo`)
    if (typeof photo.ref !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(photo.ref)) {
      throw new Error(`${path}.photo.ref: expected a safe lowercase asset key`)
    }
    const creditSummary = nonEmptyString(photo.creditSummary, `${path}.photo.creditSummary`)
    const attribution = nonEmptyString(photo.attribution, `${path}.photo.attribution`)
    const license = nonEmptyString(photo.license, `${path}.photo.license`)
    nonEmptyString(photo.note, `${path}.photo.note`)
    secureHttpsUrl(photo.sourceUrl, `${path}.photo.sourceUrl`)
    secureHttpsUrl(photo.licenseUrl, `${path}.photo.licenseUrl`)
    // 署名必须真的写出被署名方与许可口径；"来源见图"这类空话等于没有署名。
    if (!/(CC|公有领域|public domain)/i.test(`${creditSummary}${attribution}${license}`)) {
      throw new Error(`${path}.photo: attribution must name the licence, e.g. CC BY 4.0 or 公有领域`)
    }
    if (creature.model !== undefined) {
      const model = record(creature.model, `${path}.model`)
      if (typeof model.ref !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(model.ref)) {
        throw new Error(`${path}.model.ref: expected a safe lowercase asset key`)
      }
      nonEmptyString(model.creditSummary, `${path}.model.creditSummary`)
      nonEmptyString(model.attribution, `${path}.model.attribution`)
      nonEmptyString(model.license, `${path}.model.license`)
      nonEmptyString(model.note, `${path}.model.note`)
      secureHttpsUrl(model.sourceUrl, `${path}.model.sourceUrl`)
      secureHttpsUrl(model.licenseUrl, `${path}.model.licenseUrl`)
    }
  })
  const johnson = bank.creatures.find((item) => record(item, 'creatures.entry').id === 'johnson-anglerfish')
  if (johnson === undefined) throw new Error('creatures: Johnson’s anglerfish entry is required')
  const anglerfish = record(johnson, 'creatures.johnson-anglerfish')
  if (!['Melanocetus johnsonii', 'Ceratioidei'].includes(String(anglerfish.scientificName))) {
    throw new Error('creatures.johnson-anglerfish.scientificName: expected a deep-sea anglerfish taxon')
  }
  const anglerfishDepth = record(anglerfish.depthRange, 'creatures.johnson-anglerfish.depthRange')
  if (anglerfishDepth.min !== 100 || anglerfishDepth.max !== 4500) {
    throw new Error('creatures.johnson-anglerfish.depthRange: expected FishBase species record 100–4,500 meters')
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
