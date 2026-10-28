import rawQuestionBank from './questionBank.grade3.json'
import rawGrade2QuestionBank from './questionBank.grade2.json'
import rawGrade1QuestionBank from './questionBank.grade1.json'
import rawGrade4QuestionBank from './questionBank.grade4.json'
import rawGrade5QuestionBank from './questionBank.grade5.json'
import rawGrade6QuestionBank from './questionBank.grade6.json'
import rawCreatureBank from './creatures.json'
import { normalizeQuestion } from '../../domain/model/normalize'
import {
  assertValidCreatures,
  assertValidQuestionBank,
  createQuestionIndexes,
  type CreatureBank,
  type QuestionBank,
} from './schema'

assertValidQuestionBank(rawQuestionBank)
assertValidQuestionBank(rawGrade2QuestionBank)
assertValidQuestionBank(rawGrade1QuestionBank)
assertValidQuestionBank(rawGrade4QuestionBank)
assertValidQuestionBank(rawGrade5QuestionBank)
assertValidQuestionBank(rawGrade6QuestionBank)
assertValidCreatures(rawCreatureBank)

/** 三年级题库（第一版既有组题路径继续使用）。 */
export const QUESTION_BANK: QuestionBank = {
  version: (rawQuestionBank as QuestionBank).version,
  questions: (rawQuestionBank as QuestionBank).questions.map(normalizeQuestion),
}

/** 二年级题库；与三年级分开加载、分开校验。 */
export const GRADE2_BANK: QuestionBank = {
  version: (rawGrade2QuestionBank as QuestionBank).version,
  questions: (rawGrade2QuestionBank as QuestionBank).questions.map(normalizeQuestion),
}

/** 一年级题库；不包含乘除法。 */
export const GRADE1_BANK: QuestionBank = {
  version: (rawGrade1QuestionBank as QuestionBank).version,
  questions: (rawGrade1QuestionBank as QuestionBank).questions.map(normalizeQuestion),
}

/** 4–6 年级题库；与 1–3 年级独立校验、独立索引。 */
export const GRADE4_BANK: QuestionBank = {
  version: (rawGrade4QuestionBank as QuestionBank).version,
  questions: (rawGrade4QuestionBank as QuestionBank).questions.map(normalizeQuestion),
}
export const GRADE5_BANK: QuestionBank = {
  version: (rawGrade5QuestionBank as QuestionBank).version,
  questions: (rawGrade5QuestionBank as QuestionBank).questions.map(normalizeQuestion),
}
export const GRADE6_BANK: QuestionBank = {
  version: (rawGrade6QuestionBank as QuestionBank).version,
  questions: (rawGrade6QuestionBank as QuestionBank).questions.map(normalizeQuestion),
}

/** 按年级取题库；v3.1 起覆盖 1–6 年级。 */
export const QUESTION_BANK_BY_GRADE: Record<1 | 2 | 3 | 4 | 5 | 6, QuestionBank> = {
  1: GRADE1_BANK,
  2: GRADE2_BANK,
  3: QUESTION_BANK,
  4: GRADE4_BANK,
  5: GRADE5_BANK,
  6: GRADE6_BANK,
}

/** 已通过运行时校验的图鉴库，供地图与观察舱共用。 */
export const CREATURE_BANK = rawCreatureBank as CreatureBank

/** 预建的三个维度索引（槽位 / 题型 / 难度），供消费者按维度取题。 */
export const QUESTION_INDEX = createQuestionIndexes(QUESTION_BANK.questions)

/** 按年级预建的索引；第二版组题按档案年级取对应索引。 */
export const QUESTION_INDEX_BY_GRADE = {
  1: createQuestionIndexes(GRADE1_BANK.questions),
  2: createQuestionIndexes(GRADE2_BANK.questions),
  3: QUESTION_INDEX,
  4: createQuestionIndexes(GRADE4_BANK.questions),
  5: createQuestionIndexes(GRADE5_BANK.questions),
  6: createQuestionIndexes(GRADE6_BANK.questions),
} as const
