import { describe, expect, it } from 'vitest'

import { pickChineseDaily } from '@/domain/chinese/daily'
import type { ChineseQuestion } from '@/domain/chinese/types'

function q(id: string, kind: ChineseQuestion['kind'], skill: string): ChineseQuestion {
  return {
    id, subject: 'chinese', grade: 1, difficulty: 1, kind, skill, prompt: id,
    answer: { value: id }, explanation: '', hints: ['a', 'b'], tags: [],
  }
}

describe('pickChineseDaily', () => {
  it('抽 6 题、不重复、不连续同 skill', () => {
    const pool = [
      q('a', 'pinyin', 'pinyin-tone'), q('b', 'pinyin', 'pinyin-tone'),
      q('c', 'character', 'character-recognition'), q('d', 'word', 'word-usage'),
      q('e', 'reading', 'reading-inference'), q('f', 'poem', 'poem-recognition'),
      q('g', 'word', 'word-usage'), q('h', 'character', 'character-recognition'),
    ]
    const picked = pickChineseDaily(pool, 6, () => 0.5)
    expect(picked).toHaveLength(6)
    expect(new Set(picked.map((item) => item.id)).size).toBe(6)
    for (let i = 1; i < picked.length; i += 1) {
      expect(picked[i].skill).not.toBe(picked[i - 1].skill)
    }
  })
})
