<script setup lang="ts">
/**
 * 地图页的路由封装（Task 17）。
 *
 * 地图页无 emit，封装只做两件事：注入生产 `BestiaryStore`（与图鉴页同一份窄
 * 接口——两者都只读事件重放解锁投影），并把当前档案 id 做成**响应式**的
 *（切换档案后地图要重读，而不是停在上一份解锁状态上）。
 */
import { computed } from 'vue'

import MapView from '@/views/MapView.vue'
import { getProductionStores } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'

const stores = getProductionStores()
const profileId = computed(() => useProfileSessionStore().activeProfileId)
</script>

<template>
  <MapView :profile-id="profileId" :store="stores.bestiary" />
</template>
