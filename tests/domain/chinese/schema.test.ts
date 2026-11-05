import { describe, expect, it } from 'vitest'

import grade1 from '@/data/content/chinese/grade1.json'
import grade2 from '@/data/content/chinese/grade2.json'
import passages from '@/data/content/chinese/passages.json'
import passages2 from '@/data/content/chinese/passages-grade2.json'
import grade3 from '@/data/content/chinese/grade3.json'
import passages3 from '@/data/content/chinese/passages-grade3.json'
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

  it('40 道三年级题通过校验', () => {
    expect(() => validateChineseContent({ questions: g3, passages: p3 })).not.toThrow()
    expect(g3).toHaveLength(40)
    expect(new Set(g3.map((q) => q.kind)).size).toBe(5)
  })

  it('阅读题必须引用存在的短文', () => {
    const bad = { ...questions[0], id: 'bad', kind: 'reading' as const, passageId: 'missing' }
    expect(() => validateChineseContent({ questions: [bad], passages: passageList })).toThrow(/passageId/)
  })
})
