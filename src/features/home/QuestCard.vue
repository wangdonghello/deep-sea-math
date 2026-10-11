<script setup lang="ts">
/**
 * 任务卡浮层（design §4 `HomeView` 的组成组件之二，方案 A 的下半屏）。
 *
 * 「浮起」是设计稿 A 的核心视觉：卡片压在地图上沿、-glass 拟态、上圆角大于
 * 下圆角，让下半屏看起来是从海里浮出来的一块板。为此 `HomeView` 给它负
 * margin 与更高层级，卡片本身只管把信息排清楚。
 *
 * 三个状态由 `state` prop 决定（判定在 composable，这里只渲染）：
 * - `empty`：无当日题组 → 「领取今日任务」（spec §首次进入生成当日题组）
 * - `active`：有未完成题组 → 进度 `N / 9` + 「开始下潜」
 * - `done`：当日题组已完成 → 只展示成果，不给重复入口
 *
 * 本组件不含任何业务规则：题量、进度、奖励文案全部由 HomeView 从
 * `useHomeQuest` 推导好后传入，因此它可以在无存储的环境里单独渲染。
 */
import { computed } from 'vue'

import type { QuestCardState } from './types'

const props = defineProps<{
  /** 展示状态；决定按钮文案与是否显示进度。 */
  state: QuestCardState
  /** 当前档案昵称（卡片标题）。 */
  nickname: string
  /** 已完成题数。 */
  answered: number
  /** 总题数（家长设置的三类数量之和，默认 9）。 */
  total: number
  /** 预计用时（分钟）。 */
  estimatedMinutes: number
  /** 目标奖励文案。 */
  rewardLabel: string
  /** 领取中：禁用按钮，防止同一小时组出两组题。 */
  claiming: boolean
}>()

const emit = defineEmits<{
  /** 点「开始下潜」；载荷为空串占位类型（当前题组 ID 由 composable 持有）。 */
  (event: 'start'): void
  /** 点「领取今日任务」。 */
  (event: 'claim'): void
}>()

/** 进度文案：`N / 9`。仅在 `active` 状态出现。 */
const progressText = computed(() => `${props.answered} / ${props.total}`)

/** 主按钮文案：三种状态各一句，互不重叠。 */
const actionLabel = computed(() => {
  if (props.state === 'active') return '开始下潜'
  if (props.state === 'done') return '今日已完成'
  return '领取今日任务'
})

/**
 * 点击主按钮。
 *
 * 写成函数而不是在模板里 `emit(state === 'active' ? 'start' : 'claim')`：
 * `defineEmits` 的泛型会给每种事件单独建一个签名，模板里的三元表达式推导出
 * `"start" | "claim"` 联合类型，与两个签名都不匹配（TS2769）。分支写开后每种
 * 状态下发出的名字是编译期可确定的，类型也自然收窄。
 */
function onAction(): void {
  if (props.state === 'active') {
    emit('start')
    return
  }
  emit('claim')
}
</script>

<template>
  <section class="quest-card" data-testid="quest-card" :data-state="state">
    <header class="quest-card__header">
      <h2 class="quest-card__title">{{ nickname }}的今日任务</h2>
      <span class="quest-card__state">{{ actionLabel }}</span>
    </header>

    <!-- 完成整组后仍展示「9 / 9」：spec daily-math-quest §整组完成与解锁
         要求展示成果，藏起来反而看不出已完成。空态（还没领任务）不展示。 -->
    <p v-if="state !== 'empty'" class="quest-card__progress" data-testid="quest-progress">
      {{ progressText }}
    </p>

    <dl class="quest-card__meta">
      <div class="quest-card__meta-item">
        <dt>预计用时</dt>
        <dd>{{ estimatedMinutes }} 分钟</dd>
      </div>
      <div class="quest-card__meta-item">
        <dt>目标奖励</dt>
        <dd class="quest-card__reward">{{ rewardLabel }}</dd>
      </div>
    </dl>

    <!--
      已完成态不给按钮：同一组题重复进入只会让孩子原地打转。展示一行成果
      说明，明日入口与"开始新的一天"由 spec §开始新的一天 承载（Task 16）。
    -->
    <p v-if="state === 'done'" class="quest-card__done" data-testid="quest-done">
      今天的题组已完成，明天再来探索更深的海域
    </p>

    <button
      v-if="state !== 'done'"
      type="button"
      class="quest-card__action"
      :class="state === 'active' ? 'quest-card__action--dive' : 'quest-card__action--claim'"
      :data-testid="state === 'active' ? 'quest-start' : 'quest-claim'"
      :disabled="claiming"
      @click="onAction"
    >
      {{ actionLabel }}
    </button>
  </section>
</template>

<style scoped>
/* 浮层负 margin：压在地图上沿，形成"从海里浮起"的视觉 */
.quest-card {
  position: relative;
  z-index: 1;
  margin-top: calc(-1 * var(--ds-space-xl));
  margin-right: var(--ds-space-lg);
  margin-bottom: var(--ds-space-lg);
  margin-left: var(--ds-space-lg);
  padding: var(--ds-space-lg);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-glass-surface);
  box-shadow: var(--ds-shadow-card);
}

.quest-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ds-space-md);
}

.quest-card__title {
  margin: 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-font-size-title);
}

.quest-card__state {
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}

/* 进度是卡片的视觉重心：大号数字，主文字色 */
.quest-card__progress {
  margin: var(--ds-space-sm) 0 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-font-size-display);
  font-variant-numeric: tabular-nums;
}

.quest-card__meta {
  display: flex;
  gap: var(--ds-space-xl);
  margin: var(--ds-space-md) 0 0;
}

.quest-card__meta-item dt {
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}

.quest-card__meta-item dd {
  margin: var(--ds-space-xs) 0 0;
  color: var(--ds-text-secondary);
}

/* 奖励名用强调文字色：一眼看到"做完整组能得到什么" */
.quest-card__reward {
  color: var(--ds-accent-text);
}

.quest-card__done {
  margin: var(--ds-space-md) 0 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}

.quest-card__action {
  width: 100%;
  margin-top: var(--ds-space-lg);
  padding: var(--ds-space-md);
  border: none;
  border-radius: var(--ds-radius-pill);
  font-size: var(--ds-font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--ds-motion-fast) ease;
}

/* 收获动效只动 transform：不触发布局重排 */
.quest-card__action:active {
  transform: scale(0.98);
}

.quest-card__action:disabled {
  opacity: 0.6;
  cursor: progress;
}

/* 主按钮：暖橙渐变（设计稿 A 的强调色，鮟鱇鱼发光诱饵） */
.quest-card__action--dive {
  background: var(--ds-accent-gradient);
  color: var(--ds-on-accent);
}

/* 领取按钮次级一档：玻璃底 + 发光描边，避免与"下潜"抢注意力 */
.quest-card__action--claim {
  border: 1px solid var(--ds-glow-primary);
  background: transparent;
  color: var(--ds-glow-primary);
}
</style>
