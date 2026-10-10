<script setup lang="ts">
/**
 * 答题页的路由封装（Task 17）。
 *
 * 三件事：
 * 1. **接住守卫装配好的题组上下文**（`route.meta.questContext`）。守卫读事件、
 *    定位当日题组；本组件只把结果翻译成 `QuestView` 的 props。用 `computed` 读
 *    `meta` 而不是 setup 时取一次快照——`/quest` 与 `/quest?practice=` 是同一条
 *    路由记录，两次导航之间组件实例会被复用，快照会读到上一次的题组；
 * 2. **用 `route.fullPath` 作 key 强制重挂载**。`useQuizSession` 在 setup 里
 *    一次性捕获 `sessionId`（props 后续变化不会流进 composable），而"做完当日
 *    题组 → 去错题本练一道 → 再回当日题组"这条路会两次进入同一路由记录。没有
 *    key，第二次进去的还是旧会话：进度条接着刚才的题走，发奖也发到旧会话上；
 * 3. **注入生产 `QuizSessionStore`**（窄接口：读事件 + 幂等追加）。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import QuestView from '@/views/QuestView.vue'
import { getProductionStores } from '@/app/productionStores'
import type { QuestRouteContext } from '@/app/questContext'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'

const route = useRoute()
const stores = getProductionStores()
const profileId = computed(() => useProfileSessionStore().activeProfileId ?? '')

/** 本次导航的题组上下文；守卫没装配上时（理论上不会）退化为空 props。 */
const context = computed<QuestRouteContext | undefined>(
  () => route.meta.questContext as QuestRouteContext | undefined,
)

/** 无题组时不渲染答题页：路由守卫已经把这种情况打回首页，这里只是兜底。 */
const ready = computed(() => context.value !== undefined && context.value.sessionId !== null)
</script>

<template>
  <QuestView
    v-if="ready && context"
    :key="route.fullPath"
    :session-id="context.sessionId ?? ''"
    :profile-id="profileId"
    :questions="context.questions"
    :similar-question-pool="context.similarQuestionPool"
    :creature-id="context.creatureId"
    :zone-id="context.zoneId"
    :store="stores.quiz"
  />
</template>
