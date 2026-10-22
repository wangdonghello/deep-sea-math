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
 */
import { useRouter } from 'vue-router'

import MistakeBookView from '@/views/MistakeBookView.vue'
import { getProductionStores } from '@/app/productionStores'
import { HOME_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()

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
  <MistakeBookView :store="stores.mistakes" :catalog="stores.mistakeCatalog"
    @practice="onPractice" @print="onPrint" @back-home="router.push(HOME_PATH)" />
</template>
