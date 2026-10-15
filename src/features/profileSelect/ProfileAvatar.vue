<script setup lang="ts">
/** Visible, stable artwork for a child's stored avatar id. */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  avatarId: string
  size?: 'card' | 'compact'
}>(), { size: 'card' })

const variant = computed(() => {
  if (['avatar-2', 'starfish'].includes(props.avatarId)) return 'starfish'
  if (['avatar-3', 'jelly'].includes(props.avatarId)) return 'jellyfish'
  return 'whale'
})
</script>

<template>
  <span class="profile-avatar" :class="[`profile-avatar--${variant}`, `profile-avatar--${size}`]"
    :data-avatar="avatarId" data-testid="profile-avatar" aria-hidden="true">
    <svg v-if="variant === 'whale'" viewBox="0 0 48 48" focusable="false">
      <path d="M8 27c0-9 8-16 19-16 7 0 12 3 15 8l5-3-2 8 2 7-7-3c-3 5-8 8-15 8C16 36 8 33 8 27Z" fill="currentColor"/>
      <circle cx="35" cy="22" r="1.7" fill="#082541"/>
      <path d="M18 12c1-4 4-6 7-6-1 3-3 5-7 6Z" fill="#d9fbff" opacity=".9"/>
      <path d="M22 34c2 2 5 2 7 0" fill="none" stroke="#082541" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <svg v-else-if="variant === 'starfish'" viewBox="0 0 48 48" focusable="false">
      <path d="m24 5 5.5 12 13 1.5-9.5 9 2.5 13-11.5-6.5L12.5 40 15 27.5l-9.5-9L19 17Z" fill="currentColor"/>
      <circle cx="20" cy="23" r="1.2" fill="#6a4322"/><circle cx="28" cy="23" r="1.2" fill="#6a4322"/>
      <path d="M21 28c2 2 4 2 6 0" fill="none" stroke="#6a4322" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
    <svg v-else viewBox="0 0 48 48" focusable="false">
      <path d="M10 25a14 14 0 0 1 28 0Z" fill="currentColor"/>
      <path d="M13 28c1 8 4 12 6 12m5-12v14m6-14c0 7-1 10-2 12m8-12c0 7-2 10-4 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <circle cx="19" cy="23" r="1.2" fill="#49326b"/><circle cx="29" cy="23" r="1.2" fill="#49326b"/>
    </svg>
  </span>
</template>

<style scoped>
.profile-avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 2px solid rgb(255 255 255 / 55%);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgb(0 0 0 / 24%), inset 0 -7px 12px rgb(0 0 0 / 10%);
}
.profile-avatar--card { width: 4.5rem; height: 4.5rem; }
.profile-avatar--compact { width: 2.5rem; height: 2.5rem; }
.profile-avatar svg { width: 76%; height: 76%; }
.profile-avatar--whale { color: #e8fbff; background: linear-gradient(145deg, #62d7e7, #3174a9); }
.profile-avatar--starfish { color: #ffefb4; background: linear-gradient(145deg, #ffb65e, #e67655); }
.profile-avatar--jellyfish { color: #f1ddff; background: linear-gradient(145deg, #d69aff, #7a69cd); }
</style>
