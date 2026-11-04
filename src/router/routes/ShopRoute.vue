<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import ShopView from '@/views/ShopView.vue'
import { getProductionStores } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { HOME_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)

const TAB_PATHS: Readonly<Record<string, string>> = {
  pet: HOME_PATH,
  learn: '/home',
  bestiary: '/bestiary',
}

function onNavigate(tabId: string): void {
  const path = TAB_PATHS[tabId]
  if (path !== undefined) void router.push(path)
}
</script>

<template>
  <ShopView :profile-id="profileId" :store="stores.pet" @back-home="router.push(HOME_PATH)" @navigate="onNavigate" />
</template>
