<script setup lang="ts">
/**
 * 首页的路由封装（Task 17）。
 *
 * 把首页的两个 emit 翻译成路由动作：
 * - `start(sessionId)` → `/quest?session=<id>`（题组 id 走 query，刷新后仍能
 *   回到同一组——`session-started` 已把题序固定，深链必须是可复现的）；
 * - `navigate(tabId)` → 页签路径。`TabBar` 的载荷是**页签 id**（`home` /
 *   `bestiary` / `mistake` / `parent`），不是路径，因此这里做一次 id → path
 *   映射；`parent` 是家长区，孩子常驻导航里保留它只是设计稿的既有形态，
 *   真正的建档入口在档案选择页（不显眼的一行小字）。
 */
import { useRouter } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import { getProductionStores } from '@/app/productionStores'

const router = useRouter()
const stores = getProductionStores()

/** 页签 id → 路由路径（`TabBar` 只认页签 id，见 `features/home/TabBar.vue`）。 */
const TAB_PATHS: Readonly<Record<string, string>> = {
  home: '/home',
  bestiary: '/bestiary',
  mistake: '/mistakes',
  parent: '/parent',
}

function onNavigate(tabId: string): void {
  const path = TAB_PATHS[tabId]
  // 表里没有的页签 id 一律忽略：把一个未知 id 当路径 push 会得到 404 空屏。
  if (path === undefined) return
  void router.push(path)
}
</script>

<template>
  <HomeView
    :store="stores.home"
    @start="(sessionId) => router.push(`/quest?session=${sessionId}`)"
    @navigate="onNavigate"
  />
</template>
