import { computed, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

import { replayProjections } from '@/domain/eventLog/replay'
import type { DomainEvent, QuizType } from '@/domain/model/types'
import { filterMistakes } from './filterMistakes'
import type { MistakeBookItem, MistakeBookStore, MistakeFilterState, MistakeQuestionCatalog } from './types'

export function useMistakeBook(
  profileId: MaybeRefOrGetter<string | null>,
  store: MistakeBookStore,
  catalog: MistakeQuestionCatalog,
  logger?: (entry: Record<string, unknown>) => void,
) {
  const activeProfileId = computed(() => toValue(profileId))
  const events = ref<readonly DomainEvent[]>([])
  const loading = ref(true)
  const loaded = ref(false)
  const errorMessage = ref('')
  const filter = ref<MistakeFilterState>({ type: 'all', masteryLevel: 'all' })
  const questionTypeById = computed(() => Object.fromEntries(
    Object.entries(catalog).flatMap(([id, question]) => question === undefined ? [] : [[id, question.type]]),
  ) as Record<string, QuizType>)
  const projections = computed(() => replayProjections(events.value, {
    profileId: activeProfileId.value ?? undefined,
    questionTypeById: questionTypeById.value,
  }))

  const items = computed<MistakeBookItem[]>(() => Object.values(projections.value.mistakeBook).map((entry) => {
    const question = catalog[entry.questionId]
    return {
      ...entry,
      type: question?.type ?? null,
      questionMasteryLevel: projections.value.masteryByQuestion[entry.questionId]?.level ?? 'unmastered',
      topicMasteryLevel: question === undefined ? null : projections.value.masteryByTopic[question.type]?.level ?? 'unmastered',
      ...(question?.story === undefined ? {} : { title: question.story.title }),
    }
  }))
  const visibleItems = computed(() => filterMistakes(items.value, filter.value))

  async function load(id: string | null): Promise<void> {
    events.value = []
    errorMessage.value = ''
    if (id === null) {
      loading.value = false
      loaded.value = true
      return
    }
    loading.value = true
    loaded.value = false
    try {
      const result = await store.listEvents(id)
      if (activeProfileId.value === id) {
        events.value = result.filter((event) => event.profileId === id)
        loaded.value = true
      }
    } catch {
      if (activeProfileId.value === id) {
        errorMessage.value = '错题本暂时无法打开，请稍后再试'
        logger?.({ event: 'mistake-book-load-failed', errorType: 'read-failed' })
      }
    } finally {
      if (activeProfileId.value === id) loading.value = false
    }
  }

  function practicePayload(questionId: string): { questionIds: string[]; similarQuestionIds: string[] } {
    return {
      questionIds: [questionId],
      similarQuestionIds: [...(catalog[questionId]?.similarQuestionIds ?? [])],
    }
  }

  watch(activeProfileId, (id) => { void load(id) }, { immediate: true })
  return { activeProfileId, loading, loaded, errorMessage, filter, items, visibleItems, practicePayload }
}
