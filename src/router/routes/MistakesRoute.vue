<script setup lang="ts">
/**
 * 错题本的路由封装（Task 17）。
 *
 * `practice({questionIds, similarQuestionIds})` → 带题目的的答题页。
 *
 * 为什么把题号塞进 query 而不是直接进 `/quest`：重练不是当日题组（没有
 * `session-started`），答题页的题序由 `session-started` 固定，因此这里只能
 * 先落到 `/quest?practice=<ids>`，由守卫识别"这是重练"并为其装载上下文
 * （Task 18 之前 `practice` 只做路由跳转，不带题——所以先记录需求，不静默
 * 丢弃载荷）。
 *
 * 目录在这里合并自定义题：错题本必须能显示家长导入的题干，而内置目录是
 * import 时常量；每换一个档案就重新读该档案的自定义题并合并。
 */
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import MistakeBookView from '@/views/MistakeBookView.vue'
import { getProductionStores } from '@/app/productionStores'
import { mergeMistakeCatalog } from '@/app/mistakeCatalog'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import type { MistakeQuestionCatalog } from '@/features/mistakeBook/types'
import { HOME_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()
const catalog = ref<MistakeQuestionCatalog>(stores.mistakeCatalog)

watch(
  () => session.activeProfileId,
  async (profileId) => {
    if (profileId === null) {
      catalog.value = stores.mistakeCatalog
      return
    }
    const customQuestions = await stores.customQuestions.listByProfile(profileId)
    catalog.value = mergeMistakeCatalog(stores.mistakeCatalog, customQuestions)
  },
  { immediate: true },
)

function onPrint(filter: { type: string; masteryLevel: string }): void {
  void router.push({
    path: '/mistakes/print',
    query: { type: filter.type, mastery: filter.masteryLevel },
  })
}

function onPractice(payload: { questionIds: string[]; similarQuestionIds: string[] }): void {
  void router.push({
    path: '/quest',
    query: { practice: [...payload.questionIds, ...payload.similarQuestionIds].join(',') },
  })
}
</script>

<template>
  <MistakeBookView :store="stores.mistakes" :catalog="catalog"
    @practice="onPractice" @print="onPrint" @back-home="router.push(HOME_PATH)" />
</template>
