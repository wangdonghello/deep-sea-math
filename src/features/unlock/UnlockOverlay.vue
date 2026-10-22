<script setup lang="ts">
/**
 * `UnlockOverlay` —— 整组完成后的解锁反馈浮层（design §4）。
 *
 * 只做展示：奖励清单由 {@link useUnlockFeedback} 从事件日志推导，本组件不判断
 * "该弹不该弹"，也不认识事件结构（design §4 组件边界）。
 *
 * 两条刻意的取舍：
 * 1. **奖励名逐条列出**，而不是一句"恭喜你"：孩子需要知道今天具体换到了什么
 *    （spec creature-bestiary §解锁与奖励发放 的反馈要可指认）；
 * 2. **必须有一次显式关闭**，不是自动消失：自动消失会把"今天解锁了什么"变成
 *    一眼扫过的装饰，而这是本产品唯一的外显奖励通道。
 */
import type { UnlockReward } from './useUnlockFeedback'

defineProps<{
  /** 是否展示。 */
  open: boolean
  /** 待展示的奖励清单（顺序即发放顺序）。 */
  rewards: readonly UnlockReward[]
}>()

const emit = defineEmits<{ (event: 'close'): void }>()
</script>

<template>
  <div
    v-if="open"
    class="unlock-overlay"
    data-testid="unlock-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="unlock-overlay-title"
  >
    <section class="unlock-overlay__card">
      <h2 id="unlock-overlay-title" class="unlock-overlay__title">解锁成功！</h2>
      <p class="unlock-overlay__lead">这一组完成了，你获得了：</p>
      <ul class="unlock-overlay__rewards" data-testid="unlock-rewards">
        <li
          v-for="reward in rewards"
          :key="`${reward.kind}-${reward.targetId}`"
          class="unlock-overlay__reward"
          :data-kind="reward.kind"
          data-testid="unlock-reward"
        >
          <span class="unlock-overlay__icon" aria-hidden="true">{{
            reward.kind === 'badge' ? '🏅' : reward.kind === 'theme' ? '✨' : reward.kind === 'creature' ? '🐟' : '🌊'
          }}</span>
          <span class="unlock-overlay__label">{{ reward.label }}</span>
        </li>
      </ul>
      <button
        type="button"
        class="unlock-overlay__close"
        data-testid="unlock-overlay-close"
        @click="emit('close')"
      >
        知道了
      </button>
    </section>
  </div>
</template>

<style scoped>
.unlock-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: var(--ds-space-lg);
  /* 压暗背景：反馈是模态的，背后内容此刻不可交互 */
  background: rgb(4 16 32 / 72%);
}

.unlock-overlay__card {
  display: grid;
  gap: var(--ds-space-md);
  width: min(22rem, 100%);
  padding: var(--ds-space-xl);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-glass-surface);
  color: var(--ds-text-primary);
  text-align: center;
}

.unlock-overlay__title {
  margin: 0;
  color: var(--ds-accent-text);
}

.unlock-overlay__lead {
  margin: 0;
  color: var(--ds-text-secondary);
}

.unlock-overlay__rewards {
  display: grid;
  gap: var(--ds-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.unlock-overlay__reward {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-radius: var(--ds-radius-md);
  background: rgb(255 255 255 / 8%);
  font-size: var(--ds-font-size-body);
  text-align: left;
}

.unlock-overlay__close {
  min-height: 3rem;
  border: 0;
  border-radius: var(--ds-radius-md);
  background: var(--ds-accent-500);
  color: var(--ds-bg-deep);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
</style>
