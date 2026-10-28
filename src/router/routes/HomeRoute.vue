<script setup lang="ts">
/**
 * 首页的路由封装（Task 17）。
 *
 * 把首页的两个 emit 翻译成路由动作：
 * - `start(sessionId)` → `/quest?session=<id>`（题组 id 走 query，刷新后仍能
 *   回到同一组——`session-started` 已把题序固定，深链必须是可复现的）；
 * - `navigate(tabId)` → 页签路径。`TabBar` 的载荷是**页签 id**（`home` /
 *   `bestiary` / `mistake`），不是路径，因此这里做一次 id → path 映射。
 *   **`parent` 不在表里**：家长区入口刻意只留在档案选择页的页脚小字，
 *   孩子的常驻导航不含它（`/parent` 无身份验证，见 `features/home/TabBar.vue`）。
 */
import { useRouter } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import { getProductionStores } from '@/app/productionStores'
import { QUESTION_BANK, QUESTION_BANK_BY_GRADE } from '@/data/content'

const router = useRouter()
const stores = getProductionStores()

/**
 * 候选题目池：**正式题库**。
 *
 * 必须在这里显式传入，且与答题页（`app/questContext.ts` 也读 `QUESTION_BANK`）
 * 用同一份内容。这两处一旦分叉，首页组出的题在答题页就查不到，守卫会把
 * `/quest` 打回首页——正是早前“点开始下潜没反应”的成因。
 */
const POOL = QUESTION_BANK.questions

/** 按年级的正式题池：首页按当前档案年级取，避免把三年级题发给低年级。 */
const POOL_BY_GRADE = {
  1: QUESTION_BANK_BY_GRADE[1].questions,
  2: QUESTION_BANK_BY_GRADE[2].questions,
  3: QUESTION_BANK_BY_GRADE[3].questions,
  4: QUESTION_BANK_BY_GRADE[4].questions,
  5: QUESTION_BANK_BY_GRADE[5].questions,
  6: QUESTION_BANK_BY_GRADE[6].questions,
} as const

/** 页签 id → 路由路径（`TabBar` 只认页签 id，见 `features/home/TabBar.vue`）。 */
const TAB_PATHS: Readonly<Record<string, string>> = {
  home: '/home',
  bestiary: '/bestiary',
  mistake: '/mistakes',
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
    :pool="POOL"
    :pool-by-grade="POOL_BY_GRADE"
    @start="(sessionId) => router.push(`/quest?session=${sessionId}`)"
    @navigate="onNavigate"
  />
</template>
