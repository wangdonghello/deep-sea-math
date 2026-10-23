import { describe, expect, it } from 'vitest'

import { QUESTION_BANK_BY_GRADE } from '@/data/content'

function numbersOf(text: string): number[] {
  return text.match(/\d+/g)?.map(Number) ?? []
}

describe('grade 1/2 arithmetic audit', () => {
  it('grade 1 unit/time/route answers follow sum or difference and match units', () => {
    const questions = QUESTION_BANK_BY_GRADE[1]?.questions.filter(
      (question) => question.type === 'unit-time-route',
    ) ?? []
    for (const question of questions) {
      const [a, b] = numbersOf(question.story.body)
      const expected = question.story.body.includes('相差') ? Math.abs(a - b) : a + b
      expect(question.answer.value, question.story.body).toBe(expected)
      const unit = question.story.body.includes('毫升') ? '毫升'
        : question.story.body.includes('厘米') ? '厘米'
          : question.story.body.includes('分钟') ? '分钟'
            : question.story.body.includes('元') ? '元'
              : '米'
      expect(question.answer.unit).toBe(unit)
    }
  })

  it('grade 1/2 “下一个数” answers are the fifth term, not the fourth', () => {
    for (const grade of [1, 2] as const) {
      for (const question of QUESTION_BANK_BY_GRADE[grade]?.questions ?? []) {
        if (question.type !== 'pattern-data' || !question.story.body.includes('下一个数')) continue
        const values = numbersOf(question.story.body)
        const step = values[1] - values[0]
        expect(question.answer.value, question.story.body).toBe(values.at(-1)! + step)
      }
    }
  })

  it('grade 2 multiplication/division answers and units match the wording', () => {
    const questions = QUESTION_BANK_BY_GRADE[2]?.questions.filter(
      (question) => question.type === 'mul-div',
    ) ?? []
    for (const question of questions) {
      const values = numbersOf(question.story.body)
      const [a, b] = values
      if (question.story.body.includes('平均分给')) {
        expect(question.answer.value, question.story.body).toBe(a / b)
        expect(question.answer.unit).toBe('颗')
      } else if (question.story.body.includes('每盒装')) {
        expect(question.answer.value, question.story.body).toBe(a / b)
        expect(question.answer.unit).toBe('盒')
      } else {
        expect(question.answer.value, question.story.body).toBe(a * b)
      }
    }
  })

  it('grade 2 grouping questions use multiplication totals and sensible units', () => {
    const questions = QUESTION_BANK_BY_GRADE[2]?.questions.filter(
      (question) => question.type === 'unknown-relation',
    ) ?? []
    for (const question of questions) {
      if (question.story.body.includes('可以分成几个小组')) {
        const [each, total] = numbersOf(question.story.body)
        expect(question.answer.value, question.story.body).toBe(total / each)
        expect(question.answer.unit).toBe('组')
      }
      if (question.story.body.includes('平均放进') && question.story.body.includes('每盒几个')) {
        const [total, boxes] = numbersOf(question.story.body)
        expect(question.answer.value, question.story.body).toBe(total / boxes)
        expect(question.answer.unit).toBe('个')
      }
    }
  })
})
