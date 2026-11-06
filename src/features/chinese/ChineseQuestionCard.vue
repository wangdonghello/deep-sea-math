<script setup lang="ts">
/**
 * 语文题卡：拼音/识字/词语/阅读/古诗共用。
 *
 * 卡片只负责“呈现 + 收集作答”，判分与发奖在页面层完成，避免一个组件既判分又写事件。
 */
import { computed, ref } from 'vue'

import type { ChinesePassage, ChineseQuestion } from '@/domain/chinese/types'

const props = defineProps<{
  question: ChineseQuestion
  passage?: ChinesePassage
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'answer', questionId: string, submitted: string): void
}>()

const KIND_LABEL: Record<ChineseQuestion['kind'], string> = {
  pinyin: '拼音',
  character: '识字',
  word: '词语',
  reading: '阅读',
  poem: '古诗',
}

const input = ref('')
const audio = ref<HTMLAudioElement | null>(null)
const kindLabel = computed(() => KIND_LABEL[props.question.kind])

function choose(optionId: string): void {
  if (props.disabled === true) return
  emit('answer', props.question.id, optionId)
}

function submitText(): void {
  if (props.disabled === true || input.value.trim() === '') return
  emit('answer', props.question.id, input.value)
}

function playAudio(): void {
  if (props.question.audio === undefined) return
  if (audio.value === null) audio.value = new Audio(`${import.meta.env.BASE_URL}audio/${props.question.audio}`)
  audio.value.currentTime = 0
  void audio.value.play().catch(() => {})
}
</script>

<template>
  <article class="cn-card" :data-kind="question.kind" data-testid="chinese-question-card">
    <header class="cn-card__head">
      <span class="cn-card__kind">{{ kindLabel }}</span>
      <button
        v-if="question.audio !== undefined"
        type="button"
        class="cn-card__audio"
        data-testid="chinese-audio"
        @click="playAudio"
      >🔊 再听一遍</button>
    </header>

    <section v-if="passage !== undefined" class="cn-card__passage" data-testid="chinese-passage">
      <strong>{{ passage.title }}</strong>
      <p>{{ passage.body }}</p>
    </section>

    <p class="cn-card__prompt">{{ question.prompt }}</p>

    <div v-if="question.options !== undefined" class="cn-card__options" role="group" aria-label="选项">
      <button
        v-for="option in question.options"
        :key="option.id"
        type="button"
        class="cn-card__option"
        :data-testid="`option-${option.id}`"
        :disabled="disabled"
        @click="choose(option.id)"
      >
        <span class="cn-card__option-id">{{ option.id }}</span>
        <span>{{ option.label }}</span>
      </button>
    </div>

    <form v-else class="cn-card__open" @submit.prevent="submitText">
      <input
        v-model="input"
        data-testid="chinese-input"
        :disabled="disabled"
        placeholder="在这里作答"
        aria-label="答案"
      >
      <button type="submit" data-testid="chinese-submit" :disabled="disabled">确定</button>
    </form>
  </article>
</template>

<style scoped>
.cn-card {
  display: grid;
  gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: rgb(8 28 48 / 86%);
  box-shadow: 0 12px 38px rgb(0 0 0 / 22%);
}
.cn-card__head { display: flex; align-items: center; justify-content: space-between; }
.cn-card__kind {
  padding: 2px 10px;
  border-radius: var(--ds-radius-pill);
  background: rgb(126 220 255 / 14%);
  color: var(--ds-accent-300);
  font-size: .75rem;
  font-weight: 700;
}
.cn-card__audio {
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-pill);
  background: transparent;
  color: var(--ds-text-secondary);
  font: inherit;
  font-size: .75rem;
  padding: .25rem .7rem;
}
.cn-card__passage {
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-left: 3px solid var(--ds-accent-300);
  border-radius: var(--ds-radius-sm);
  background: rgb(126 220 255 / 6%);
  color: var(--ds-text-primary);
}
.cn-card__passage p { margin: 4px 0 0; line-height: 1.7; }
.cn-card__prompt { margin: 0; color: var(--ds-text-primary); font-size: 1.05rem; line-height: 1.65; }
.cn-card__options { display: grid; gap: var(--ds-space-sm); }
.cn-card__option {
  display: flex; align-items: center; gap: var(--ds-space-sm);
  min-height: 3rem; padding: 0 var(--ds-space-md);
  border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md);
  background: rgb(6 20 36 / 70%); color: var(--ds-text-primary);
  font: inherit; text-align: left;
}
.cn-card__option:active { transform: scale(.99); }
.cn-card__option-id {
  display: grid; place-items: center; width: 1.6rem; height: 1.6rem;
  border-radius: 50%; background: rgb(126 220 255 / 14%);
  color: var(--ds-accent-300); font-size: .8rem; font-weight: 700;
}
.cn-card__open { display: flex; gap: var(--ds-space-sm); }
.cn-card__open input {
  flex: 1; min-height: 3rem; padding: 0 var(--ds-space-md);
  border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md);
  background: rgb(4 14 26 / 80%); color: var(--ds-text-primary); font: inherit;
}
.cn-card__open button {
  min-height: 3rem; padding: 0 var(--ds-space-lg);
  border: 1px solid var(--ds-glow-primary); border-radius: var(--ds-radius-pill);
  background: rgb(24 78 116 / 82%); color: var(--ds-text-primary); font: inherit; font-weight: 700;
}
</style>
