import { createQuestion } from '@/domain/model/types'
import type { Question } from '@/domain/model/types'

/**
 * Temporary similar-question links for the playable demo pool.
 * Remove this mapping once Task 8's questionBank supplies authoritative links.
 */
export const DEMO_SIMILAR_QUESTION_MAPPING: Readonly<Record<string, readonly string[]>> = {
  'demo-basic-1': ['demo-similar-basic-1'],
}

/** Temporary content paired to DEMO_SIMILAR_QUESTION_MAPPING until Task 8. */
export const DEMO_SIMILAR_QUESTIONS: readonly Question[] = [
  createQuestion({
    id: 'demo-similar-basic-1', type: 'add-sub', difficulty: 1, category: 'basic',
    story: { title: '海星找到贝壳', body: '海星先找到 5 个贝壳，又找到 2 个，一共有几个？' },
    hints: ['读一读找到的贝壳', '先找到 5 个', '再找到 2 个', '5 + 2 = ?', '一共 7 个'],
    answer: { value: 7, unit: '个' }, similarQuestionIds: [],
    tags: ['demo', 'similar'], sources: ['T13 临时相似题；Task 8 落地后删除'],
  }),
]
