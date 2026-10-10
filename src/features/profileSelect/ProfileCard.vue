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
    <span class="profile-card__avatar" :data-avatar="profile.avatarId" aria-hidden="true" />
    <span class="profile-card__nickname">{{ profile.nickname }}</span>
  </button>
</template>
