import { describe, expect, it } from 'vitest'

import grade1 from '@/data/content/chinese/grade1.json'
import grade2 from '@/data/content/chinese/grade2.json'
import passages from '@/data/content/chinese/passages.json'
import passages2 from '@/data/content/chinese/passages-grade2.json'
import grade3 from '@/data/content/chinese/grade3-challenge.json'
import passages3 from '@/data/content/chinese/passages-grade3-challenge.json'
import grade4 from '@/data/content/chinese/grade4.json'
import grade5 from '@/data/content/chinese/grade5.json'
import grade6 from '@/data/content/chinese/grade6.json'
import passages4 from '@/data/content/chinese/passages-grade4.json'
import passages5 from '@/data/content/chinese/passages-grade5.json'
import passages6 from '@/data/content/chinese/passages-grade6.json'
import { validateChineseContent } from '@/domain/chinese/schema'
import type { ChinesePassage, ChineseQuestion } from '@/domain/chinese/types'

const questions = grade1.questions as ChineseQuestion[]
const passageList = passages as ChinesePassage[]
const g2 = grade2.questions as ChineseQuestion[]
const p2 = passages2 as ChinesePassage[]
const g3 = grade3.questions as ChineseQuestion[]
const p3 = passages3 as ChinesePassage[]

describe('chinese content', () => {
  it('30 道一年级样例题通过校验', () => {
    expect(() => validateChineseContent({ questions, passages: passageList })).not.toThrow()
    expect(questions).toHaveLength(30)
    expect(new Set(questions.map((q) => q.kind)).size).toBe(5)
    expect(passageList.length).toBeGreaterThanOrEqual(3)
  })

  it('40 道二年级题通过校验', () => {
    expect(() => validateChineseContent({ questions: g2, passages: p2 })).not.toThrow()
    expect(g2).toHaveLength(40)
    expect(new Set(g2.map((q) => q.kind)).size).toBe(5)
  })

  it('50 道三年级挑战题通过校验', () => {
    expect(() => validateChineseContent({ questions: g3, passages: p3 })).not.toThrow()
    expect(g3).toHaveLength(50)
    expect(new Set(g3.map((q) => q.kind)).size).toBe(5)
  })

  it('4–6 年级题都通过校验且各 52 题', () => {
    for (const [questions, passages] of [
      [grade4.questions, passages4],
      [grade5.questions, passages5],
      [grade6.questions, passages6],
    ] as const) {
      expect(() => validateChineseContent({ questions: questions as ChineseQuestion[], passages: passages as ChinesePassage[] })).not.toThrow()
      expect(questions).toHaveLength(52)
    }
  })

  it('阅读题必须引用存在的短文', () => {
    const bad = { ...questions[0], id: 'bad', kind: 'reading' as const, passageId: 'missing' }
    expect(() => validateChineseContent({ questions: [bad], passages: passageList })).toThrow(/passageId/)
  })
})
