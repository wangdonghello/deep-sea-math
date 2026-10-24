import type { Answer, ChoiceId, Difficulty, Grade, QuizType } from '@/domain/model/types'
import type {
  BuildImportedQuestionsOptions,
  ImportedQuestion,
  MistakeImportIssue,
  MistakeImportParseResult,
  MistakeImportRow,
} from './types'

const CHOICE_IDS: readonly ChoiceId[] = ['A', 'B', 'C', 'D']

/**
 * 错题导入解析：把 CSV / 粘贴文本变成题目草稿，不在这里写库。
 *
 * 设计立场：
 * 1. **不静默丢弃**：解析不了的行进 `issues`，家长能在导入页逐条修；
 * 2. **两种输入共用一套中间结构**：CSV 与粘贴文本只差分隔方式，之后
 *    都走 {@link buildImportedQuestions}；
 * 3. **答案先按文本保留**：数值 / 算式 / 选项的归一化在构造题目时做，
 *    避免解析层偷偷把 “8” 和 “8个” 判成不同东西。
 */

/** 极简 CSV 解析：支持双引号包裹、引号内逗号与双引号转义。 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.replace(/\r\n?/g, '\n')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index += 1 } else { quoted = false }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === ',') { row.push(field); field = ''; continue }
    if (char === '\n') {
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

const HEADER_ALIASES = {
  body: ['题目', '题干', '题目正文', 'body', 'question'],
  answer: ['答案', 'answer'],
  unit: ['单位', 'unit'],
  title: ['标题', 'title'],
  correctOption: ['正确选项', '正确答案', 'correctoption', 'correct'],
  hints: ['提示', '解析', 'hint', 'hints'],
  type: ['题型', '类型', 'type'],
  difficulty: ['难度', 'difficulty'],
  grade: ['年级', 'grade'],
  optionA: ['选项A', '选项a', 'a', 'optiona'],
  optionB: ['选项B', '选项b', 'b', 'optionb'],
  optionC: ['选项C', '选项c', 'c', 'optionc'],
  optionD: ['选项D', '选项d', 'd', 'optiond'],
} as const

type HeaderKey = keyof typeof HEADER_ALIASES

function normalizeHeader(value: string): HeaderKey | undefined {
  const key = value.trim().toLowerCase().replace(/\s+/g, '')
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES) as [HeaderKey, readonly string[]][]) {
    if (aliases.some((alias) => alias.toLowerCase().replace(/\s+/g, '') === key)) return canonical
  }
  return undefined
}

function parseDifficulty(value: string | undefined, fallback: Difficulty): Difficulty {
  const parsed = Number(value)
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : fallback
}

function parseGrade(value: string | undefined, fallback: Grade): Grade {
  const parsed = Number(value)
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : fallback
}

const TYPE_ALIASES: Record<string, QuizType> = {
  加减法: 'add-sub', 'add-sub': 'add-sub', 加法: 'add-sub', 减法: 'add-sub',
  乘除法: 'mul-div', 'mul-div': 'mul-div', 乘法: 'mul-div', 除法: 'mul-div',
  两步应用题: 'two-step-app', 'two-step-app': 'two-step-app', 应用题: 'two-step-app',
  未知数: 'unknown-relation', 'unknown-relation': 'unknown-relation',
  单位时间路线: 'unit-time-route', 'unit-time-route': 'unit-time-route', 时间: 'unit-time-route', 长度: 'unit-time-route',
  规律: 'pattern-data', 'pattern-data': 'pattern-data', 排序: 'pattern-data',
  数感: 'number-sense', 'number-sense': 'number-sense',
}

function parseType(value: string | undefined): QuizType | undefined {
  if (value === undefined) return undefined
  const key = value.trim().toLowerCase()
  return TYPE_ALIASES[key] ?? TYPE_ALIASES[value.trim()]
}

/** CSV 文本 → 中间行；第一行若识别为表头就按表头映射，否则按固定列序。 */
export function parseCsvMistakeImport(text: string): MistakeImportParseResult {
  const table = parseCsvRows(text)
  if (table.length === 0) return { rows: [], issues: [] }
  const first = table[0].map((cell) => normalizeHeader(cell))
  const hasHeader = first.some((header) => header !== undefined)
  const headerMap = hasHeader ? first : undefined
  const dataRows = hasHeader ? table.slice(1) : table
  const issues: MistakeImportIssue[] = []
  const rows: MistakeImportRow[] = []
  dataRows.forEach((cells, index) => {
    const raw = cells.join(',')
    const column = (canonical: HeaderKey, positional: number): string | undefined => {
      if (headerMap) {
        const at = headerMap.indexOf(canonical)
        return at === -1 ? undefined : cells[at]
      }
      return cells[positional]
    }
    const body = (column('body', 0) ?? '').trim()
    if (body === '') {
      if (raw.trim() !== '') issues.push({ row: index + 1, message: '缺少题目正文', raw })
      return
    }
    const optionValues: Record<ChoiceId, string | undefined> = {
      A: column('optionA', 3)?.trim(),
      B: column('optionB', 4)?.trim(),
      C: column('optionC', 5)?.trim(),
      D: column('optionD', 6)?.trim(),
    }
    const options: Partial<Record<ChoiceId, string>> = {}
    for (const id of CHOICE_IDS) if (optionValues[id]) options[id] = optionValues[id]
    const rawCorrect = (column('correctOption', 7) ?? '').trim().toUpperCase()
    const correctOption = CHOICE_IDS.includes(rawCorrect as ChoiceId) ? (rawCorrect as ChoiceId) : undefined
    rows.push({
      body,
      answer: (column('answer', 1) ?? '').trim(),
      unit: column('unit', 2)?.trim() || undefined,
      title: column('title', 8)?.trim() || undefined,
      options: Object.keys(options).length === 0 ? undefined : options,
      correctOption,
      hints: column('hints', 9)?.split('；').map((hint) => hint.trim()).filter(Boolean),
      type: parseType(column('type', 10)),
      difficulty: parseDifficulty(column('difficulty', 11), 1),
      grade: parseGrade(column('grade', 12), 1),
    })
  })
  return { rows, issues }
}

/**
 * 粘贴文本 → 中间行。
 *
 * 两种格式：
 * 1. 竖线格式：`题目 | 答案 | 单位 | 选项A | 选项B | 选项C | 选项D | 正确选项`
 * 2. 分块格式：题目、答案、选项等各占一行，用 `题目：` / `答案：` / `A.` 标注。
 */
export function parsePasteMistakeImport(text: string): MistakeImportParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const pipeLines = lines.filter((line) => line.includes('|'))
  if (pipeLines.length > 0) {
    const issues: MistakeImportIssue[] = []
    const rows: MistakeImportRow[] = []
    pipeLines.forEach((line, index) => {
      const cells = line.split('|').map((cell) => cell.trim())
      const body = cells[0] ?? ''
      if (body === '') { issues.push({ row: index + 1, message: '缺少题目正文', raw: line }); return }
      const options: Partial<Record<ChoiceId, string>> = {}
      CHOICE_IDS.forEach((id, optionIndex) => { if (cells[3 + optionIndex]) options[id] = cells[3 + optionIndex] })
      const rawCorrect = (cells[7] ?? '').toUpperCase()
      rows.push({
        body,
        answer: cells[1] ?? '',
        unit: cells[2] || undefined,
        options: Object.keys(options).length === 0 ? undefined : options,
        correctOption: CHOICE_IDS.includes(rawCorrect as ChoiceId) ? (rawCorrect as ChoiceId) : undefined,
      })
    })
    return { rows, issues }
  }

  const issues: MistakeImportIssue[] = []
  const rows: MistakeImportRow[] = []
  const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  blocks.forEach((block, index) => {
    const blockLines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    let body = ''
    let answer = ''
    let unit: string | undefined
    let title: string | undefined
    const options: Partial<Record<ChoiceId, string>> = {}
    let correctOption: ChoiceId | undefined
    const hints: string[] = []
    for (const line of blockLines) {
      const match = /^(题目|题干|答案|单位|标题|提示|解析|正确选项|正确答案)[：:]\s*(.*)$/.exec(line)
      if (match) {
        const [, label, rest] = match
        if (label === '题目' || label === '题干') body = rest
        else if (label === '答案') answer = rest
        else if (label === '单位') unit = rest
        else if (label === '标题') title = rest
        else if (label === '提示' || label === '解析') hints.push(rest)
        else if (label === '正确选项' || label === '正确答案') {
          const id = rest.trim().toUpperCase()
          if (CHOICE_IDS.includes(id as ChoiceId)) correctOption = id as ChoiceId
        }
        continue
      }
      const optionMatch = /^([A-Da-d])[.、．:：]\s*(.+)$/.exec(line)
      if (optionMatch) {
        options[optionMatch[1].toUpperCase() as ChoiceId] = optionMatch[2].trim()
        continue
      }
      if (body === '') body = line
      else if (answer === '') answer = line
    }
    if (body === '') { issues.push({ row: index + 1, message: '这个分块没有找到题目', raw: block }); return }
    rows.push({
      body,
      answer,
      unit,
      title,
      options: Object.keys(options).length === 0 ? undefined : options,
      correctOption,
      hints: hints.length === 0 ? undefined : hints,
    })
  })
  return { rows, issues }
}

/** 统一入口：带表头/逗号走 CSV，否则按粘贴文本解析。 */
export function parseMistakeImportText(text: string): MistakeImportParseResult {
  const trimmed = text.trim()
  if (trimmed === '') return { rows: [], issues: [] }
  const firstLine = trimmed.split('\n')[0]
  const looksLikeCsv = (firstLine.includes(',') && /题目|题干|body|question/i.test(firstLine))
    || /^[^|\n]+,[^|\n]+/.test(trimmed)
  return looksLikeCsv ? parseCsvMistakeImport(trimmed) : parsePasteMistakeImport(trimmed)
}

function hash(input: string): string {
  let value = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0).toString(36)
}

function parseAnswerValue(answer: string): { value: number; expression?: string } | null {
  const trimmed = answer.trim()
  if (trimmed === '') return null
  const numeric = /^[-+]?\d+(?:\.\d+)?$/.exec(trimmed)
  if (numeric) return { value: Number(numeric[0]) }
  const expression = /^[-+×x*÷/\d\s()（）]+$/.test(trimmed)
    ? trimmed.replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    : undefined
  return expression === undefined ? null : { value: 0, expression }
}

/** 把中间行构造成可入库的自定义题目；不合法行返回 issue。 */
export function buildImportedQuestions(
  rows: readonly MistakeImportRow[],
  options: BuildImportedQuestionsOptions,
): { questions: ImportedQuestion[]; issues: MistakeImportIssue[] } {
  const questions: ImportedQuestion[] = []
  const issues: MistakeImportIssue[] = []
  rows.forEach((row, index) => {
    const grade = row.grade ?? options.grade
    const type = row.type ?? options.type
    const difficulty = row.difficulty ?? options.difficulty
    const optionLabels = row.options
    const hasOptions = optionLabels !== undefined && Object.keys(optionLabels).length >= 2
    let answer: Answer | null = parseAnswerValue(row.answer)
    let optionId: ChoiceId | undefined
    if (hasOptions) {
      const explicit = row.correctOption
      const matched = CHOICE_IDS.find((id) => optionLabels[id]?.trim() === row.answer.trim())
      optionId = explicit ?? matched
      if (optionId === undefined) {
        issues.push({ row: index + 1, message: '选择题需要“正确选项”，或让答案与某个选项完全一致', raw: row.body })
        return
      }
      answer = { value: Number(answer?.value ?? 0), optionId }
    }
    if (answer === null) {
      issues.push({ row: index + 1, message: '答案需要是数字或算式', raw: row.body })
      return
    }
    const id = options.idFor?.(row, index) ?? `custom-${hash(`${options.profileId}|${row.body}|${row.answer}`)}`
    questions.push({
      id,
      grade,
      format: hasOptions ? 'choice' : 'open',
      ...(hasOptions
        ? { options: CHOICE_IDS.flatMap((choiceId) => optionLabels?.[choiceId] === undefined ? [] : [{ id: choiceId, label: optionLabels[choiceId]! }]) }
        : {}),
      type,
      difficulty,
      category: 'basic',
      story: { title: row.title ?? '家长导入错题', body: row.body },
      requiresFiveStep: false,
      hints: row.hints === undefined || row.hints.length === 0
        ? ['先读题，找出已知数量和要问的问题。', '把已知和未知排成一道算式。', '算完后把答案代回题目检查。']
        : [...row.hints],
      answer,
      similarQuestionIds: [],
      tags: ['imported', `imported:${options.source}`, 'custom'],
      sources: ['local-parent-import'],
      importedBy: 'parent',
      importSource: options.source,
      importedAt: options.now,
    })
  })
  return { questions, issues }
}
