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
</script>

<template>
  <PetRoomView
    :profile-id="profileId"
    :store="stores.pet"
    @start-quest="router.push(LEARN_PATH)"
    @open-shop="router.push(SHOP_PATH)"
    @back-home="router.push(PROFILES_PATH)"
  />
</template>
