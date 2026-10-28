import { describe, expect, it } from 'vitest'

import { QUESTION_BANK } from '@/data/content'
import { assertValidQuestionBank } from '@/data/content/schema'
import type { Question } from '@/domain/model/types'

function cloneBase(): Question {
  const question = structuredClone(QUESTION_BANK.questions[0])
  question.similarQuestionIds = []
  return question
}

function bankWith(questions: Question[]): { version: string; questions: Question[] } {
  return { version: '4.0.0', questions }
}

describe('grade question bank validation', () => {
  it('accepts a valid single-grade sample', () => {
    expect(() => assertValidQuestionBank(bankWith([cloneBase()]), { allowPartial: true })).not.toThrow()
  })

  it('rejects an unknown grade', () => {
    const question = cloneBase()
    ;(question as unknown as { grade: number }).grade = 7
    expect(() => assertValidQuestionBank(bankWith([question]), { allowPartial: true })).toThrow(/grade 1–6/)
  })

  it('rejects a cross-grade similar question', () => {
    const first = cloneBase()
    const second = cloneBase()
    second.id = 'grade-2-copy'
    second.grade = 2
    second.tags = second.tags.map((tag) => tag.replace('3.NBT.2', '2.NBT.5'))
    second.sources = ['https://www.thecorestandards.org/Math/Content/2/NBT/']
    first.similarQuestionIds = [second.id]
    second.similarQuestionIds = [first.id]
    expect(() => assertValidQuestionBank(bankWith([first, second]), { allowPartial: true })).toThrow(/grade mismatch/)
  })

  it('rejects a choice question with three options', () => {
    const question = cloneBase()
    question.format = 'choice'
    question.options = [
      { id: 'A', label: '1' },
      { id: 'B', label: '2' },
      { id: 'C', label: '3' },
    ]
    question.answer = { value: 0, optionId: 'A' }
    expect(() => assertValidQuestionBank(bankWith([question]), { allowPartial: true })).toThrow(/exactly four options/)
  })

  it('rejects a choice question whose correct option is missing', () => {
    const question = cloneBase()
    question.format = 'choice'
    question.options = [
      { id: 'A', label: '1' },
      { id: 'B', label: '2' },
      { id: 'C', label: '3' },
      { id: 'D', label: '4' },
    ]
    question.answer = { value: 0, optionId: 'E' as never }
    expect(() => assertValidQuestionBank(bankWith([question]), { allowPartial: true })).toThrow(/optionId/)
  })

  it('rejects an unknown theme story key', () => {
    const question = cloneBase()
    question.themeStories = { mars: { title: '火星', body: '不存在的主题' } } as never
    expect(() => assertValidQuestionBank(bankWith([question]), { allowPartial: true })).toThrow(/unknown theme/)
  })

  it('rejects a grade 1 multiplication question', () => {
    const question = cloneBase()
    question.grade = 1
    question.type = 'mul-div'
    expect(() => assertValidQuestionBank(bankWith([question]), { allowPartial: true })).toThrow(/grade 1 must not contain/)
  })
})
