<script setup lang="ts">
/**
 * 语文答题页：6 题一轮，写 session-started / answer-submitted / session-completed。
 *
 * 判分在页面层完成，组件只收集作答；积分与宠物 XP 由现有账本和投影消费事件。
 */
import { computed, onMounted, ref } from 'vue'

import ChineseQuestionCard from '@/features/chinese/ChineseQuestionCard.vue'
import { judgeChinese } from '@/domain/chinese/judge'
import type { ChinesePassage, ChineseQuestion } from '@/domain/chinese/types'
import { randomUuid } from '@/domain/crypto/randomUuid'
import type { AnswerSubmittedEvent, DomainEvent, SessionCompletedEvent, SessionStartedEvent } from '@/domain/model/types'

type AppendableStore = {
  appendEvents(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

const props = defineProps<{
  profileId: string
  store: AppendableStore
  questions: readonly ChineseQuestion[]
  passages: readonly ChinesePassage[]
  clock?: () => number
}>()

const emit = defineEmits<{
  (event: 'complete'): void
  (event: 'exit'): void
}>()

const clock = props.clock ?? (() => Date.now())
const sessionId = `cn-${randomUuid()}`
const index = ref(0)
const started = ref(false)
const busy = ref(false)
const feedback = ref<{ correct: boolean; explanation: string } | null>(null)
const error = ref('')

const question = computed(() => props.questions[index.value])
const passage = computed(() => {
  const id = question.value?.passageId
  return id === undefined ? undefined : props.passages.find((item) => item.id === id)
})
const progress = computed(() => `${Math.min(index.value + 1, props.questions.length)}/${props.questions.length}`)

function eventBase() {
  return { profileId: props.profileId, occurredAt: clock() }
}

onMounted(async () => {
  const startedEvent: SessionStartedEvent = {
    ...eventBase(),
    eventId: randomUuid(),
    type: 'session-started',
    sessionId,
    questionIds: props.questions.map((item) => item.id),
    difficultyTrace: props.questions.map((item) => item.difficulty),
    subject: 'chinese',
    grade: 1,
  }
  try {
    await props.store.appendEvents([startedEvent])
    started.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : '语文探险没能开始，再试一次吧'
  }
})

async function onAnswer(questionId: string, submitted: string): Promise<void> {
  const current = question.value
  if (busy.value || feedback.value !== null || current === undefined || current.id !== questionId) return
  busy.value = true
  const correct = judgeChinese(current, submitted)
  const answer: AnswerSubmittedEvent = {
    ...eventBase(),
    eventId: randomUuid(),
    type: 'answer-submitted',
    sessionId,
    questionId,
    submitted,
    correct,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 0,
  }
  try {
    await props.store.appendEvents([answer])
    feedback.value = { correct, explanation: current.explanation }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '这一题没记上，再试一次吧'
  } finally {
    busy.value = false
  }
}

async function next(): Promise<void> {
  if (feedback.value === null) return
  feedback.value = null
  if (index.value + 1 < props.questions.length) {
    index.value += 1
    return
  }
  const completed: SessionCompletedEvent = {
    ...eventBase(),
    eventId: randomUuid(),
    type: 'session-completed',
    sessionId,
    rewards: [],
  }
  try {
    await props.store.appendEvents([completed])
    emit('complete')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '完成记录没保存，再试一次吧'
  }
}
</script>

<template>
  <main class="cn-quest" data-testid="chinese-quest">
    <header class="cn-quest__head">
      <button type="button" class="cn-quest__back" data-testid="chinese-quest-exit" @click="emit('exit')">← 返回</button>
      <span class="cn-quest__title">语文探险</span>
      <span class="cn-quest__progress">{{ progress }}</span>
    </header>

    <p v-if="error !== ''" class="cn-quest__error" role="alert">{{ error }}</p>
    <p v-else-if="!started" class="cn-quest__loading" role="status">正在准备今天的语文题…</p>

    <template v-else-if="question">
      <ChineseQuestionCard
        :key="question.id"
        :question="question"
        :passage="passage"
        :disabled="feedback !== null || busy"
        @answer="onAnswer"
      />
      <section v-if="feedback" class="cn-quest__feedback" :class="{ 'is-correct': feedback.correct }" data-testid="chinese-feedback">
        <strong>{{ feedback.correct ? '答对了！' : '再想一想' }}</strong>
        <p>{{ feedback.explanation }}</p>
        <button type="button" data-testid="chinese-next" @click="next">
          {{ index + 1 < questions.length ? '下一题' : '完成这轮' }}
        </button>
      </section>
    </template>
  </main>
</template>

<style scoped>
.cn-quest {
  display: grid;
  gap: var(--ds-space-md);
  width: min(46rem, 100%);
  min-height: 100dvh;
  margin: 0 auto;
  padding: var(--ds-space-lg) var(--ds-space-md) 3rem;
}
.cn-quest__head { display: flex; align-items: center; justify-content: space-between; }
.cn-quest__back {
  border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-pill);
  background: transparent; color: var(--ds-text-secondary); font: inherit; font-size: .8rem; padding: .3rem .7rem;
}
.cn-quest__title { color: var(--ds-text-primary); font-weight: 700; }
.cn-quest__progress { color: var(--ds-accent-300); font-variant-numeric: tabular-nums; }
.cn-quest__error { color: #ffd0a6; text-align: center; }
.cn-quest__loading { color: var(--ds-text-secondary); text-align: center; padding: 3rem 0; }
.cn-quest__feedback {
  display: grid; gap: var(--ds-space-sm); padding: var(--ds-space-lg);
  border: 1px solid #ffb27a; border-radius: var(--ds-radius-lg); background: rgb(74 38 20 / 55%);
}
.cn-quest__feedback.is-correct { border-color: #7ee0a8; background: rgb(18 58 42 / 55%); }
.cn-quest__feedback strong { color: var(--ds-text-primary); }
.cn-quest__feedback p { margin: 0; color: var(--ds-text-secondary); }
.cn-quest__feedback button {
  justify-self: start; min-height: 2.6rem; padding: 0 var(--ds-space-lg);
  border: 1px solid var(--ds-glow-primary); border-radius: var(--ds-radius-pill);
  background: rgb(24 78 116 / 82%); color: var(--ds-text-primary); font: inherit; font-weight: 700;
}
</style>
