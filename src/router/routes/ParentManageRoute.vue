<script setup lang="ts">
/**
 * 家长区·档案管理的路由封装（P2）。
 *
 * 注入 `stores.parent` / `QUESTION_TYPE_BY_ID` 与当前档案 id（默认选中）。
 * 首次安装没有档案时这条路径仍可达（`PROFILE_OPTIONAL_PATHS` 收了它）——
 * 建档正是发生在"还没有档案"的前提下。
 */
import { useRouter } from 'vue-router'

import { getProductionStores, QUESTION_TYPE_BY_ID } from '@/app/productionStores'
import ProfileManageSection from '@/features/parentPanel/ProfileManageSection.vue'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import {
  PARENT_MANAGE_PATH,
  PARENT_OVERVIEW_PATH,
  PARENT_SETTINGS_PATH,
  PROFILES_PATH,
} from '@/router/nextRoute'
import type { ParentSection } from '@/features/parentPanel/types'

const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()

/** 功能区 id → 路由路径。 */
const SECTION_PATHS: Readonly<Record<string, string>> = {
  overview: PARENT_OVERVIEW_PATH,
  settings: PARENT_SETTINGS_PATH,
  manage: PARENT_MANAGE_PATH,
}

function onNavigate(section: ParentSection): void {
  const path = SECTION_PATHS[section]
  if (path !== undefined) void router.push(path)
}
</script>

<template>
  <ProfileManageSection
    :store="stores.parent"
    :default-profile-id="session.activeProfileId"
    :question-type-by-id="QUESTION_TYPE_BY_ID"
    @navigate="onNavigate"
    @back="() => router.push(PROFILES_PATH)"
  />
</template>
