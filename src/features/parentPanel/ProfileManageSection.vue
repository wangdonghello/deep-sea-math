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

/**
 * 三个头像：只描述图案的中性称呼（孩子档案只有一个"头像"，不是性别选择）。
 * `data-testid` 按 **1-based 序号**命名，测试与视觉解耦。
 */
const AVATAR_OPTIONS = [
  { id: 'avatar-1', label: '小鲸' },
  { id: 'avatar-2', label: '海星' },
  { id: 'avatar-3', label: '水母' },
] as const

const GRADE_OPTIONS = [1, 2, 3] as const
const THEME_OPTIONS = [
  { id: 'deep-sea', label: '深海' },
  { id: 'dinosaur', label: '恐龙' },
  { id: 'space', label: '太空' },
] as const

const expandedId = ref<string | null>(null)

/** 展开/收起某个孩子的"安全"区；展开时把当前选中切到该孩子。 */
function toggle(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
  if (expandedId.value === id) {
    const profile = panel.profiles.value.find((item) => item.id === id)
    if (profile !== undefined) {
      panel.preferencesForm.grade.value = profile.grade ?? 3
      panel.preferencesForm.themeId.value = profile.themeId ?? 'deep-sea'
    }
    void panel.selectProfile(id)
  }
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

    <section class="manage__create parent-card">
      <h2>{{ panel.profiles.value.length === 0 ? '创建孩子档案' : '添加孩子档案' }}</h2>
      <form data-testid="create-profile" @submit.prevent="panel.createProfile()">
        <label>虚拟昵称
          <input v-model="panel.createForm.nickname.value" type="text" maxlength="24" autocomplete="off" required>
        </label>
        <label>年级
          <select v-model.number="panel.createForm.grade.value" data-testid="create-grade">
            <option v-for="grade in GRADE_OPTIONS" :key="grade" :value="grade">{{ grade }} 年级</option>
          </select>
        </label>
        <label>兴趣主题
          <select v-model="panel.createForm.themeId.value" data-testid="create-theme">
            <option v-for="theme in THEME_OPTIONS" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
          </select>
        </label>
        <fieldset>
          <legend>选择头像</legend>
          <div class="avatar-options">
            <label
              v-for="(option, index) in AVATAR_OPTIONS"
              :key="option.id"
              class="avatar-option"
              :class="{ 'avatar-option--selected': panel.createForm.avatarId.value === option.id }"
              :data-avatar="option.id"
              :data-testid="`avatar-option-${index + 1}`"
            >
              <input
                v-model="panel.createForm.avatarId.value"
                type="radio"
                name="avatar"
                :value="option.id"
                :aria-label="`头像：${option.label}`"
              >
              <span class="avatar-option__figure" aria-hidden="true">
                <!-- 三个图案各异：鲸鱼 / 海星 / 水母；颜色由当前选项的 currentColor 决定 -->
                <svg v-if="option.id === 'avatar-1'" viewBox="0 0 24 24" width="22" height="22" focusable="false">
                  <ellipse cx="10" cy="13" rx="7" ry="5" fill="currentColor" />
                  <path d="M16 13 L22 9.5 V16.5 Z" fill="currentColor" />
                </svg>
                <svg v-else-if="option.id === 'avatar-2'" viewBox="0 0 24 24" width="22" height="22" focusable="false">
                  <path d="M12 3 L14.6 9.4 L21.5 9.9 L16.2 14.3 L17.9 21 L12 17.2 L6.1 21 L7.8 14.3 L2.5 9.9 L9.4 9.4 Z" fill="currentColor" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="22" height="22" focusable="false">
                  <path d="M5 13a7 7 0 0 1 14 0z" fill="currentColor" />
                  <path d="M8 15v3M12 15v4M16 15v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              </span>
              <span class="avatar-option__text">{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
        <label>4 位 PIN <input v-model="panel.createForm.pin.value" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        <label>确认 PIN <input v-model="panel.createForm.confirmPin.value" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        <button type="submit" class="parent-button parent-button--primary">创建档案</button>
      </form>
      <p class="parent-hint">只填写虚拟昵称与头像，不收集真实姓名、学校、联系方式或位置。</p>
    </section>

    <ul class="manage__list">
      <li v-for="profile in panel.profiles.value" :key="profile.id" class="manage__item">
        <button
          type="button"
          class="manage__toggle"
          :class="{ 'manage__toggle--expanded': expandedId === profile.id }"
          :data-testid="`manage-toggle-${profile.id}`"
          :aria-expanded="expandedId === profile.id"
          @click="toggle(profile.id)"
        >
          <span class="manage__toggle-name parent-wrap">{{ profile.nickname }} 的安全设置</span>
          <span class="manage__toggle-glyph" aria-hidden="true">{{ expandedId === profile.id ? '▾' : '▸' }}</span>
        </button>
        <form
          v-if="expandedId === profile.id"
          class="manage__preferences parent-card"
          data-testid="preferences-form"
          @submit.prevent="panel.updatePreferences()"
        >
          <h2>年级与主题</h2>
          <p class="parent-hint">修改后从下一组任务起生效，当前题组保持原设置。</p>
          <label>年级
            <select v-model.number="panel.preferencesForm.grade.value" data-testid="preferences-grade">
              <option v-for="grade in GRADE_OPTIONS" :key="grade" :value="grade">{{ grade }} 年级</option>
            </select>
          </label>
          <label>兴趣主题
            <select v-model="panel.preferencesForm.themeId.value" data-testid="preferences-theme">
              <option v-for="theme in THEME_OPTIONS" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
            </select>
          </label>
          <button type="submit" class="parent-button">保存年级与主题</button>
        </form>
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
/* 建档表单与档案列表：单列排布，控件外观来自共享的 styles/parentForms.css */
.manage__create form {
  display: grid;
  gap: var(--ds-space-md);
}

.manage__create {
  margin: 0;
}

.manage__list {
  display: grid;
  gap: var(--ds-space-md);
  margin: 0;
  padding: 0;
  list-style: none;
}

.manage__item {
  display: grid;
  gap: var(--ds-space-md);
}

/* "XX 的安全设置"做成一张可展开的卡片：整行可点，右侧明确的展开字形 */
.manage__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  width: 100%;
  min-height: 2.75rem;
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  color: var(--ds-text-primary);
  background: var(--ds-glass-surface);
  box-shadow: var(--ds-shadow-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.manage__toggle--expanded {
  border-color: var(--ds-accent-500);
}

.manage__toggle-name {
  min-width: 0;
}

.manage__toggle-glyph {
  flex: none;
  color: var(--ds-accent-text);
  font-size: var(--ds-font-size-title);
  line-height: 1;
}
</style>
