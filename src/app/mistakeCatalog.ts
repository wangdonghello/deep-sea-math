import type { Question } from '@/domain/model/types'
import type {
  MistakeQuestionCatalog,
  MistakeQuestionMetadata,
} from '@/features/mistakeBook/types'

/** 把一道题库题目压成错题本展示所需的元数据。 */
export function questionMetadata(question: Question): MistakeQuestionMetadata {
  return {
    type: question.type,
    story: { title: question.story.title, body: question.story.body },
    options: question.options,
    answer: question.answer,
    hints: question.hints,
    similarQuestionIds: question.similarQuestionIds,
  }
}

/**
 * 合并内置题库目录与家长导入的自定义题目。
 *
 * 自定义题目后写覆盖同名内置 id：正常不会重名（自定义 id 带 `custom-` 前缀），
 * 但若家长导入了与内置同 id 的题，以本机导入为准更符合“这是我孩子的题”。
 */
export function mergeMistakeCatalog(
  base: MistakeQuestionCatalog,
  customQuestions: readonly Question[],
): MistakeQuestionCatalog {
  if (customQuestions.length === 0) return base
  return {
    ...base,
    ...Object.fromEntries(customQuestions.map((question) => [question.id, questionMetadata(question)])),
  }
}
