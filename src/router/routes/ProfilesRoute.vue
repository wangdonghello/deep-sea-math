<script setup lang="ts">
/**
 * 档案选择页的路由封装（Task 17）。
 *
 * 存在理由：登录成功后的落点是**装配决策**（首页路径），不属于视图契约。
 * `ProfileSelectView` 只 emit `navigate(path)`，由本组件翻译成 `router.push`。
 *
 * 家长区入口也在这里：首次安装时本机没有任何档案，而建档只能发生在家长区
 * （T16）。入口刻意做成页脚一行小字——孩子选档案时不该被它吸引，家长却找得到
 * （T16 审查的残余风险：`/parent` 不进孩子常驻导航）。
 */
import { useRouter } from 'vue-router'

import ProfileSelectView from '@/views/ProfileSelectView.vue'
import { getProductionStores } from '@/app/productionStores'
import { PARENT_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()

/** 登录成功的落点由组件翻译成路由动作（视图自己不 import router）。 */
function onNavigate(path: string): void {
  void router.push(path)
}
</script>

<template>
  <ProfileSelectView :store="stores.profileSelect" @navigate="onNavigate" />
  <footer class="profiles-route__footer">
    <button type="button" data-testid="goto-parent" @click="router.push(PARENT_PATH)">家长区</button>
  </footer>
</template>

<style scoped>
/* 低对比、小字号：找得到，但不与"选择你的档案"抢注意力 */
.profiles-route__footer {
  padding: var(--ds-space-lg);
  text-align: center;
}

.profiles-route__footer button {
  border: 0;
  background: none;
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
  cursor: pointer;
}
</style>
