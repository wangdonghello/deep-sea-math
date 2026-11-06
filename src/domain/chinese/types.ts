/** 语文题型与内容模型（v4.1）。 */
export type ChineseKind = 'pinyin' | 'character' | 'word' | 'reading' | 'poem'

export interface ChineseOption {
  id: 'A' | 'B' | 'C' | 'D'
  label: string
}

export interface ChineseQuestion {
  id: string
  subject: 'chinese'
  grade: 1 | 2 | 3 | 4 | 5 | 6
  difficulty: 1 | 2 | 3
  kind: ChineseKind
  skill: string
  prompt: string
  audio?: string
  options?: ChineseOption[]
  answer: { value: string; optionId?: 'A' | 'B' | 'C' | 'D' }
  explanation: string
  hints: string[]
  passageId?: string
  tags: string[]
}

export interface ChinesePassage {
  id: string
  grade: 1 | 2 | 3 | 4 | 5 | 6
  title: string
  body: string
  audio?: string
}
