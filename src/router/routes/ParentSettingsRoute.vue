<script setup lang="ts">
/**
 * 家长区·设置与报告的路由封装（P2）。
 *
 * 注入项：
 * - `stores.parent` → `:store`、`QUESTION_TYPE_BY_ID` → `:question-type-by-id`
 * - 默认选中孩子：`?child=`（从总览卡片点进来）优先，否则当前登录档案的 id
 *   （家长区允许不选档案进入——未登录档案会话时为 null）
 *
 * 三个 emit 分别翻译成：切页 → 对应功能区路径；返回 → 档案选择页。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getProductionStores, QUESTION_TYPE_BY_ID } from '@/app/productionStores'
import LearningSettingsSection from '@/features/parentPanel/LearningSettingsSection.vue'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import {
  PARENT_MANAGE_PATH,
  PARENT_OVERVIEW_PATH,
  PARENT_SETTINGS_PATH,
  PROFILES_PATH,
} from '@/router/nextRoute'
import type { ParentSection } from '@/features/parentPanel/types'

const route = useRoute()
const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()

/** 功能区 id → 路由路径。 */
const SECTION_PATHS: Readonly<Record<string, string>> = {
  overview: PARENT_OVERVIEW_PATH,
  settings: PARENT_SETTINGS_PATH,
  manage: PARENT_MANAGE_PATH,
}

/** 默认选中的孩子：`?child=` 优先，其次当前档案。 */
const defaultProfileId = computed(() => {
  const child = route.query.child
  return typeof child === 'string' && child !== '' ? child : session.activeProfileId
})

function onNavigate(section: ParentSection): void {
  const path = SECTION_PATHS[section]
  if (path !== undefined) void router.push(path)
}
</script>

<template>
  <LearningSettingsSection
    :store="stores.parent"
    :default-profile-id="defaultProfileId"
    :custom-question-store="stores.customQuestions"
    :question-type-by-id="QUESTION_TYPE_BY_ID"
    @navigate="onNavigate"
    @back="() => router.push(PROFILES_PATH)"
  />
</template>
