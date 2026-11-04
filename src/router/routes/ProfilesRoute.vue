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
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import ProfileSelectView from '@/views/ProfileSelectView.vue'
import { getProductionStores } from '@/app/productionStores'
import { importV3Progress } from '@/data/importV3Progress'
import { PARENT_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()
const importing = ref(false)
const importMessage = ref('')

/**
 * 一次性导入 v3 的档案与进度。
 *
 * 用 `confirm` 做二次确认：这是会写本机数据库的操作，误点不应该发生。
 * 成功后刷新页面，让 `ProfileSelectView` 重新读档案列表；失败只显示文案，
 * 不抛错。
 */
async function onImportV3(): Promise<void> {
  if (importing.value) return
  if (!globalThis.confirm('从第三版导入档案与学习进度？已有档案不会被覆盖。')) return
  importing.value = true
  importMessage.value = ''
  try {
    const result = await importV3Progress()
    if (!result.sourceFound) {
      importMessage.value = '没有找到第三版的进度数据。'
      return
    }
    if (result.profiles === 0) {
      importMessage.value = '没有新的档案可导入（可能已经导入过）。'
      return
    }
    importMessage.value = `已导入 ${result.profiles} 个档案、${result.events} 条事件，正在刷新…`
    globalThis.setTimeout(() => globalThis.location.reload(), 700)
  } catch {
    importMessage.value = '导入失败，请稍后再试。'
  } finally {
    importing.value = false
  }
}

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
      <button
        type="button"
        class="profiles-route__import"
        data-testid="import-v3"
        :disabled="importing"
        @click="onImportV3"
      >
        {{ importing ? '导入中…' : '从第三版导入进度' }}
      </button>
      <p v-if="importMessage !== ''" class="profiles-route__import-message" data-testid="import-v3-message">
        {{ importMessage }}
      </p>
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

.profiles-route__import {
  width: 100%;
  margin-bottom: var(--ds-space-sm);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px dashed var(--ds-glass-border);
  border-radius: var(--ds-radius-md);
  background: rgb(8 30 52 / 55%);
  color: var(--ds-text-secondary);
  font: inherit;
  font-size: var(--ds-font-size-caption);
  cursor: pointer;
}

.profiles-route__import:disabled { opacity: .6; cursor: progress; }
.profiles-route__import:focus-visible { outline: 3px solid var(--ds-glow-primary); outline-offset: 2px; }
.profiles-route__import-message { margin: 0 0 var(--ds-space-sm); color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); text-align: center; }

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
