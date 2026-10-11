<script setup lang="ts">
import { computed, onMounted } from 'vue'
import DangerZone from '@/features/parentPanel/DangerZone.vue'
import ReportPanel from '@/features/parentPanel/ReportPanel.vue'
import SettingsForm from '@/features/parentPanel/SettingsForm.vue'
import { useParentPanel } from '@/features/parentPanel/useParentPanel'
import type { ParentStore } from '@/features/parentPanel/types'
import type { DigestFn } from '@/domain/crypto/hashPin'
import type { QuizType } from '@/domain/model/types'

const props = defineProps<{
  store: ParentStore
  profileId: string | null
  clock?: () => number
  idGenerator?: () => string
  randomBytes?: (size: number) => Uint8Array
  digest?: DigestFn
  questionTypeById?: Readonly<Record<string, QuizType>>
  logger?: (entry: Record<string, unknown>) => void
}>()
const emit = defineEmits<{ (event: 'back-to-profiles'): void }>()
const panel = useParentPanel({
  store: props.store, profileId: props.profileId, clock: props.clock, idGenerator: props.idGenerator,
  randomBytes: props.randomBytes, digest: props.digest, questionTypeById: props.questionTypeById, logger: props.logger,
})
const avatars = ['avatar-1', 'avatar-2', 'avatar-3']
const selectedProfile = computed(() => panel.profiles.value.find((profile) => profile.id === props.profileId))

async function onDeleteProfile(): Promise<void> {
  await panel.deleteProfile()
  if (panel.deleted.value) emit('back-to-profiles')
}

onMounted(() => { void panel.load() })
</script>

<template>
  <main class="parent" data-testid="parent-view">
    <header>
      <h1>家长区</h1>
      <p>本家长区仅在本机提供管理功能，不包含家长身份验证；请妥善保管设备。</p>
    </header>
    <p v-if="panel.degraded.value" class="parent__warning" data-testid="storage-warning" role="status">
      当前使用本机暂存，刷新后数据不会保留。请退出隐私模式并重新打开应用。
    </p>
    <p v-if="panel.errorMessage.value" role="alert" data-testid="parent-error">{{ panel.errorMessage.value }}</p>
    <p v-if="panel.successMessage.value" role="status" data-testid="parent-success">{{ panel.successMessage.value }}</p>
    <section class="parent__create">
      <h2>{{ panel.profiles.value.length === 0 ? '创建孩子档案' : '添加孩子档案' }}</h2>
      <form data-testid="create-profile" @submit.prevent="panel.createProfile()">
        <label>虚拟昵称 <input v-model="panel.createForm.nickname.value" maxlength="24" autocomplete="off" required></label>
        <fieldset><legend>选择头像</legend>
          <label v-for="avatar in avatars" :key="avatar">
            <input v-model="panel.createForm.avatarId.value" type="radio" name="avatar" :value="avatar">{{ avatar }}
          </label>
        </fieldset>
        <label>4 位 PIN <input v-model="panel.createForm.pin.value" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        <label>确认 PIN <input v-model="panel.createForm.confirmPin.value" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        <button type="submit">创建档案</button>
      </form>
      <p>只填写虚拟昵称与头像，不收集真实姓名、学校、电话或位置。</p>
      <p v-if="panel.created.value" data-testid="profile-created">档案创建完成，请返回档案选择页开始游戏。</p>
      <button v-if="panel.created.value" type="button" @click="emit('back-to-profiles')">返回档案选择</button>
    </section>

    <template v-if="props.profileId !== null && selectedProfile">
      <SettingsForm :settings="panel.settings.value" @update:settings="panel.settings.value = $event" @save="panel.saveSettings()" />
      <ReportPanel :report="panel.report.value" :period="panel.reportPeriod.value" @update:period="panel.reportPeriod.value = $event; panel.refreshReport()" />
      <DangerZone
        :profile-nickname="selectedProfile.nickname"
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
        @delete-profile="onDeleteProfile()"
      />
    </template>
    <p v-else-if="panel.profiles.value.length === 0 && !panel.loading.value">尚无孩子档案，创建后即可返回档案选择开始游戏。</p>
  </main>
</template>

<style scoped>
.parent { display: grid; gap: var(--ds-space-lg); max-width: 48rem; margin: 0 auto; padding: var(--ds-space-lg); color: var(--ds-text-primary); }
.parent__warning { padding: var(--ds-space-md); border: 1px solid var(--ds-accent-500); border-radius: var(--ds-radius-md); background: var(--ds-glass-surface); }
.parent__create, .parent :deep(form), .parent :deep(section) { display: grid; gap: var(--ds-space-md); }
.parent label { display: flex; align-items: center; gap: var(--ds-space-sm); }
.parent input, .parent button, .parent select { min-height: 2.75rem; font: inherit; }
.parent button { padding: var(--ds-space-sm) var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); color: var(--ds-text-primary); background: var(--ds-glass-surface); }
</style>
