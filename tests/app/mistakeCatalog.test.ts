import { describe, expect, it } from 'vitest'

import { mergeMistakeCatalog, questionMetadata } from '@/app/mistakeCatalog'
import type { Question } from '@/domain/model/types'
import type { MistakeQuestionCatalog } from '@/features/mistakeBook/types'

const custom: Question = {
  id: 'custom-a',
  grade: 2,
  format: 'open',
  type: 'add-sub',
  difficulty: 1,
  category: 'basic',
  story: { title: '家长导入', body: '3+4=?' },
  requiresFiveStep: false,
  hints: ['读题'],
  answer: { value: 7 },
  similarQuestionIds: [],
  tags: ['imported'],
  sources: ['local-parent-import'],
}

describe('app: mistakeCatalog', () => {
  it('把自定义题追加到内置目录，不修改原目录', () => {
    const base: MistakeQuestionCatalog = { 'builtin-1': questionMetadata({ ...custom, id: 'builtin-1' }) }
    const merged = mergeMistakeCatalog(base, [custom])

    expect(merged['builtin-1']).toBeDefined()
    expect(merged['custom-a']).toMatchObject({ type: 'add-sub', story: { body: '3+4=?' } })
    expect(base['custom-a']).toBeUndefined()
  })

  it('没有自定义题时原样返回内置目录（不产生新对象）', () => {
    const base: MistakeQuestionCatalog = {}
    expect(mergeMistakeCatalog(base, [])).toBe(base)
  })
})
