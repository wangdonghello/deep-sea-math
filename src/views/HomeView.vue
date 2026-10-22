<script setup lang="ts">
/**
 * 首页（design §4：职责 = 地图主体 + 任务卡浮层，已定方案 A）。
 *
 * 布局 A：上半屏地图主体（下潜视角 + 鱼群），下半屏一张浮起的任务卡，底部
 * 常驻 TabBar。本视图只做**装配**：把 `MapPanel` / `QuestCard` / `TabBar`
 * 接到 `useHomeQuest` 上，自己不含任何业务规则（design §4 组件边界）。
 *
 * 「当前档案」来自 T11 的 `profileSessionStore`（ composable 内部读取），
 * 因此本视图不需要接档案 prop；没有会话态时显示引导语而不是空白屏——刷新后
 * 由 Task 17 的路由守卫依据投影是否为空决定是否打回档案选择页。
 *
 * 依赖注入：
 * - `store`（必填）：`HomeStore` 窄接口。生产装配由 Task 17 经
 *   `createHomeStore(resolveStorage())` 传入，测试注入内存态 fake。
 * - `clock` / `idGenerator`（可选）：组题的确定性与"今天是哪一天"的基准，
 *   缺省值都在 `useHomeQuest` 里（系统时钟 / Web Crypto UUID）；测试注入固定
 *   值以锁定"刷新不换题"。
 */
import { computed, onMounted } from 'vue'

import MapPanel from '@/features/home/MapPanel.vue'
import QuestCard from '@/features/home/QuestCard.vue'
import HomeProgressSummary from '@/features/home/HomeProgressSummary.vue'
import HomeStatusBar from '@/features/home/HomeStatusBar.vue'
import NextZoneHint from '@/features/home/NextZoneHint.vue'
import TabBar from '@/features/home/TabBar.vue'
import { useHomeQuest } from '@/features/home/useHomeQuest'
import { ZONES } from '@/features/home/zones'
import { homeThemeById } from '@/features/home/homeThemes'
import type { HomeStore } from '@/features/home/types'
import type { Question } from '@/domain/model/types'

const props = defineProps<{
  store: HomeStore
  /**
   * 候选题目池（**必填**，来自正式题库）。
   *
   * 必填是刻意的：早先它缺省到一份演示 fixture，而答题页按正式题库查题，
   * 于是首页组出的题在答题页一道都渲染不出来，守卫把 `/quest` 打回首页，
   * 表现为“点开始下潜没有任何反应”。显式传入后，这类错误在编译期就会暴露。
   */
  pool: readonly Question[]
  /** 按年级提供的题池；缺省用 `pool`（测试/第一版兼容）。 */
  poolByGrade?: Partial<Record<1 | 2 | 3, readonly Question[]>>
  clock?: () => number
  idGenerator?: () => string
  logger?: (entry: Record<string, unknown>) => void
}>()

const emit = defineEmits<{
  /** 开始下潜；载荷为当日题组 sessionId（Task 17 据此路由到答题页）。 */
  (event: 'start', sessionId: string): void
  /** TabBar 页签切换；载荷为页签 id。 */
  (event: 'navigate', tabId: string): void
}>()

const home = useHomeQuest({
  store: props.store,
  pool: props.pool,
  poolByGrade: props.poolByGrade,
  clock: props.clock,
  idGenerator: props.idGenerator,
  logger: props.logger,
})

/** 任务卡模型；未加载完成时用占位态渲染，避免布局跳动。 */
const card = computed(() => home.card.value)

/**
 * 点「开始下潜」。
 *
 * `active` 态一定带有 `sessionId`（见 {@link QuestCardModel} 的判别联合），
 * 因此无需兜底空串：万一将来状态与 ID 不同步，这里宁可不发事件，也不放一个
 * 空 sessionId 去污染路由层——Task 13 拿着空 ID 组题会静默生成第二组题。
 */
function onStart(): void {
  const current = card.value
  if (current === null || current.sessionId === null) return
  emit('start', current.sessionId)
}

/** 已完成题组数量：由当日题组完成态粗估（图鉴落地后改读事件投影）。 */
const completedQuests = computed(() => (card.value?.state === 'done' ? 1 : 0))

/**
 * 当前所在区域（来自事件投影的 `zone:*` 解锁项）。
 *
 * `-1` 表示还在潜水艇基地，`0..3` 是 {@link ZONES} 的下标 —— 与 `MapPanel`
 * 的 `currentZoneIndex` 契约一致。**不**再用"今天这组题完成没完成"估 0/1：
 * 那会让孩子完成过不止一组题时，首页地图与地图 Tab 页给出互相矛盾的答案。
 */
const theme = computed(() => homeThemeById(home.profile.value?.themeId ?? 'deep-sea'))

const currentZoneIndex = computed(() =>
  theme.value.id === 'deep-sea'
    ? home.zoneProgress.value.currentZoneIndex
    : home.themeStage.value - 1,
)

const nextZoneId = computed(() =>
  theme.value.id === 'deep-sea'
    ? home.zoneProgress.value.nextZoneId
    : theme.value.zones[home.themeStage.value]?.id,
)

const currentZoneForStatus = computed(() =>
  currentZoneIndex.value < 0 ? 'base' : theme.value.zones[currentZoneIndex.value]?.id ?? 'base',
)

onMounted(async () => {
  await home.load()
})
</script>

<template>
  <main class="home" data-testid="home">
    <!-- 无会话态：不读存储也不组题，只说明该去哪 -->
    <p v-if="home.profile.value === null && card === null" class="home__empty" data-testid="home-no-profile">
      还没有选择档案，请先回到档案选择页
    </p>

    <template v-else>
      <HomeStatusBar
        :nickname="home.profile.value?.nickname ?? ''"
        :current-zone-id="currentZoneForStatus"
        :theme="theme"
      />
      <HomeProgressSummary
        :summary="home.progressSummary.value"
        :total-zones="ZONES.length"
        :theme="theme"
        :stage="home.themeStage.value"
      />
      <NextZoneHint :next-zone-id="nextZoneId" :theme="theme" />

      <p v-if="home.loading.value" class="home__loading" data-testid="home-loading">正在打开今日任务…</p>

      <!--
        读取/写入失败的提示。文案是中性的一句，具体错因只进 composable 的
        脱敏日志（`logger`），与 T11 的 PIN 错误同一口径。任务卡此时为 null，
        因此提示放在地图与 TabBar 之间，不会出现"读失败了还以为今天没题"。
      -->
      <p
        v-if="card === null && !home.loading.value && home.errorMessage.value !== ''"
        class="home__error"
        data-testid="home-error"
        role="status"
        aria-live="polite"
      >
        {{ home.errorMessage.value }}
      </p>

      <MapPanel :current-zone-index="currentZoneIndex" :completed-quests="completedQuests" :theme="theme" />

      <QuestCard
        v-if="card !== null"
        :state="card.state"
        :nickname="card.nickname"
        :answered="card.answered"
        :total="card.total"
        :estimated-minutes="card.estimatedMinutes"
        :reward-label="theme.rewardLabel"
        :done-label="theme.doneLabel"
        :claiming="home.claiming.value"
        @start="onStart"
        @claim="home.claimToday()"
      />

      <TabBar active="home" :theme-id="theme.id" @navigate="emit('navigate', $event)" />
    </template>
  </main>
</template>

<style scoped>
/* 首页整屏：地图弹性撑满，任务卡与 TabBar 按内容高度沉底 */
.home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--ds-bg-gradient);
}

.home__empty {
  margin: auto;
  padding: var(--ds-space-xl);
  color: var(--ds-text-secondary);
  text-align: center;
}

.home__loading,
.home__error {
  position: relative;
  z-index: 1;
  margin: var(--ds-space-md) var(--ds-space-lg) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  text-align: center;
}
</style>
