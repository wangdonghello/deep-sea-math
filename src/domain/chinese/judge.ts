import type { ChineseQuestion } from './types'

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, '').replace(/[，。！？、；：,.!?;:]/g, '')
}

/** 语文判分：有选项按 optionId，否则按文本归一化后比较。 */
export function judgeChinese(question: ChineseQuestion, submitted: string): boolean {
  if (question.options !== undefined && question.answer.optionId !== undefined) {
    return submitted.trim().toUpperCase() === question.answer.optionId
  }
  return normalize(submitted) === normalize(question.answer.value)
}
