<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { redact } from '@/shared/redact'
import type { Question } from '@/domain/model/types'
import AnswerExplanation from '@/features/quizStage/AnswerExplanation.vue'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import HintStack from '@/features/quizStage/HintStack.vue'
import StageHeader from '@/features/quizStage/StageHeader.vue'
import QuizStage from '@/features/quizStage/QuizStage.vue'
import type { QuizSessionStore } from '@/features/quizStage/useQuizSession'
import { useQuizSession } from '@/features/quizStage/useQuizSession'

const props = defineProps<{
  sessionId: string
  profileId: string
  /** 本组题目（必填，来自正式题库；见 `useQuizSession` 的说明）。 */
  questions: readonly Question[]
  similarQuestionPool?: readonly Question[]
  creatureId?: string
  zoneId?: string
  store: QuizSessionStore
  clock?: () => number
  idGenerator?: () => string
  logger?: (entry: Record<string, unknown>) => void
}>()

const emit = defineEmits<{
  /** 完成态点击「返回首页」：由路由层决定跳转（本视图不 import vue-router）。 */
  (event: 'go-home'): void
}>()

const session = useQuizSession({
  sessionId: props.sessionId, profileId: props.profileId, questions: props.questions,
  similarQuestionPool: props.similarQuestionPool,
  creatureId: props.creatureId, zoneId: props.zoneId,
  store: props.store, clock: props.clock, idGenerator: props.idGenerator,
})
const errorMessage = ref('')
/** 界面显示中的题（答对/看答案后按住原题，不立刻跳下一题）。 */
const question = computed(() => session.displayedQuestion.value)
/** 当前输入（数字或算式），提交由底部动作区统一发起。 */
const draft = ref('')

// 换题时清空输入，避免把上一题的答案带到新题上。
watch(() => question.value?.id, () => { draft.value = '' })

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
      v-model:answer="draft"
      :question="question"
      @submit="run(() => session.submitAnswer($event), 'quiz-submit-failed')"
    />
    <HintStack
      v-if="question"
      :key="`hints-${question.id}`"
      :hints="session.revealedHints.value"
      :used="session.usedHintLevel.value"
      :show-reveal-button="false"
      @reveal="run(session.useHint, 'quiz-hint-failed')"
    />
    <AnswerExplanation
      v-if="question && session.explanationVisible.value"
      :question="question"
    />
    <p v-if="session.feedback.value" data-testid="quiz-feedback">{{ session.feedback.value }}</p>
    <p v-if="session.duplicateSlotCount.value > 0" data-testid="duplicate-slot-fallback">
      题库暂时不够，重复题目已合并为一次练习。
    </p>

    <!-- 底部统一动作区：按作答阶段只显示两个按钮 -->
    <div v-if="question" class="quest-actions" data-testid="quest-actions">
      <template v-if="session.phase.value === 'answering'">
        <button
          type="button" data-testid="action-submit"
          :disabled="session.submitting.value || draft.trim() === ''"
          @click="run(() => session.submitAnswer(draft), 'quiz-submit-failed')"
        >提交答案</button>
        <button
          type="button" data-testid="action-hint"
          :disabled="session.submitting.value"
          @click="run(session.useHint, 'quiz-hint-failed')"
        >我需要提示</button>
      </template>
      <template v-else-if="session.phase.value === 'correct'">
        <button type="button" data-testid="action-next" @click="session.nextQuestion()">下一题</button>
        <button type="button" data-testid="action-explain" @click="session.showExplanation()">看答案详解</button>
      </template>
      <template v-else-if="session.phase.value === 'wrong'">
        <button
          type="button" data-testid="action-submit"
          :disabled="session.submitting.value || draft.trim() === ''"
          @click="run(() => session.submitAnswer(draft), 'quiz-submit-failed')"
        >提交答案</button>
        <button
          type="button" data-testid="action-reveal"
          :disabled="session.submitting.value"
          @click="run(session.revealAnswer, 'quiz-reveal-failed')"
        >看答案</button>
      </template>
      <template v-else-if="session.phase.value === 'revealed'">
        <button type="button" data-testid="action-next" @click="session.nextQuestion()">下一题</button>
      </template>
    </div>

    <p v-if="errorMessage" role="status">{{ errorMessage }}</p>
    <p v-if="!question && !errorMessage && session.practiceCompleted.value" data-testid="practice-completed">
      错题练习完成：本次获得 {{ session.practiceStars.value }} 颗错题星<template v-if="session.practiceFixedQuestionIds.value.length > 0">，{{ session.practiceFixedQuestionIds.value.length }} 道题已修复并移出错题本</template>。
    </p>
    <p v-else-if="!question && !errorMessage && session.sessionCompleted.value" data-testid="quest-completed">
      这一组完成啦，继续探索深海吧！
    </p>
    <template v-else-if="!question && !errorMessage">
      <p v-if="session.practiceQuestionAvailable.value" data-testid="quest-incomplete">
        已看完题目，但直接看答案不计入任务完成，仍可继续作答完成任务。
      </p>
      <p v-else data-testid="quest-incomplete">这一组尚未完成。</p>
      <button
        v-if="session.practiceQuestionAvailable.value"
        type="button"
        data-testid="continue-practice"
        @click="session.continuePractice"
      >继续练习</button>
    </template>
    <!-- 题组中途和完成后均提供返回首页出口；进度已逐题写入事件日志。 -->
    <BottomReturnButton test-id="quest-back-home" @back="emit('go-home')" />
  </main>
</template>

<style scoped>
.quest-view { display: grid; gap: 1rem; max-width: 42rem; margin: 0 auto; padding: 1rem 1rem calc(5rem + env(safe-area-inset-bottom)); }
.quest-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; }
.quest-actions button { min-height: 3rem; border: 0; border-radius: 1rem; background: var(--color-accent, #ffb454); color: #162c48; font-weight: 700; }
.quest-actions button[data-testid="action-hint"] { background: var(--color-panel, #17365b); color: var(--color-text, #fff); }
[data-testid="quiz-feedback"] { color: var(--color-text, #fff); }
</style>
