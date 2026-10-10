import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import HomeView from '@/views/HomeView.vue'

/**
 * 全局路由。
 *
 * 阶段一（Task 17）会补齐全部路由表与导航守卫；此处先建立路由实例，
 * 让脚手架阶段即可验证 `RouterView` 与 `router-link` 能正常工作。
 *
 * Task 12 最小挂载：`/home` 指向 `HomeView`，否则 T11 登录成功后
 * `navigate(HOME_PATH)` 落到的是一条空路由（404），首页验收无从做起。
 * 装配 `HomeStore` 的生产代码在 Task 17 的守卫里（届时才有档案上下文），
 * 这里用异步组件包一层懒加载即可，不改 HomeView 的 props 契约。
 */
const routes: RouteRecordRaw[] = [{ path: '/home', name: 'home', component: HomeView }]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
