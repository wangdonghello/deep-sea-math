<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { redact } from '@/shared/redact'
import type { Question } from '@/domain/model/types'
import HintStack from '@/features/quizStage/HintStack.vue'
import StageHeader from '@/features/quizStage/StageHeader.vue'
import QuizStage from '@/features/quizStage/QuizStage.vue'
import type { QuizSessionStore } from '@/features/quizStage/useQuizSession'
import { useQuizSession } from '@/features/quizStage/useQuizSession'

const props = defineProps<{
  sessionId: string
  profileId: string
  questions?: readonly Question[]
  similarQuestionPool?: readonly Question[]
  store: QuizSessionStore
  clock?: () => number
  idGenerator?: () => string
  logger?: (entry: Record<string, unknown>) => void
}>()

const session = useQuizSession({
  sessionId: props.sessionId, profileId: props.profileId, questions: props.questions,
  similarQuestionPool: props.similarQuestionPool,
  store: props.store, clock: props.clock, idGenerator: props.idGenerator,
})
const errorMessage = ref('')
const question = computed(() => session.currentQuestion.value)

function logFailure(event: string, error: unknown): void {
  props.logger?.({ event, ...redact({ error }) })
}
async function run(action: () => Promise<unknown>, event: string): Promise<void> {
  errorMessage.value = ''
  try { await action() } catch (error) {
    errorMessage.value = '进度暂时无法保存，请稍后再试'
    logFailure(event, error)
  }
}

onMounted(() => { void run(session.refreshEvents, 'quiz-load-failed') })
</script>

<template>
  <main class="quest-view" data-testid="quest-view">
    <StageHeader
      v-if="question"
      :title="question.story.title"
      :position="session.currentPosition.value"
      :total="session.totalQuestions.value"
    />
    <QuizStage
      v-if="question"
      :key="question.id"
      :question="question"
      @submit="run(() => session.submitAnswer($event), 'quiz-submit-failed')"
    />
    <HintStack
      v-if="question"
      :key="`hints-${question.id}`"
      :question="question"
      :used="session.usedHintLevel.value"
      @reveal="run(session.useHint, 'quiz-hint-failed')"
    />
    <p v-if="session.feedback.value" data-testid="quiz-feedback">{{ session.feedback.value }}</p>
    <button v-if="question" type="button" data-testid="reveal-answer" :disabled="session.submitting.value" @click="run(session.revealAnswer, 'quiz-reveal-failed')">
      直接看答案
    </button>
    <p v-if="errorMessage" role="status">{{ errorMessage }}</p>
    <p v-if="!question && !errorMessage" data-testid="quest-completed">这一组完成啦，继续探索深海吧！</p>
  </main>
</template>

<style scoped>
.quest-view { display: grid; gap: 1rem; max-width: 42rem; margin: 0 auto; padding: 1rem; }
.quest-view > button { min-height: 3rem; border: 0; border-radius: 1rem; background: var(--color-accent, #ffb454); color: #162c48; font-weight: 700; }
[data-testid="quiz-feedback"] { color: var(--color-text, #fff); }
</style>
