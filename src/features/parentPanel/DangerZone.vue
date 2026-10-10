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
  <section class="danger" data-testid="danger-zone">
    <h2>档案管理</h2>
    <form @submit.prevent="emit('reset-pin')">
      <h3>重置 {{ profileNickname }} 的 PIN</h3>
      <label>新 PIN <input type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" :value="resetPin" @input="emit('update:resetPin', ($event.target as HTMLInputElement).value)"></label>
      <label>确认 PIN <input type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" :value="confirmResetPin" @input="emit('update:confirmResetPin', ($event.target as HTMLInputElement).value)"></label>
      <button type="submit">重置 PIN</button>
    </form>
    <div class="danger__delete">
      <h3>删除孩子档案</h3>
      <label><input type="checkbox" :checked="confirmDelete" @change="emit('update:confirmDelete', ($event.target as HTMLInputElement).checked)">我已确认删除该档案及其本机数据</label>
      <label>输入昵称确认 <input :value="deleteNickname" @input="emit('update:deleteNickname', ($event.target as HTMLInputElement).value)"></label>
      <button type="button" :disabled="!confirmDelete || deleted" @click="emit('delete-profile')">永久删除档案</button>
    </div>
  </section>
</template>
