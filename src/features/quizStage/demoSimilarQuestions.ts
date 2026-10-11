import { createQuestion } from '@/domain/model/types'
import type { Question } from '@/domain/model/types'

/**
 * `features/quizStage/demoSimilarQuestions.ts` —— 演示题池的相似题配对。
 *
 * 只在未注入题库时兜底（见 `useQuizSession` 的 `isDemoSession` 分支）；正式路径
 * 的相似题由题库的 `similarQuestionIds` 提供。配对刻意只补一组：演示池只需要
 * 足够走通「答错 → 订正 → 追加相似题」这一条链路。
 */
export const DEMO_SIMILAR_QUESTION_MAPPING: Readonly<Record<string, readonly string[]>> = {
  'demo-basic-1': ['demo-similar-basic-1'],
}

/** 演示题池的相似题内容（与 {@link DEMO_SIMILAR_QUESTION_MAPPING} 配对）。 */
export const DEMO_SIMILAR_QUESTIONS: readonly Question[] = [
  createQuestion({
    id: 'demo-similar-basic-1', type: 'add-sub', difficulty: 1, category: 'basic',
    story: { title: '海星找到贝壳', body: '海星先找到 5 个贝壳，又找到 2 个，一共有几个？' },
    hints: ['读一读找到的贝壳', '先找到 5 个', '再找到 2 个', '5 + 2 = ?', '一共 7 个'],
    answer: { value: 7, unit: '个' }, similarQuestionIds: [],
    tags: ['demo', 'similar'], sources: ['演示相似题：正式路径见 data/content/questionBank.json'],
  }),
]
