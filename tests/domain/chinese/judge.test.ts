import { describe, expect, it } from 'vitest'

import { judgeChinese } from '@/domain/chinese/judge'
import type { ChineseQuestion } from '@/domain/chinese/types'

const base: ChineseQuestion = {
  id: 'q1', subject: 'chinese', grade: 1, difficulty: 1, kind: 'pinyin',
  skill: 'pinyin-tone', prompt: '“mā” 的声调？',
  options: [{ id: 'A', label: '第一声' }, { id: 'B', label: '第二声' }],
  answer: { value: '第一声', optionId: 'A' },
  explanation: '', hints: ['', ''], tags: [],
}

describe('judgeChinese', () => {
  it('选项按 optionId 判分', () => {
    expect(judgeChinese(base, 'A')).toBe(true)
    expect(judgeChinese(base, 'B')).toBe(false)
  })

  it('文本输入按归一化判分', () => {
    const text = { ...base, options: undefined, answer: { value: '日' } }
    expect(judgeChinese(text, ' 日 ')).toBe(true)
    expect(judgeChinese(text, '目')).toBe(false)
  })
})
