<script setup lang="ts">
/**
 * 家庭总览里的单个孩子卡片。
 *
 * 只渲染传入的 {@link ChildOverview}，不做任何派生（统计与"需要关注"提示都由
 * `useFamilyOverview` 从事件投影算好）——组件里 reduce 事件就会让"卡片数字"
 * 与"报告数字"多出一处可漂移的口径。点击只向上抛 `open`，由父级决定去哪。
 */
import { computed } from 'vue'

import type { ChildOverview } from './types'

const props = defineProps<{ child: ChildOverview }>()
const emit = defineEmits<{ (event: 'open', profileId: string): void }>()

/**
 * 有没有可用的平均用时。
 *
 * `averageMs` 只由**答对**的题目算出，没有完成题时它是 0——把 0 渲染成
 * "0.0 秒"会让家长以为孩子答题快到 0 秒。没有记录就显示"—"。
 */
const hasAverage = computed(() => props.child.completedQuestions > 0)

const averageText = computed(() => (hasAverage.value ? seconds(props.child.averageMs) : '—'))

/** 毫秒转秒（保留一位小数），报告区同样是毫秒原值，卡片给家长一个更好读的量级。 */
function seconds(ms: number): string {
  return (ms / 1000).toFixed(1)
}
</script>

<template>
  <button
    type="button"
    class="child-card"
    :data-testid="`child-card-${child.profileId}`"
    @click="emit('open', child.profileId)"
  >
    <span class="child-card__avatar" :data-avatar="child.avatarId" aria-hidden="true" />
    <span class="child-card__body">
      <span class="child-card__nickname parent-wrap">{{ child.nickname }}</span>
      <span class="child-card__meta" data-testid="child-meta">{{ child.grade }} 年级 · {{ child.themeName }} · 第 {{ child.stage }} 阶段</span>
      <span class="child-card__stats">
        本周学习 <b data-testid="child-days">{{ child.daysStudied }}</b> 天 ·
        完成 <b data-testid="child-completed">{{ child.completedQuestions }}</b> 题 ·
        平均用时 <b data-testid="child-average">{{ averageText }}</b><template v-if="hasAverage"> 秒</template>
      </span>
      <span class="child-card__hint" data-testid="child-hint">{{ child.focusHint }}</span>
    </span>
  </button>
</template>

<style scoped>
/* 玻璃卡片：圆角与间距与首页/图鉴一致，暖橙强调"需要关注"。 */
.child-card {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  color: var(--ds-text-primary);
  background: var(--ds-glass-surface);
  box-shadow: var(--ds-shadow-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.child-card__avatar {
  flex: none;
  width: 3rem;
  height: 3rem;
  border-radius: var(--ds-radius-pill);
  background: var(--ds-accent-gradient);
}

/* 三个头像与建档页的图形配色对应（同一孩子在两处看到同一种颜色） */
.child-card__avatar[data-avatar='avatar-1'] {
  background: linear-gradient(135deg, #9be8ff, #7fd4ff);
}

.child-card__avatar[data-avatar='avatar-3'] {
  background: linear-gradient(135deg, #7ce0c0, #4fc3a1);
}

.child-card__body {
  display: grid;
  gap: var(--ds-space-xs);
  /* flex 子项默认 min-width:auto：不置 0 时长昵称/长提示会把卡片顶出屏 */
  min-width: 0;
}

.child-card__nickname {
  font-size: var(--ds-font-size-title);
  font-weight: 600;
}

.child-card__meta {
  color: var(--ds-accent-text);
  font-size: var(--ds-font-size-caption);
}
.child-card__stats {
  color: var(--ds-text-secondary);
}

.child-card__hint {
  color: var(--ds-accent-text);
}
</style>
