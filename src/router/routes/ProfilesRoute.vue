<script setup lang="ts">
/**
 * 档案选择页的路由封装（Task 17）。
 *
 * 存在理由：登录成功后的落点是**装配决策**（首页路径），不属于视图契约。
 * `ProfileSelectView` 只 emit `navigate(path)`，由本组件翻译成 `router.push`。
 *
 * 家长区入口也在这里：首次安装时本机没有任何档案，而建档只能发生在家长区
 * （T16）。入口刻意做成页脚一行小字——孩子选档案时不该被它吸引，家长却找得到。
 * 这里是 `/parent` 的**唯一**入口：`TabBar` 常驻导航里没有家长区（孩子点一下
 * 就能改题量/重置 PIN/删档案），T17 审查后已从页签移除，只保留本页脚与直接
 * 输 URL 两条路。P1 起 `/parent` 是**门禁页**（本轮重构的第一半），进入后先
 * 输家长 PIN，再落到 `/parent/overview` 等三个子路径。
 */
import { useRouter } from 'vue-router'

import ProfileSelectView from '@/views/ProfileSelectView.vue'
import { getProductionStores } from '@/app/productionStores'
import { PARENT_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()

/**
 * 登录成功的落点由组件翻译成路由动作（视图自己不 import router）。
 *
 * 注意这里是**传入 prop** 而不是监听事件：`ProfileSelectView` 把导航回调声明为
 * 可选 prop `navigate`，并没有 `defineEmits` 出 `navigate` 事件。早先写成
 * `@navigate` 时 `props.navigate` 恒为 `undefined`，`useProfileSelect` 内部
 * 回落到 no-op —— 表现为「输完 PIN 点确定，PIN 被清空但页面不动」。
 */
function onNavigate(path: string): void {
  void router.push(path)
}
</script>

<template>
  <ProfileSelectView :store="stores.profileSelect" :navigate="onNavigate" />
  <footer class="profiles-route__footer">
    <button type="button" data-testid="goto-parent" @click="router.push(PARENT_PATH)">家长区（家长管理）</button>
  </footer>
</template>

<style scoped>
/*
 * 次级按钮：玻璃底 + `--ds-glass-border`，刻意不用主色暖橙——它不能与
 * 「选择你的档案」的主操作抢注意力；但要有明确边框与足够的点按高度，
 * 让家长一眼看得到、一点就中（原先是一行低对比小字，家长找不到）。
 */
.profiles-route__footer {
  display: flex;
  justify-content: center;
  padding: var(--ds-space-lg);
}

.profiles-route__footer button {
  min-height: 2.75rem;
  padding: 0 1.5rem;
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-md, 0.75rem);
  background: var(--ds-glass-surface, rgba(9, 26, 48, 0.92));
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-body, 15px);
  cursor: pointer;
}
</style>
