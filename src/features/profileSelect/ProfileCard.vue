<script setup lang="ts">
/**
 * 档案卡片（design §4 `ProfileSelectView` 的组成组件之一）。
 *
 * 本组件**不含任何业务判断**：选中状态、禁用原因都由父级（视图）从
 * `useProfileSelect` 的状态推导好后传进来，点击也只向上抛 `select` 事件。
 * 这样“什么算选中”只有一个真相来源，组件永远不会和 composable 各自为政。
 *
 * 样式类名与 Task 10 的深海主题 token 对齐（`profile-select` 命名空间），
 * T10 合并后自动生效；此处只写语义化 class，不引主题外样式。
 */
import type { ProfileSummary } from './types'
import ProfileAvatar from './ProfileAvatar.vue'

defineProps<{
  /** 待渲染的档案摘要（不含 PIN 相关字段）。 */
  profile: ProfileSummary
  /** 是否为当前选中档案。 */
  selected: boolean
  /** 是否禁用（列表加载中或已锁定）。 */
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** 请求选中该档案；载荷为档案 ID。 */
  (event: 'select', profileId: string): void
}>()
</script>

<template>
  <button
    type="button"
    class="profile-card"
    :class="{ 'profile-card--selected': selected }"
    :aria-pressed="selected"
    :disabled="disabled"
    :data-testid="`profile-card-${profile.id}`"
    @click="emit('select', profile.id)"
  >
    <ProfileAvatar :avatar-id="profile.avatarId" />
    <span class="profile-card__nickname">{{ profile.nickname }}</span>
    <span v-if="profile.grade" class="profile-card__meta" data-testid="profile-meta">
      {{ profile.grade }} 年级 · {{ profile.themeId === 'dinosaur' ? '恐龙' : profile.themeId === 'space' ? '太空' : '深海' }}
    </span>
    <span v-if="selected" class="profile-card__selected" aria-hidden="true">已选择</span>
  </button>
</template>

<style scoped>
.profile-card {
  position: relative;
  display: grid;
  justify-items: center;
  gap: var(--ds-space-sm);
  min-width: 0;
  min-height: 9rem;
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: linear-gradient(145deg, var(--ds-glass-surface), rgb(18 55 86 / 88%));
  color: var(--ds-text-primary);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--ds-motion-fast) ease, transform var(--ds-motion-fast) ease;
}
.profile-card:active { transform: scale(.98); }
.profile-card:focus-visible { outline: 3px solid var(--ds-glow-primary); outline-offset: 2px; }
.profile-card--selected {
  border-color: var(--ds-glow-primary);
  box-shadow: 0 0 0 2px rgb(123 226 238 / 15%), var(--ds-shadow-card);
}
.profile-card__meta { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.profile-card__nickname { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.profile-card__selected { position: absolute; top: .45rem; right: .55rem; color: var(--ds-glow-primary); font-size: var(--ds-font-size-caption); }
.profile-card:disabled { opacity: .55; cursor: not-allowed; }
</style>
