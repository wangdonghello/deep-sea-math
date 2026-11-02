<script setup lang="ts">
/**
 * 徽章墙的路由封装。
 *
 * `profileId` / `themeId` 用 `computed` 读会话而不是 setup 时快照：切换档案或
 * 家长区改主题后，页面不应停留在上一个孩子的徽章上。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import BadgesView from '@/views/BadgesView.vue'
import { getProductionStores } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { HOME_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)
const themeId = computed(() => session.projection?.themeId ?? 'deep-sea')
</script>

<template>
  <BadgesView
    :profile-id="profileId"
    :theme-id="themeId"
    :store="stores.bestiary"
    @back-home="router.push(HOME_PATH)"
  />
</template>
