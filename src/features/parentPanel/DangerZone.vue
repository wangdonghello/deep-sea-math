<script setup lang="ts">
defineProps<{
  profileNickname: string
  resetPin: string
  confirmResetPin: string
  deleteNickname: string
  confirmDelete: boolean
  deleted: boolean
}>()
const emit = defineEmits<{
  (event: 'update:resetPin', value: string): void
  (event: 'update:confirmResetPin', value: string): void
  (event: 'update:deleteNickname', value: string): void
  (event: 'update:confirmDelete', value: boolean): void
  (event: 'reset-pin'): void
  (event: 'delete-profile'): void
}>()
</script>

<template>
  <section class="danger parent-card" :aria-label="`${profileNickname} 的安全设置`" data-testid="danger-zone">
    <h2>安全设置</h2>
    <form class="danger__reset" @submit.prevent="emit('reset-pin')">
      <h3>重置 PIN</h3>
      <label>新 PIN
        <input type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" :value="resetPin" @input="emit('update:resetPin', ($event.target as HTMLInputElement).value)">
      </label>
      <label>确认 PIN
        <input type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" :value="confirmResetPin" @input="emit('update:confirmResetPin', ($event.target as HTMLInputElement).value)">
      </label>
      <button type="submit" class="parent-button">重置 PIN</button>
    </form>
    <div class="danger__delete">
      <h3>删除孩子档案</h3>
      <label class="parent-check">
        <input type="checkbox" :checked="confirmDelete" @change="emit('update:confirmDelete', ($event.target as HTMLInputElement).checked)">
        <span>我已确认删除该档案及其本机数据</span>
      </label>
      <label>输入昵称确认
        <input type="text" :value="deleteNickname" autocomplete="off" @input="emit('update:deleteNickname', ($event.target as HTMLInputElement).value)">
      </label>
      <button type="button" class="parent-button parent-button--danger" :disabled="!confirmDelete || deleted" @click="emit('delete-profile')">
        永久删除档案
      </button>
    </div>
  </section>
</template>

<style scoped>
.danger__reset {
  display: grid;
  gap: var(--ds-space-md);
}

.danger h2,
.danger h3 {
  margin: 0;
}
</style>
