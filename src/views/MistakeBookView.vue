<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { replayProjections } from '@/domain/eventLog/replay'
import type { DomainEvent, QuizType } from '@/domain/model/types'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import MistakeFilter from '@/features/mistakeBook/MistakeFilter.vue'
import { filterMistakes } from '@/features/mistakeBook/filterMistakes'
import MistakeList from '@/features/mistakeBook/MistakeList.vue'
import type { MistakeBookItem, MistakeBookStore, MistakeFilterState, MistakeQuestionCatalog } from '@/features/mistakeBook/types'
import { redact } from '@/shared/redact'

const props = defineProps<{
  store: MistakeBookStore
  catalog: MistakeQuestionCatalog
  logger?: (entry: Record<string, unknown>) => void
}>()
const emit = defineEmits<{
  (event: 'practice', payload: { questionIds: string[]; similarQuestionIds: string[] }): void
}>()

const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)
const events = ref<readonly DomainEvent[]>([])
const loading = ref(true)
const loaded = ref(false)
const errorMessage = ref('')
const filter = ref<MistakeFilterState>({ type: 'all', masteryLevel: 'all' })
const questionTypeById = computed(() => Object.fromEntries(
  Object.entries(props.catalog).flatMap(([id, question]) => question === undefined ? [] : [[id, question.type]]),
) as Record<string, QuizType>)
const projections = computed(() => replayProjections(events.value, {
  profileId: profileId.value ?? undefined,
  questionTypeById: questionTypeById.value,
}))
const mistakes = computed<MistakeBookItem[]>(() => Object.values(projections.value.mistakeBook).map((entry) => {
  const question = props.catalog[entry.questionId]
  return {
    ...entry,
    type: question?.type ?? null,
    masteryLevel: projections.value.masteryByQuestion[entry.questionId]?.level ?? 'unmastered',
    ...(question?.story === undefined ? {} : { title: question.story.title }),
  }
}))
const visibleMistakes = computed(() => filterMistakes(mistakes.value, filter.value))

function logFailure(error: unknown): void {
  props.logger?.({ event: 'mistake-book-load-failed', ...redact({ error }) })
}

async function load(): Promise<void> {
  if (profileId.value === null) {
    loading.value = false
    loaded.value = true
    return
  }
  try {
    events.value = (await props.store.listEvents(profileId.value))
      .filter((event) => event.profileId === profileId.value)
    loaded.value = true
  } catch (error) {
    errorMessage.value = '错题本暂时无法打开，请稍后再试'
    logFailure(error)
  } finally {
    loading.value = false
  }
}

function practice(questionId: string): void {
  emit('practice', {
    questionIds: [questionId],
    similarQuestionIds: [...(props.catalog[questionId]?.similarQuestionIds ?? [])],
  })
}

onMounted(() => { void load() })
</script>

<template>
  <main class="mistake-book" data-testid="mistake-book">
    <h1>错题本</h1>
    <p v-if="!profileId" data-testid="mistake-no-profile">请先选择学习档案。</p>
    <p v-else-if="loading" data-testid="mistake-loading" role="status">正在整理错题…</p>
    <p v-else-if="errorMessage" data-testid="mistake-error" role="status">{{ errorMessage }}</p>
    <template v-else-if="loaded">
      <MistakeFilter v-model="filter" />
      <p v-if="mistakes.length === 0" data-testid="mistake-empty">
        这里还没有错题，继续探索时遇到的题目会收集在这里。
      </p>
      <p v-else-if="visibleMistakes.length === 0" data-testid="mistake-filter-empty">
        当前条件下没有错题，试试调整筛选吧。
      </p>
      <MistakeList v-else :entries="visibleMistakes" @practice="practice" />
    </template>
  </main>
</template>

<style scoped>
.mistake-book { display: grid; gap: 1rem; max-width: 42rem; margin: 0 auto; padding: 1rem; }
.mistake-list, ul { margin: 0; padding: 0; list-style: none; }
.mistake-book article { padding: 1rem; border-radius: 1rem; background: rgb(255 255 255 / 8%); }
.mistake-book button, select { min-height: 2.75rem; }
</style>
