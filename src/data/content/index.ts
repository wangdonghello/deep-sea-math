import rawQuestionBank from './questionBank.grade3.json'
import rawGrade2QuestionBank from './questionBank.grade2.json'
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

/** 按年级取题库；第二版组题与错题本按档案年级选择。 */
export const QUESTION_BANK_BY_GRADE: Partial<Record<1 | 2 | 3, QuestionBank>> = {
  2: GRADE2_BANK,
  3: QUESTION_BANK,
}

/** 已通过运行时校验的图鉴库，供地图与观察舱共用。 */
export const CREATURE_BANK = rawCreatureBank as CreatureBank

/** 预建的三个维度索引（槽位 / 题型 / 难度），供消费者按维度取题。 */
export const QUESTION_INDEX = createQuestionIndexes(QUESTION_BANK.questions)

/** 按年级预建的索引；第二版组题按档案年级取对应索引。 */
export const QUESTION_INDEX_BY_GRADE = {
  2: createQuestionIndexes(GRADE2_BANK.questions),
  3: QUESTION_INDEX,
} as const
