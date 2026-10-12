<script setup lang="ts">
/**
 * 家长区·档案管理（P2）。
 *
 * 三块内容：建档表单（首次安装时唯一的档案入口）、每个孩子一条**可展开**的
 * "安全"区（重置 PIN / 删除档案）。展开哪个孩子就把 `useParentPanel` 的当前
 * 选中切到谁——PIN 重置与删除因此永远作用于展开的那个孩子，不会串台。
 *
 * 一次只展开一个：`DangerZone` 的输入是短生命周期的，同时展开多个会让"这半截
 * PIN 属于谁"变得含糊。
 */
import { onMounted, ref } from 'vue'

import DangerZone from './DangerZone.vue'
import ParentSectionShell from './ParentSectionShell.vue'
import { useParentPanel } from './useParentPanel'
import type { ParentSection, ParentStore } from './types'
import type { QuizType } from '@/domain/model/types'

const props = defineProps<{
  store: ParentStore
  defaultProfileId?: string | null
  clock?: () => number
  questionTypeById?: Readonly<Record<string, QuizType>>
  logger?: (entry: Record<string, unknown>) => void
}>()
const emit = defineEmits<{
  (event: 'navigate', section: ParentSection): void
  (event: 'back'): void
}>()

const panel = useParentPanel({
  store: props.store,
  profileId: props.defaultProfileId ?? null,
  clock: props.clock,
  questionTypeById: props.questionTypeById,
  logger: props.logger,
})

const avatars = ['avatar-1', 'avatar-2', 'avatar-3']
const expandedId = ref<string | null>(null)

/** 展开/收起某个孩子的"安全"区；展开时把当前选中切到该孩子。 */
function toggle(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
  if (expandedId.value === id) void panel.selectProfile(id)
}

/** 删除成功后收起该孩子的展开区（它已不在列表里）。 */
async function onDelete(): Promise<void> {
  await panel.deleteProfile()
  if (panel.deleted.value) expandedId.value = null
}

onMounted(() => {
  void panel.load()
})
</script>

<template>
  <ParentSectionShell
    title="档案管理"
    active="manage"
    :degraded="panel.degraded.value"
    @navigate="emit('navigate', $event)"
    @back="emit('back')"
  >
    <p v-if="panel.errorMessage.value" role="alert" data-testid="manage-error">{{ panel.errorMessage.value }}</p>
    <p v-if="panel.successMessage.value" role="status" data-testid="manage-success">{{ panel.successMessage.value }}</p>

    <section class="manage__create">
      <h2>{{ panel.profiles.value.length === 0 ? '创建孩子档案' : '添加孩子档案' }}</h2>
      <form data-testid="create-profile" @submit.prevent="panel.createProfile()">
        <label>虚拟昵称 <input v-model="panel.createForm.nickname.value" maxlength="24" autocomplete="off" required></label>
        <fieldset>
          <legend>选择头像</legend>
          <label v-for="avatar in avatars" :key="avatar">
            <input v-model="panel.createForm.avatarId.value" type="radio" name="avatar" :value="avatar">{{ avatar }}
          </label>
        </fieldset>
        <label>4 位 PIN <input v-model="panel.createForm.pin.value" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        <label>确认 PIN <input v-model="panel.createForm.confirmPin.value" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        <button type="submit">创建档案</button>
      </form>
      <p>只填写虚拟昵称与头像，不收集真实姓名、学校、联系方式或位置。</p>
    </section>

    <ul class="manage__list">
      <li v-for="profile in panel.profiles.value" :key="profile.id" class="manage__item">
        <button type="button" class="manage__toggle" :data-testid="`manage-toggle-${profile.id}`" @click="toggle(profile.id)">
          {{ profile.nickname }} 的安全设置
        </button>
        <DangerZone
          v-if="expandedId === profile.id"
          :profile-nickname="profile.nickname"
          :reset-pin="panel.resetForm.pin.value"
          :confirm-reset-pin="panel.resetForm.confirmPin.value"
          :delete-nickname="panel.deleteForm.nickname.value"
          :confirm-delete="panel.confirmDelete.value"
          :deleted="panel.deleted.value"
          @update:reset-pin="panel.resetForm.pin.value = $event"
          @update:confirm-reset-pin="panel.resetForm.confirmPin.value = $event"
          @update:delete-nickname="panel.deleteForm.nickname.value = $event"
          @update:confirm-delete="panel.confirmDelete.value = $event"
          @reset-pin="panel.resetPin()"
          @delete-profile="onDelete()"
        />
      </li>
    </ul>

    <p v-if="panel.profiles.value.length === 0 && !panel.loading.value" data-testid="manage-empty">
      尚无孩子档案，创建后即可返回档案选择开始游戏。
    </p>
  </ParentSectionShell>
</template>

<style scoped>
.manage__create,
.manage__item {
  display: grid;
  gap: var(--ds-space-md);
}

.manage__create {
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-glass-surface);
}

.manage__create label {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.manage__create input,
.manage__create button {
  min-height: 2.75rem;
  font: inherit;
}

.manage__list {
  display: grid;
  gap: var(--ds-space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}

.manage__toggle {
  justify-self: start;
  min-height: 2.75rem;
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  background: var(--ds-glass-surface);
  font: inherit;
  cursor: pointer;
}

.manage__create button {
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  background: var(--ds-glass-surface);
}
</style>
