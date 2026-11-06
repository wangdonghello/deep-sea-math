import type { ChinesePassage, ChineseQuestion } from './types'

const KINDS = new Set(['pinyin', 'character', 'word', 'reading', 'poem'])

function fail(message: string): never {
  throw new Error(message)
}

/** 校验语文题库与短文，内容错误必须在构建期暴露。 */
export function validateChineseContent(input: {
  questions: readonly ChineseQuestion[]
  passages: readonly ChinesePassage[]
}): void {
  if (input.questions.length === 0) fail('chinese questions: empty')
  const passageIds = new Set(input.passages.map((passage) => passage.id))
  const ids = new Set<string>()
  for (const question of input.questions) {
    const path = `chinese.questions[${question.id}]`
    if (ids.has(question.id)) fail(`${path}: duplicate id`)
    ids.add(question.id)
    if (question.subject !== 'chinese') fail(`${path}.subject`)
    if (![1, 2, 3, 4, 5, 6].includes(question.grade)) fail(`${path}.grade`)
    if (![1, 2, 3].includes(question.difficulty)) fail(`${path}.difficulty`)
    if (!KINDS.has(question.kind)) fail(`${path}.kind`)
    if (question.skill.trim() === '') fail(`${path}.skill`)
    if (question.prompt.trim() === '') fail(`${path}.prompt`)
    if (question.explanation.trim() === '') fail(`${path}.explanation`)
    if (question.hints.length < 2 || question.hints.length > 5) fail(`${path}.hints`)
    if (question.answer.value.trim() === '') fail(`${path}.answer.value`)
    if (question.kind === 'reading') {
      if (question.passageId === undefined || !passageIds.has(question.passageId)) {
        fail(`${path}.passageId: missing passage`)
      }
    }
    if (question.options !== undefined) {
      if (question.options.length < 2 || question.options.length > 4) fail(`${path}.options.length`)
      const optionIds = new Set(question.options.map((option) => option.id))
      if (optionIds.size !== question.options.length) fail(`${path}.options: duplicate id`)
      if (question.answer.optionId === undefined || !optionIds.has(question.answer.optionId)) {
        fail(`${path}.answer.optionId`)
      }
    }
    if (question.audio !== undefined && !question.audio.startsWith('chinese/')) {
      fail(`${path}.audio`)
    }
  }
  for (const passage of input.passages) {
    if (![1, 2, 3, 4, 5, 6].includes(passage.grade)) fail(`chinese.passages[${passage.id}].grade`)
    if (passage.body.trim() === '') fail(`chinese.passages[${passage.id}].body`)
  }
}
