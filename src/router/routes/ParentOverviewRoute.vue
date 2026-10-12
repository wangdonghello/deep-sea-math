<script setup lang="ts">
/**
 * 家长区·总览的路由封装（P2）。
 *
 * 存在理由与其余家长路由一致：把「生产 store 从哪来」与「emit 落到哪条路由」
 * 这类装配决策挡在视图之外，视图（`FamilyOverviewSection`）只依赖窄接口。
 *
 * 注入项：
 * - `stores.parent`（`createParentStore(storage)`）→ `:store`
 * - `QUESTION_TYPE_BY_ID` → `:question-type-by-id`（题型掌握口径）
 */
import { useRouter } from 'vue-router'

import { getProductionStores, QUESTION_TYPE_BY_ID } from '@/app/productionStores'
import FamilyOverviewSection from '@/features/parentPanel/FamilyOverviewSection.vue'
import {
  PARENT_MANAGE_PATH,
  PARENT_OVERVIEW_PATH,
  PARENT_SETTINGS_PATH,
  PROFILES_PATH,
} from '@/router/nextRoute'
import type { ParentSection } from '@/features/parentPanel/types'

const router = useRouter()
const stores = getProductionStores()

/** 功能区 id → 路由路径（`ParentSectionNav` 只认 id，见该组件说明）。 */
const SECTION_PATHS: Readonly<Record<string, string>> = {
  overview: PARENT_OVERVIEW_PATH,
  settings: PARENT_SETTINGS_PATH,
  manage: PARENT_MANAGE_PATH,
}

function onNavigate(section: ParentSection): void {
  const path = SECTION_PATHS[section]
  if (path !== undefined) void router.push(path)
}

/** 点某个孩子 → 带 `?child=` 进设置/报告页，由该页默认选中这个孩子。 */
function onOpenChild(profileId: string): void {
  void router.push({ path: PARENT_SETTINGS_PATH, query: { child: profileId } })
}
</script>

<template>
  <FamilyOverviewSection
    :store="stores.parent"
    :question-type-by-id="QUESTION_TYPE_BY_ID"
    @open-child="onOpenChild"
    @navigate="onNavigate"
    @back="() => router.push(PROFILES_PATH)"
  />
</template>
