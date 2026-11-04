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
</script>

<template>
  <ShopView :profile-id="profileId" :store="stores.pet" @back-home="router.push(HOME_PATH)" />
</template>
