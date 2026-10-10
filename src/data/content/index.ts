import rawQuestionBank from './questionBank.json'
import rawCreatureBank from './creatures.json'
import {
  assertValidCreatures,
  assertValidQuestionBank,
  createQuestionIndexes,
  type CreatureBank,
  type QuestionBank,
} from './schema'

assertValidQuestionBank(rawQuestionBank)
assertValidCreatures(rawCreatureBank)

/** Validated question data shared by quiz and reporting features. */
export const QUESTION_BANK = rawQuestionBank as QuestionBank

/** Validated bestiary data shared by map and observation features. */
export const CREATURE_BANK = rawCreatureBank as CreatureBank

/** Precomputed category, quiz-type, and difficulty pools for consumers. */
export const QUESTION_INDEX = createQuestionIndexes(QUESTION_BANK.questions)
