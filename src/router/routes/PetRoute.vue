<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import PetRoomView from '@/views/PetRoomView.vue'
import { getProductionStores } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { LEARN_PATH, PROFILES_PATH, SHOP_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)

const TAB_PATHS: Readonly<Record<string, string>> = {
  learn: LEARN_PATH,
  shop: SHOP_PATH,
  bestiary: '/bestiary',
}

function onNavigate(tabId: string): void {
  const path = TAB_PATHS[tabId]
  if (path !== undefined) void router.push(path)
}

function onSwitchProfile(): void {
  session.clear()
  void router.push(PROFILES_PATH)
}
</script>

<template>
  <PetRoomView
    :profile-id="profileId"
    :store="stores.pet"
    @start-quest="router.push(LEARN_PATH)"
    @open-shop="router.push(SHOP_PATH)"
    @back-home="onSwitchProfile"
    @navigate="onNavigate"
  />
</template>
