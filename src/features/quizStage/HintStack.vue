<script setup lang="ts">
import type { RevealedHint } from '@/domain/hint/hintChainSelector'

/**
 * 分层提示栈。
 *
 * `showRevealButton` 由父级按作答阶段决定：答题页改为底部统一动作区后，
 * 「我需要提示」按钮搬到了动作区（`data-testid="action-hint"`），此处传
 * `false` 避免出现第二个入口；缺省 `true` 保持组件独立使用时（如 HintStack
 * 单测）仍有展开入口。
 */
withDefaults(defineProps<{
  hints: readonly RevealedHint[]
  used: number
  showRevealButton?: boolean
}>(), { showRevealButton: true })
const emit = defineEmits<{ reveal: [] }>()
</script>

<template>
  <section class="hint-stack" aria-label="分层提示">
    <p v-for="hint in hints" :key="hint.layer" data-testid="hint-layer">
      <strong>提示 {{ hint.layer }}：</strong>{{ hint.text }}
    </p>
    <button v-if="showRevealButton" type="button" data-testid="reveal-hint" :disabled="used >= 5" @click="emit('reveal')">
      我需要提示
    </button>
  </section>
</template>
