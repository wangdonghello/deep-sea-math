import { describe, expect, it } from 'vitest'

import grade1 from '@/data/content/chinese/grade1.json'
import passages from '@/data/content/chinese/passages.json'
import { validateChineseContent } from '@/domain/chinese/schema'
import type { ChinesePassage, ChineseQuestion } from '@/domain/chinese/types'

const questions = grade1.questions as ChineseQuestion[]
const passageList = passages as ChinesePassage[]

describe('chinese content', () => {
  it('30 道一年级样例题通过校验', () => {
    expect(() => validateChineseContent({ questions, passages: passageList })).not.toThrow()
    expect(questions).toHaveLength(30)
    expect(new Set(questions.map((q) => q.kind)).size).toBe(5)
    expect(passageList.length).toBeGreaterThanOrEqual(3)
  })

  it('阅读题必须引用存在的短文', () => {
    const bad = { ...questions[0], id: 'bad', kind: 'reading' as const, passageId: 'missing' }
    expect(() => validateChineseContent({ questions: [bad], passages: passageList })).toThrow(/passageId/)
  })
})
