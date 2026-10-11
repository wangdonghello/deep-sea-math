<script setup lang="ts">
/**
 * 家长区的路由封装（Task 17）。
 *
 * `back-to-profiles` → `/profiles`（建档完成 / 删除档案后回到档案选择页）。
 *
 * `questionTypeById` 在这里注入（RETRO R19 遗留）：家长报告的"题型掌握分布"
 * 与错题本的题型筛选共用同一份 `questionId → QuizType` 归属口径，两处各建
 * 一份必然漂移。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import ParentView from '@/views/ParentView.vue'
import { getProductionStores, QUESTION_TYPE_BY_ID } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { PROFILES_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()
const profileId = computed(() => useProfileSessionStore().activeProfileId)
</script>

<template>
  <ParentView
    :store="stores.parent"
    :profile-id="profileId"
    :question-type-by-id="QUESTION_TYPE_BY_ID"
    @back-to-profiles="router.push(PROFILES_PATH)"
  />
</template>
