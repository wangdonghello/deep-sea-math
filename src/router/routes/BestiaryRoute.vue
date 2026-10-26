<script setup lang="ts">
/**
 * 图鉴页的路由封装（Task 17）。
 *
 * `observe(creatureId)` → `/observation/:id`。是否已解锁由 `/observation/:id`
 * 的守卫判定（未解锁打回图鉴，不泄露名称与学名），本组件不重复实现那条规则。
 *
 * `profileId` 用 `computed` 读而不是 setup 时取快照：切换档案（或家长区删档后
 * 回到首页）不应让图鉴停留在上一个档案的解锁状态上。`useBestiary` 内部 watch
 * 这个 prop，因此它一变就重读事件。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import BestiaryView from '@/views/BestiaryView.vue'
import ThemeCollectionView from '@/views/ThemeCollectionView.vue'
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
  <ThemeCollectionView
    v-if="themeId !== 'deep-sea'"
    :profile-id="profileId"
    :theme-id="themeId"
    :store="stores.bestiary"
    @back-home="router.push(HOME_PATH)"
  />
  <BestiaryView
    v-else
    :profile-id="profileId"
    :store="stores.bestiary"
    :show-stages="true"
    @observe="(creatureId) => router.push(`/observation/${creatureId}`)"
    @back-home="router.push(HOME_PATH)"
  />
</template>
