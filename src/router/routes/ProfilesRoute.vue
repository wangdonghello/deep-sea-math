<script setup lang="ts">
/**
 * 档案选择页的路由封装（Task 17）。
 *
 * 存在理由：登录成功后的落点是**装配决策**（首页路径），不属于视图契约。
 * `ProfileSelectView` 只 emit `navigate(path)`，由本组件翻译成 `router.push`。
 *
 * 家长区入口也在这里：首次安装时本机没有任何档案，而建档只能发生在家长区
 * （T16）。入口显示为独立的玻璃卡片，家长一眼可见、与孩子档案卡片视觉区分；
 * 不放进孩子常驻的 `TabBar`，避免进入后直接改题量/重置 PIN/删档案。
 * 这里是 `/parent` 的**唯一页面入口**（另可直接输 URL）；进入后先输家长 PIN，
 * 再落到 `/parent/overview` 等三个子路径。
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
  <div class="profiles-route">
    <ProfileSelectView :store="stores.profileSelect" :navigate="onNavigate" />
    <footer class="profiles-route__footer">
      <button type="button" class="profiles-route__parent-card" data-testid="goto-parent" @click="router.push(PARENT_PATH)">
        <span class="profiles-route__parent-icon" aria-hidden="true">🛡️</span>
        <span class="profiles-route__parent-copy">
          <strong>家长管理</strong>
          <small>设置任务 · 查看成长报告</small>
        </span>
        <span class="profiles-route__parent-arrow" aria-hidden="true">›</span>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.profiles-route { display: flex; flex-direction: column; min-height: 100dvh; background: var(--ds-bg-gradient); }
.profiles-route :deep(.profile-select) { flex: 1 0 auto; min-height: 0; }
.profiles-route__footer {
  width: min(100% - 2rem, 38rem);
  margin: 0 auto;
  margin-top: auto;
  padding: 0 0 max(var(--ds-space-lg), env(safe-area-inset-bottom));
}

.profiles-route__parent-card {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  min-height: 4.75rem;
  padding: var(--ds-space-md) var(--ds-space-lg);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: linear-gradient(115deg, rgb(14 42 69 / 96%), rgb(9 26 48 / 96%));
  color: var(--ds-text-primary);
  text-align: left;
  font: inherit;
  cursor: pointer;
  box-shadow: var(--ds-shadow-card);
}

.profiles-route__parent-card:active { transform: scale(.99); }
.profiles-route__parent-card:focus-visible { outline: 3px solid var(--ds-glow-primary); outline-offset: 2px; }
.profiles-route__parent-icon { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: var(--ds-radius-md); background: rgb(110 177 205 / 18%); font-size: 1.4rem; }
.profiles-route__parent-copy { display: grid; gap: 2px; }
.profiles-route__parent-copy strong { font-size: var(--ds-font-size-body); }
.profiles-route__parent-copy small { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.profiles-route__parent-arrow { margin-left: auto; color: var(--ds-text-muted); font-size: 1.75rem; line-height: 1; }
</style>
