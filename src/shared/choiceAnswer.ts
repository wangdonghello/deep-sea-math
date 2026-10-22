import type { ChoiceId, Question } from '@/domain/model/types'

/** 取选择题选项文本；未知选项回退为选项 ID，避免界面出现空白。 */
export function choiceOptionLabel(question: Question, id: ChoiceId | string): string {
  return question.options?.find((option) => option.id === id)?.label ?? id
}

/**
 * 题目的可读答案。
 *
 * 选择题优先显示“B. 氧气”，开放题保留“算式优先，否则数值 + 单位”的规则。
 * 答题反馈、答案解析与错题打印共用这一处，避免三处各写一份后漂移。
 */
export function answerText(question: Question): string {
  if (question.answer.optionId !== undefined) {
    return `${question.answer.optionId}. ${choiceOptionLabel(question, question.answer.optionId)}`
  }
  const { expression, value, unit } = question.answer
  return expression ?? `${value}${unit ?? ''}`
}
