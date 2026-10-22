import rawQuestionBank from './questionBank.json'
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
assertValidCreatures(rawCreatureBank)

/** 已通过运行时校验的题库，供组题、错题本与家长报告共用。 */
export const QUESTION_BANK: QuestionBank = {
  version: (rawQuestionBank as QuestionBank).version,
  questions: (rawQuestionBank as QuestionBank).questions.map(normalizeQuestion),
}

/** 已通过运行时校验的图鉴库，供地图与观察舱共用。 */
export const CREATURE_BANK = rawCreatureBank as CreatureBank

/** 预建的三个维度索引（槽位 / 题型 / 难度），供消费者按维度取题。 */
export const QUESTION_INDEX = createQuestionIndexes(QUESTION_BANK.questions)
