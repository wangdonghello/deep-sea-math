import type { ChoiceId, Difficulty, Grade, Question, QuizType } from '@/domain/model/types'

/** 家长导入错题时支持的来源。 */
export type MistakeImportSource = 'csv' | 'paste' | 'photo'

/** 导入前的原始行：CSV 与粘贴文本都先解析成这个中间结构。 */
export interface MistakeImportRow {
  /** 题干正文；空字符串表示这一行没有题目。 */
  readonly body: string
  /** 家长填写的答案文本；数值、算式或选项字母。 */
  readonly answer: string
  readonly unit?: string
  readonly title?: string
  readonly options?: Partial<Record<ChoiceId, string>>
  /** 选择题正确选项；缺省时用答案文本与选项内容匹配。 */
  readonly correctOption?: ChoiceId
  readonly hints?: readonly string[]
  readonly type?: QuizType
  readonly difficulty?: Difficulty
  readonly grade?: Grade
}

/** 解析失败的行，保留原始文本便于家长修正。 */
export interface MistakeImportIssue {
  readonly row: number
  readonly message: string
  readonly raw: string
}

/** `parseMistakeImportText` 的返回值；成功与失败行分开，不静默丢弃。 */
export interface MistakeImportParseResult {
  readonly rows: readonly MistakeImportRow[]
  readonly issues: readonly MistakeImportIssue[]
}

/** 构造自定义题目时的注入项；全部有默认值，方便单元测试固定。 */
export interface BuildImportedQuestionsOptions {
  readonly profileId: string
  readonly grade: Grade
  readonly type: QuizType
  readonly difficulty: Difficulty
  readonly source: MistakeImportSource
  readonly now: number
  /** 生成稳定 id；缺省用内容散列，重复导入同一题不会产生新 id。 */
  readonly idFor?: (row: MistakeImportRow, index: number) => string
}

/** 自定义题目：与内置题库同构，额外带来源审计字段。 */
export interface ImportedQuestion extends Question {
  readonly importedBy: 'parent'
  readonly importSource: MistakeImportSource
  readonly importedAt: number
}
