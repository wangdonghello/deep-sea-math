<script setup lang="ts">
/**
 * 应用根组件（Task 17 的整体装配）。
 *
 * 只放三样东西，且刻意不多放：
 * 1. `<RouterView>`：全部页面由路由表渲染，根组件不认任何具体视图；
 * 2. `<UnlockOverlay>`：解锁反馈是**全局**的——做完一组题后孩子可能先去图鉴
 *    或观察舱，反馈必须跨越路由存在，因此挂在根组件上；
 * 3. 全局错误兜底：任何视图渲染期抛错都不该留下白屏。
 *
 * 为什么没有全局 `FishBackdrop`：背景鱼群由各视图自己声明（首页/地图才是它
 * 该出现的场景），根组件放一份会在档案选择页也出现——那里要的是安静。
 */
import { onErrorCaptured, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

import UnlockOverlay from '@/features/unlock/UnlockOverlay.vue'
import { useUnlockFeedback } from '@/features/unlock/useUnlockFeedback'
import { getProductionStores, initProductionStores } from '@/app/productionStores'
import { redact } from '@/shared/redact'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'

const route = useRoute()
const router = useRouter()
const session = useProfileSessionStore()

/** 渲染期兜底错误：视图炸掉时给孩子一句话，而不是白屏。 */
const fatalError = ref('')
/** 给家长的定位信息：只保留错误消息，不含堆栈与本机路径。 */
const fatalDetail = ref('')

function recoverFromError(): void {
  fatalError.value = ''
  fatalDetail.value = ''
  void router.push('/pet')
}

onErrorCaptured((error) => {
  fatalError.value = '页面出了点问题，请回到首页再试'
  fatalDetail.value = error instanceof Error ? error.message : String(error)
  // 错误对象可能带本机路径与库名：经 `redact()` 脱敏后才允许离开本模块。
  console.error('[deep-sea-math] 视图渲染失败', redact({ error }))
  // 返回 false 阻止继续向上冒泡（父级只有 #app，冒泡没有意义）。
  return false
})

/**
 * 解锁反馈。
 *
 * `profileId` 直接读 Pinia 会话态（ref，随登录/退出自动更新）；`store` 经
 * 已初始化的生产单例取——根组件挂载可能早于首次导航完成，因此等
 * `initProductionStores()` 落地后才 `start()`。
 */
const feedback = useUnlockFeedback({
  store: {
    listEvents: (profileId) => getProductionStores().quiz.listEvents(profileId),
  },
  profileId: () => session.activeProfileId,
  themeId: () => session.projection?.themeId ?? 'deep-sea',
})

onMounted(async () => {
  await initProductionStores()
  feedback.start()
})

onUnmounted(() => feedback.stop())

/** 每次导航后再查一次：完成题组的那一刻往往正发生在答题页内。 */
watch(() => route.fullPath, () => void feedback.check())
</script>

<template>
  <div id="app">
    <RouterView v-if="fatalError === ''" />
    <div v-else class="app__fatal" role="alert" data-testid="app-fatal">
      <p>{{ fatalError }}</p>
      <small v-if="fatalDetail !== ''" class="app__fatal-detail" data-testid="app-fatal-detail">错误信息：{{ fatalDetail }}</small>
      <button type="button" class="app__fatal-recover" data-testid="app-fatal-recover" @click="recoverFromError">回到宠物房间</button>
    </div>
    <UnlockOverlay
      :open="feedback.visible.value"
      :rewards="feedback.rewards.value"
      :points="feedback.pointsEarned.value"
      @close="feedback.dismiss()"
    />
  </div>
</template>

<style scoped>
.app__fatal {
  display: grid;
  gap: 6px;
  justify-items: center;
  margin: auto;
  padding: 0 var(--ds-space-lg);
  text-align: center;
  padding: var(--ds-space-xl);
  color: var(--ds-text-secondary);
  text-align: center;
}
.app__fatal-recover {
  margin-top: 6px;
  padding: 0.45rem 1rem;
  border: 1px solid var(--ds-glow-primary);
  border-radius: var(--ds-radius-pill);
  background: rgb(24 78 116 / 82%);
  color: var(--ds-text-primary);
  font: inherit;
}
.app__fatal-detail { color: var(--ds-text-secondary); font-size: .75rem; word-break: break-word; }
</style>
