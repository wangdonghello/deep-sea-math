<script setup lang="ts">
/**
 * 家长区门禁页的路由封装（P1）。
 *
 * 存在理由与 `ProfilesRoute` 一致：门禁放行后的落点是**装配决策**（家长总览
 * 路径），不属于视图契约。`ParentGateView` 只 emit `unlocked`，由本组件翻译成
 * `router.push`；视图因此不认识路由、也不需要知道三个子页面叫什么。
 *
 * 家长 PIN 仓储经 `getProductionStores()` 注入（守卫已 await 初始化），视图
 * 只依赖它的窄接口（`load` / `save`），测试可注入内存态 fake。
 */
import { useRouter } from 'vue-router'

import { getProductionStores } from '@/app/productionStores'
import { PARENT_OVERVIEW_PATH } from '@/router/nextRoute'
import ParentGateView from '@/views/ParentGateView.vue'

const router = useRouter()
const stores = getProductionStores()

/** 门禁放行 → 家长总览。 */
function onUnlocked(): void {
  void router.push(PARENT_OVERVIEW_PATH)
}
</script>

<template>
  <ParentGateView :store="stores.parentGate" @unlocked="onUnlocked" />
</template>
