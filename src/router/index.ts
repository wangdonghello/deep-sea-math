import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

/**
 * 全局路由。
 *
 * 阶段一（Task 17）会补齐全部路由表与导航守卫；此处先建立路由实例，
 * 让脚手架阶段即可验证 `RouterView` 与 `router-link` 能正常工作。
 */
const routes: RouteRecordRaw[] = []

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
