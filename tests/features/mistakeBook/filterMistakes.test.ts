import { describe, expect, it } from 'vitest'

import type { MistakeBookItem, MistakeFilterState } from '@/features/mistakeBook/types'
import { filterMistakes } from '@/features/mistakeBook/filterMistakes'

const mistakes: MistakeBookItem[] = [
  { questionId: 'add', wrongCount: 2, revealed: false, lastWrongAt: 100, corrected: false, correctedSimilarQuestionIds: [], type: 'add-sub', masteryLevel: 'unmastered' },
  { questionId: 'mul', wrongCount: 1, revealed: true, lastWrongAt: null, corrected: false, correctedSimilarQuestionIds: [], type: 'mul-div', masteryLevel: 'hinted' },
]

describe('filterMistakes', () => {
  it('applies type and mastery filters together', () => {
    const filter: MistakeFilterState = { type: 'add-sub', masteryLevel: 'unmastered' }
    expect(filterMistakes(mistakes, filter).map((mistake) => mistake.questionId)).toEqual(['add'])
  })

  it('returns all mistakes for the default all/all filters', () => {
    expect(filterMistakes(mistakes, { type: 'all', masteryLevel: 'all' })).toEqual(mistakes)
  })

  it('returns no entries when both selected dimensions exclude every item', () => {
    expect(filterMistakes(mistakes, { type: 'pattern-data', masteryLevel: 'stable' })).toEqual([])
  })
})
