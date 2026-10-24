import { describe, expect, it } from 'vitest'

import {
  buildImportedQuestions,
  parseCsvMistakeImport,
  parseMistakeImportText,
  parsePasteMistakeImport,
} from '@/features/mistakeImport/parseMistakeImport'

const base = { profileId: 'p1', grade: 2 as const, type: 'two-step-app' as const, difficulty: 1 as const, source: 'paste' as const, now: 1 }

describe('mistake import parsing', () => {
  it('parses a CSV with headers, quoted commas and escaped quotes', () => {
    const csv = '题目,答案,单位\n"小明有3个苹果,又买了4个,一共几个?",7,个\n"一打铅笔有12支",12,支\n'
    const { rows, issues } = parseCsvMistakeImport(csv)
    expect(issues).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ body: '小明有3个苹果,又买了4个,一共几个?', answer: '7', unit: '个' })
  })

  it('parses piped paste text', () => {
    const text = '14-6+1=?\n3+4=?\n'
    const piped = '小海星有13张卡片，送出6张，又得到1张，现在有多少张？ | 8 | 张\n'
    const { rows, issues } = parsePasteMistakeImport(piped)
    expect(text).toBeTruthy()
    expect(issues).toEqual([])
    expect(rows[0]).toMatchObject({ body: '小海星有13张卡片，送出6张，又得到1张，现在有多少张？', answer: '8', unit: '张' })
  })

  it('parses block paste text with options and correct option', () => {
    const text = [
      '题目：6×7=？',
      '答案：42',
      'A. 36',
      'B. 42',
      'C. 48',
      '正确选项：B',
      '',
      '题目：9+6=？',
      '答案：15',
    ].join('\n')
    const { rows, issues } = parsePasteMistakeImport(text)
    expect(issues).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ body: '6×7=？', answer: '42', correctOption: 'B' })
    expect(rows[0].options).toMatchObject({ A: '36', B: '42', C: '48' })
  })

  it('routes CSV-looking text to the CSV parser and otherwise to paste parser', () => {
    expect(parseMistakeImportText('题目,答案\n3+4,7').rows).toHaveLength(1)
    expect(parseMistakeImportText('题目：3+4\n答案：7').rows).toHaveLength(1)
  })

  it('builds numeric questions with deterministic ids and keeps issues for bad rows', () => {
    const { rows } = parseCsvMistakeImport('题目,答案,单位\n3+4=?,7,个\n算一算,不知道,\n')
    const result = buildImportedQuestions(rows, base)
    expect(result.issues).toHaveLength(1)
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({ id: expect.stringMatching(/^custom-/), answer: { value: 7 } })
    const again = buildImportedQuestions(rows, base).questions[0]
    expect(again.id).toBe(result.questions[0].id)
  })

  it('builds choice questions and reports missing correct option', () => {
    const rows = [
      { body: '6×7=？', answer: '', options: { A: '36', B: '42' }, correctOption: 'B' as const },
      { body: '9+6=？', answer: '15', options: { A: '14', B: '16' } },
    ]
    const { questions, issues } = buildImportedQuestions(rows, base)
    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({ format: 'choice', answer: { optionId: 'B' } })
    expect(issues[0]?.message).toContain('正确选项')
  })

  it('rejects a row whose answer is not numeric or an expression', () => {
    const { rows } = parseCsvMistakeImport('题目,答案\n3+4=?,不知道\n')
    const { questions, issues } = buildImportedQuestions(rows, base)
    expect(questions).toEqual([])
    expect(issues[0]?.message).toContain('数字或算式')
  })
})
