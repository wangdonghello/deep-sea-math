import type { MistakeBookItem, MistakeFilterState } from './types'

/** Filter projected mistakes by question type and question-level mastery. */
export function filterMistakes(
  mistakes: readonly MistakeBookItem[],
  filter: MistakeFilterState,
): MistakeBookItem[] {
  return mistakes.filter((mistake) =>
    (filter.type === 'all' || mistake.type === filter.type) &&
    (filter.masteryLevel === 'all' || (filter.masteryLevel === 'stable'
      ? mistake.topicMasteryLevel === 'stable'
      : mistake.questionMasteryLevel === filter.masteryLevel)),
  )
}
