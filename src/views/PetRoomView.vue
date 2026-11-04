<script setup lang="ts">
/**
 * 宠物房间（v4 Plan Task 8）。
 *
 * 组件只接 `profileId` / `store` / `clock`，不读路由、不碰具体存储实现：
 * 生产装配（`routes/PetRoute.vue`）与测试注入同一套窄接口 `PetStore`。
 *
 * 数据流：
 * ```
 * usePet（事件重放）──► state ──► HUD / 状态条 / 动作按钮
 *        ▲                          │
 *        └────── feed / pet / play ─┘
 * ```
 *
 * 两个刻意的实现决定：
 * 1. **动作后重新 `load()`**。`usePet` 以 `appendEvents` 的返回值为本地视角，
 *    生产 store 返回的是「合并去重后的全量日志」，但测试/第三方 fake 可能只
 *    回传刚写入的增量。重新读一次全量日志，两种 store 语义下房间都能立刻
 *    反映最新状态（XP、背包、每日次数），不会出现「喂完显示成没有宠物」。
 * 2. **`hunger` 是饱食度**。投影里的 `hunger` 越高越饱，界面统一展示
 *    `饥饿值 = 100 - decayedHunger(...)`：0 表示吃饱、100 表示很饿，
 *    文案只出现「饥饿值」，避免两个方向相反的数字同时出现。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { FOOD_ITEMS, TOY_ITEMS } from '@/data/content/petCatalog'
import type { PetItem } from '@/data/content/petCatalog'
import { decayedHunger } from '@/domain/pet/growth'
import { MAX_FEED_PER_DAY, MAX_PET_PER_DAY, MAX_PLAY_PER_DAY } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import PetAvatar from '@/features/pet/PetAvatar.vue'
import { usePet } from '@/features/pet/usePet'
import type { PetStore } from '@/features/pet/usePet'

const props = defineProps<{
  /** 当前档案；`null` 时只显示引导，不加载任何事件。 */
  profileId: string | null
  /** 事件存储窄接口（生产由路由注入，测试注入内存 fake）。 */
  store: PetStore
  /** 可注入时钟；测试用固定值锁定每日上限与饱食度衰减。 */
  clock?: () => number
}>()

const emit = defineEmits<{
  (event: 'start-quest'): void
  (event: 'open-shop'): void
  (event: 'back-home'): void
  (event: 'navigate', tabId: string): void
}>()

/** 统一取时：显式注入优先，缺省系统时钟。 */
const clock = props.clock ?? (() => Date.now())

const {
  events,
  state,
  loading,
  error,
  load,
  feed,
  pet: petAction,
  play,
} = usePet({
  store: props.store,
  profileId: () => props.profileId,
  clock,
})

/** 界面侧的「现在」：饱食度衰减与 UTC 日统计都以它为基准。 */
const now = ref(clock())

/** 动作失败（每日上限、库存不足等）的提示；与加载失败的 `error` 分开。 */
const actionError = ref('')
/** 串行执行动作，避免连点造成两次写入与按钮状态闪烁。 */
const busy = ref(false)

const noProfile = computed(() => props.profileId === null)

const displayName = computed(() => {
  if (!state.value.adopted) return '还没有宠物'
  return state.value.name.trim() === '' ? '小海宠' : state.value.name
})

/**
 * 头像阶段。
 *
 * 领域里的 `stage` 由等级推导（Lv0 = 蛋），但「孵化」是独立事件：刚孵化的
 * 小宠物还是 Lv0，若照搬 `stage` 会继续画成一颗蛋。这里在已孵化时把蛋阶段
 * 提成幼体，让画面与「已经破壳」的事实一致；未孵化则始终显示蛋。
 */
const avatarStage = computed(() => {
  if (!state.value.hatched) return 'egg'
  return state.value.stage === 'egg' ? 'baby' : state.value.stage
})

const STAGE_LABELS = {
  egg: '蛋',
  baby: '幼体',
  juvenile: '少年',
  adult: '成体',
  final: '完全体',
} as const

const stageLabel = computed(() => STAGE_LABELS[state.value.stage] ?? '幼体')

/** 装饰优先级：珊瑚 > 灯 > 巢 > 普通。买了就立刻换背景。 */
const decor = computed<'plain' | 'nest' | 'lamp' | 'coral'>(() => {
  const owned = state.value.owned
  if (owned.includes('coral-backdrop')) return 'coral'
  if (owned.includes('shell-lamp')) return 'lamp'
  if (owned.includes('seaweed-nest')) return 'nest'
  return 'plain'
})

/** 饱食度（越高越饱）；展示前转成「饥饿值」。 */
const satiety = computed(() => decayedHunger(state.value.hunger, state.value.lastUpdatedAt, now.value))
const hunger = computed(() => Math.max(0, Math.min(100, Math.round(100 - satiety.value))))
const mood = computed(() => Math.max(0, Math.min(100, Math.round(state.value.mood))))

/** 状态条配色：绿色=状态好，黄色=一般，红色=需要照顾。 */
const moodTone = computed(() => (mood.value >= 67 ? 'good' : mood.value >= 34 ? 'mid' : 'low'))
const hungerTone = computed(() => (hunger.value <= 33 ? 'good' : hunger.value <= 66 ? 'mid' : 'low'))

/** UTC 日期键：每日上限与 `replayPet` 口径一致。 */
function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

function countToday(type: DomainEvent['type']): number {
  const profileId = props.profileId
  if (profileId === null) return 0
  const today = dayKey(now.value)
  return events.value.filter(
    (event) => event.profileId === profileId && event.type === type && dayKey(event.occurredAt) === today,
  ).length
}

const feedUsed = computed(() => countToday('pet-fed'))
const petUsed = computed(() => countToday('pet-petted'))
const playUsed = computed(() => countToday('pet-played'))

const feedAtCap = computed(() => feedUsed.value >= MAX_FEED_PER_DAY)
const petAtCap = computed(() => petUsed.value >= MAX_PET_PER_DAY)
const playAtCap = computed(() => playUsed.value >= MAX_PLAY_PER_DAY)

/** 背包里还有存量的食物（没有就不显示对应的喂食按钮）。 */
const foodInBag = computed(() =>
  FOOD_ITEMS.filter((item) => (state.value.inventory[item.id] ?? 0) > 0).map((item) => ({
    item,
    count: state.value.inventory[item.id] ?? 0,
  })),
)

const ownedToys = computed<readonly PetItem[]>(() =>
  TOY_ITEMS.filter((item) => state.value.owned.includes(item.id)),
)

/** 今天已完成的题组数，用于探险卡副标题。 */
const completedToday = computed(() => {
  const profileId = props.profileId
  if (profileId === null) return 0
  const today = dayKey(now.value)
  const sessions = new Set(
    events.value
      .filter(
        (event) =>
          event.profileId === profileId &&
          event.type === 'session-completed' &&
          dayKey(event.occurredAt) === today,
      )
      .map((event) => (event.type === 'session-completed' ? event.sessionId : '')),
  )
  return sessions.size
})

const questSubtitle = computed(() => {
  if (!state.value.hatched) return '完成一组题，蛋就会孵化'
  return completedToday.value > 0
    ? `今天已完成 ${completedToday.value} 组 · 继续下潜`
    : '每日一组题 · 攒积分养宠物'
})

/**
 * 执行一次宠物动作。
 *
 * 动作成功后重新加载全量事件：每日次数、背包与 XP 都以日志为准，不在组件里
 * 手工推算第二份状态。失败只把文案放到 `actionError`，不打断页面。
 */
async function runAction(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await action()
    await load()
    now.value = clock()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '这次没成功，再试一次吧'
  } finally {
    busy.value = false
  }
}

function onFeed(itemId: string): void {
  void runAction(() => feed(itemId))
}

function onPlay(itemId: string): void {
  void runAction(() => play(itemId))
}

/**
 * 点宠物本体 = 抚摸。
 *
 * 未孵化时只做挤压反馈，不写 `pet-petted`（蛋还没破壳）；到每日上限时给出
 * 提示而不是静默失败。
 */
function onPetTap(): void {
  if (!state.value.hatched) return
  if (petAtCap.value) {
    actionError.value = `今天已经摸过 ${MAX_PET_PER_DAY} 次啦，明天再摸`
    return
  }
  void runAction(() => petAction())
}

function reload(): void {
  void load()
}

interface BubbleSpec {
  readonly id: number
  readonly left: string
  readonly size: string
  readonly delay: string
  readonly duration: string
}

/** 固定位置的气泡粒子：测试里不会随机，视觉上疏密可控。 */
const BUBBLES: readonly BubbleSpec[] = [
  { id: 0, left: '6%', size: '0.55rem', delay: '-2s', duration: '14s' },
  { id: 1, left: '17%', size: '0.8rem', delay: '-7s', duration: '18s' },
  { id: 2, left: '31%', size: '0.4rem', delay: '-4s', duration: '12s' },
  { id: 3, left: '68%', size: '0.6rem', delay: '-9s', duration: '16s' },
  { id: 4, left: '81%', size: '0.9rem', delay: '-1s', duration: '19s' },
  { id: 5, left: '92%', size: '0.45rem', delay: '-6s', duration: '13s' },
]

function bubbleStyle(bubble: BubbleSpec): Record<string, string> {
  return {
    left: bubble.left,
    width: bubble.size,
    height: bubble.size,
    animationDelay: bubble.delay,
    animationDuration: bubble.duration,
  }
}

/** 切档案时重置临时状态；事件加载由 `usePet` 自己监听。 */
watch(
  () => props.profileId,
  () => {
    actionError.value = ''
    now.value = clock()
  },
)

let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  // 没有注入时钟时，让饱食度与「今天」在长时间停留时缓慢刷新。
  if (props.clock !== undefined) return
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})

onBeforeUnmount(() => {
  if (ticker !== undefined) clearInterval(ticker)
  ticker = undefined
})
</script>

<template>
  <main class="pet-room" data-testid="pet-room" :data-decor="decor">
    <!-- 背景层：光束 / 气泡 / 沙地光晕 / 装饰，全部不参与点击与读屏 -->
    <div class="pet-room__backdrop" aria-hidden="true">
      <span class="pet-room__beam pet-room__beam--left"></span>
      <span class="pet-room__beam pet-room__beam--right"></span>
      <span class="pet-room__glow"></span>
      <span class="pet-room__sand"></span>
      <span
        v-for="bubble in BUBBLES"
        :key="bubble.id"
        class="pet-room__bubble"
        :style="bubbleStyle(bubble)"
      ></span>
      <span v-if="decor === 'nest'" class="pet-room__decor pet-room__decor--nest">
        <i></i><i></i><i></i>
      </span>
      <span v-else-if="decor === 'lamp'" class="pet-room__decor pet-room__decor--lamp"></span>
      <span v-else-if="decor === 'coral'" class="pet-room__decor pet-room__decor--coral">
        <i></i><i></i><i></i>
      </span>
    </div>

    <div class="pet-room__inner">
      <p v-if="loading && events.length === 0" class="pet-room__notice" role="status">
        <span class="pet-room__loader" aria-hidden="true"></span>
        正在打开宠物房间…
      </p>

      <section v-else-if="error" class="pet-room__notice" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="pet-room__retry" @click="reload">再试一次</button>
      </section>

      <section v-else-if="noProfile" class="pet-room__notice">
        <p>请先选择学习档案，再来照顾小海宠。</p>
      </section>

      <template v-else>
        <header class="pet-room__hud">
          <div class="pet-room__identity">
            <span class="pet-room__eyebrow">深海宠物房</span>
            <strong class="pet-room__title" data-testid="pet-name">{{ displayName }}</strong>
          </div>
          <div class="pet-room__wallet">
            <span class="pet-room__pill pet-room__pill--level">Lv.{{ state.level }}</span>
            <span class="pet-room__pill pet-room__pill--points" data-testid="pet-points">
              <span class="pet-room__pill-icon" aria-hidden="true">🐚</span>
              积分 {{ state.points }}
            </span>
          </div>
        </header>

    <nav class="pet-room__nav" aria-label="快捷入口">
      <button type="button" data-testid="nav-learn" @click="emit('navigate', 'learn')">学习</button>
      <button type="button" data-testid="nav-shop" @click="emit('navigate', 'shop')">商店</button>
      <button type="button" data-testid="nav-bestiary" @click="emit('navigate', 'bestiary')">图鉴</button>
    </nav>

        <section v-if="state.adopted" class="pet-room__status" aria-label="宠物状态">
          <div class="pet-room__bar-row">
            <span class="pet-room__bar-label">心情</span>
            <div
              class="status-bar"
              :class="`status-bar--${moodTone}`"
              role="progressbar"
              aria-label="心情"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="mood"
            >
              <span class="status-bar__fill" :style="{ width: `${mood}%` }"></span>
            </div>
            <span class="pet-room__bar-value">{{ mood }}/100</span>
          </div>

          <div class="pet-room__bar-row">
            <span class="pet-room__bar-label">饥饿</span>
            <div
              class="status-bar"
              :class="`status-bar--${hungerTone}`"
              role="progressbar"
              aria-label="饥饿值，0 表示吃饱，100 表示很饿"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="hunger"
            >
              <span class="status-bar__fill" :style="{ width: `${hunger}%` }"></span>
            </div>
            <span class="pet-room__bar-value" data-testid="pet-hunger">饥饿值 {{ hunger }}/100</span>
          </div>

          <div class="pet-room__status-foot">
            <span class="pet-room__xp" data-testid="pet-xp">XP {{ state.xp }}</span>
            <span class="pet-room__status-note">饥饿值 0 最饱，100 最饿</span>
          </div>
        </section>

        <section class="pet-room__stage" aria-label="宠物房间">
          <div class="pet-room__pet">
            <PetAvatar :stage="avatarStage" :mood="state.mood" @tap="onPetTap" />
          </div>
          <div class="pet-room__nameplate">
            <span class="pet-room__nameplate-name">{{ displayName }}</span>
            <span class="pet-room__nameplate-meta">{{ stageLabel }} · Lv.{{ state.level }}</span>
          </div>
          <p v-if="!state.hatched" class="pet-room__hatch" data-testid="hatch-hint">
            <span aria-hidden="true">🥚</span>
            完成一组题后孵化
          </p>
        </section>

        <button
          type="button"
          class="pet-room__quest"
          data-testid="start-quest"
          @click="emit('start-quest')"
        >
          <span class="pet-room__quest-icon" aria-hidden="true">🗺️</span>
          <span class="pet-room__quest-text">
            <strong>今日探险</strong>
            <small>{{ questSubtitle }}</small>
          </span>
          <span class="pet-room__quest-arrow" aria-hidden="true">→</span>
        </button>

        <section class="pet-room__actions" aria-label="和宠物互动">
          <p v-if="actionError" class="pet-room__error" role="alert">{{ actionError }}</p>

          <template v-if="state.adopted && state.hatched">
            <div class="pet-room__group">
              <p class="pet-room__group-title">
                <span>喂食</span>
                <span class="pet-room__cap">{{ feedUsed }}/{{ MAX_FEED_PER_DAY }}</span>
              </p>
              <div v-if="foodInBag.length > 0" class="pet-room__buttons">
                <button
                  v-for="entry in foodInBag"
                  :key="entry.item.id"
                  type="button"
                  class="pet-action"
                  :data-testid="`feed-${entry.item.id}`"
                  :disabled="feedAtCap || busy"
                  @click="onFeed(entry.item.id)"
                >
                  <span class="pet-action__icon" aria-hidden="true">{{ entry.item.icon }}</span>
                  <span class="pet-action__label">{{ entry.item.name }}</span>
                  <span class="pet-action__count">×{{ entry.count }}</span>
                </button>
              </div>
              <p v-else class="pet-room__empty">背包里没有食物了，去商店补一点吧。</p>
              <p v-if="feedAtCap" class="pet-room__cap-hint">今天的喂食次数用完啦，明天再喂它。</p>
            </div>

            <div class="pet-room__group">
              <p class="pet-room__group-title">
                <span>玩耍</span>
                <span class="pet-room__cap">{{ playUsed }}/{{ MAX_PLAY_PER_DAY }}</span>
              </p>
              <div v-if="ownedToys.length > 0" class="pet-room__buttons">
                <button
                  v-for="toy in ownedToys"
                  :key="toy.id"
                  type="button"
                  class="pet-action"
                  :data-testid="`play-${toy.id}`"
                  :disabled="playAtCap || busy"
                  @click="onPlay(toy.id)"
                >
                  <span class="pet-action__icon" aria-hidden="true">{{ toy.icon }}</span>
                  <span class="pet-action__label">{{ toy.name }}</span>
                </button>
              </div>
              <p v-else class="pet-room__empty">
                还没有玩具，
                <button type="button" class="pet-room__link" @click="emit('open-shop')">去商店买玩具</button>
              </p>
              <p v-if="playAtCap" class="pet-room__cap-hint">今天已经玩够 {{ MAX_PLAY_PER_DAY }} 次啦。</p>
            </div>

            <div class="pet-room__group pet-room__group--touch">
              <button
                type="button"
                class="pet-action pet-action--touch"
                data-testid="pet-pet"
                :disabled="petAtCap || busy"
                @click="onPetTap"
              >
                <span class="pet-action__icon" aria-hidden="true">🤚</span>
                <span class="pet-action__label">摸摸它</span>
                <span class="pet-action__count">{{ petUsed }}/{{ MAX_PET_PER_DAY }}</span>
              </button>
              <p v-if="petAtCap" class="pet-room__cap-hint">
                今天摸够 {{ MAX_PET_PER_DAY }} 次啦，它有点害羞。
              </p>
            </div>
          </template>

          <p v-else-if="!state.adopted" class="pet-room__empty">先领养一只小海宠吧。</p>
          <p v-else class="pet-room__empty">孵化后就能喂食、抚摸和玩耍啦。</p>

          <button
            type="button"
            class="pet-room__shop"
            data-testid="open-shop"
            @click="emit('open-shop')"
          >
            <span aria-hidden="true">🛒</span>
            去商店
          </button>
        </section>
      </template>

      <BottomReturnButton label="切换档案" @back="emit('back-home')" />
    </div>
  </main>
</template>

<style scoped>
.pet-room {
  position: relative;
  min-height: 100dvh;
  overflow-x: clip;
  isolation: isolate;
  color: var(--ds-text-primary);
  background: radial-gradient(120% 90% at 50% -10%, #1d6a96 0%, #0b2b52 42%, #04101f 100%);
}

/* 装饰改变房间底色：珊瑚最暖、灯偏金、巢偏青。 */
.pet-room[data-decor='nest'] {
  background: radial-gradient(120% 90% at 50% 112%, #1f6b52 0%, #0b2b52 44%, #04101f 100%);
}
.pet-room[data-decor='lamp'] {
  background: radial-gradient(95% 80% at 78% 0%, #6b5528 0%, #123a5c 38%, #04101f 100%);
}
.pet-room[data-decor='coral'] {
  background: radial-gradient(110% 90% at 50% 116%, #7a3b52 0%, #123a5c 46%, #04101f 100%);
}

.pet-room__backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.pet-room__inner {
  position: relative;
  z-index: 1;
  display: grid;
  gap: var(--ds-space-md);
  width: min(100%, 44rem);
  margin: 0 auto;
  padding: var(--ds-space-lg);
  padding-bottom: calc(6.5rem + env(safe-area-inset-bottom, 0px));
}

/* ── 背景：光束 ─────────────────────────────────────────────── */
.pet-room__beam {
  position: absolute;
  top: -18%;
  width: 13rem;
  height: 82%;
  background: linear-gradient(180deg, rgb(196 244 255 / 18%), rgb(196 244 255 / 0%) 76%);
  filter: blur(7px);
  opacity: 0.6;
  animation: pet-room-beam 9s ease-in-out infinite alternate;
}
.pet-room__beam--left {
  left: -5rem;
  transform: rotate(15deg);
}
.pet-room__beam--right {
  right: -6rem;
  transform: rotate(-17deg);
  animation-delay: -4s;
}

/* ── 背景：底部光晕与沙地 ───────────────────────────────────── */
.pet-room__glow {
  position: absolute;
  left: 50%;
  top: 46%;
  width: min(94vw, 30rem);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgb(126 226 255 / 22%), rgb(126 226 255 / 0%) 66%);
  filter: blur(8px);
  animation: pet-room-glow 7s ease-in-out infinite;
}

.pet-room__sand {
  position: absolute;
  left: -12%;
  right: -12%;
  bottom: -2.5rem;
  height: 11rem;
  border-radius: 50% 50% 0 0 / 42% 42% 0 0;
  background:
    radial-gradient(ellipse at 50% 100%, rgb(126 196 226 / 30%), transparent 68%),
    linear-gradient(180deg, rgb(9 34 58 / 10%), rgb(3 12 24 / 92%));
  box-shadow: 0 -10px 40px rgb(120 210 255 / 12%);
}

/* ── 背景：气泡粒子 ─────────────────────────────────────────── */
.pet-room__bubble {
  position: absolute;
  bottom: -2rem;
  border: 1px solid rgb(214 247 255 / 48%);
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgb(255 255 255 / 52%), rgb(150 230 255 / 6%));
  opacity: 0;
  animation: pet-room-rise linear infinite;
}

/* ── 背景：装饰（巢 / 灯 / 珊瑚） ───────────────────────────── */
.pet-room__decor {
  position: absolute;
  pointer-events: none;
}

.pet-room__decor--nest {
  left: 50%;
  bottom: -1rem;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  width: min(94vw, 34rem);
  height: 12rem;
  padding: 0 6%;
  transform: translateX(-50%);
}
.pet-room__decor--nest i {
  display: block;
  width: 1.3rem;
  height: 9rem;
  border-radius: 60% 60% 0 0;
  background: linear-gradient(180deg, rgb(84 214 187 / 55%), rgb(14 74 64 / 12%));
  transform-origin: 50% 100%;
  animation: pet-room-sway 5.5s ease-in-out infinite alternate;
}
.pet-room__decor--nest i:nth-child(2) {
  height: 11rem;
  animation-delay: -1.6s;
}
.pet-room__decor--nest i:nth-child(3) {
  height: 7.5rem;
  animation-delay: -3s;
}

.pet-room__decor--lamp {
  top: 0;
  right: 9%;
  width: 2px;
  height: 7.5rem;
  background: linear-gradient(180deg, rgb(255 214 140 / 4%), rgb(255 214 140 / 55%));
}
.pet-room__decor--lamp::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 5.5rem;
  height: 5.5rem;
  transform: translate(-50%, -28%);
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 35%,
    rgb(255 238 190 / 92%),
    rgb(255 196 110 / 42%) 46%,
    transparent 72%
  );
  box-shadow: 0 0 60px 20px rgb(255 196 110 / 16%);
  animation: pet-room-lamp 5s ease-in-out infinite;
}

.pet-room__decor--coral {
  left: 50%;
  bottom: -1.5rem;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  width: min(96vw, 36rem);
  height: 11rem;
  padding: 0 3%;
  transform: translateX(-50%);
}
.pet-room__decor--coral i {
  display: block;
  width: 2.1rem;
  height: 8rem;
  border-radius: 50% 50% 32% 32%;
  background: linear-gradient(180deg, rgb(255 138 170 / 52%), rgb(122 59 82 / 8%));
}
.pet-room__decor--coral i:nth-child(2) {
  height: 9.5rem;
  width: 2.6rem;
}

/* ── 加载 / 错误 / 无档案 ───────────────────────────────────── */
.pet-room__notice {
  display: grid;
  justify-items: center;
  gap: var(--ds-space-md);
  width: min(100%, 24rem);
  margin: 16vh auto 0;
  padding: var(--ds-space-xl);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-glass-surface);
  box-shadow: var(--ds-shadow-card);
  color: var(--ds-text-secondary);
  text-align: center;
}
.pet-room__notice p {
  margin: 0;
}

.pet-room__loader {
  width: 1.75rem;
  height: 1.75rem;
  border: 2px solid rgb(155 232 255 / 25%);
  border-top-color: var(--ds-glow-primary);
  border-radius: 50%;
  animation: pet-room-spin 1s linear infinite;
}

.pet-room__retry {
  min-height: 2.75rem;
  padding: 0 var(--ds-space-lg);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-pill);
  background: var(--ds-glass-surface);
  color: var(--ds-text-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

/* ── 顶部 HUD ───────────────────────────────────────────────── */
.pet-room__hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: rgb(7 22 42 / 72%);
  box-shadow: var(--ds-shadow-card);
  backdrop-filter: blur(10px);
}

.pet-room__identity {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.pet-room__eyebrow {
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
  letter-spacing: 0.08em;
}

.pet-room__title {
  overflow: hidden;
  color: var(--ds-text-primary);
  font-size: var(--ds-font-size-title);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-room__wallet {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ds-space-sm);
}

.pet-room__pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 2rem;
  padding: 0 0.7rem;
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-pill);
  background: rgb(10 32 56 / 82%);
  font-size: var(--ds-font-size-caption);
  font-weight: 700;
  white-space: nowrap;
}
.pet-room__pill--level {
  color: var(--ds-glow-primary);
}
.pet-room__pill--points {
  border-color: rgb(255 196 110 / 42%);
  color: var(--ds-accent-text);
}
.pet-room__pill-icon {
  font-size: 0.9em;
}

/* ── 状态条 ─────────────────────────────────────────────────── */
.pet-room__status {
  display: grid;
  gap: 0.55rem;
  padding: var(--ds-space-md) var(--ds-space-lg);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: rgb(7 22 42 / 72%);
  box-shadow: var(--ds-shadow-card);
  backdrop-filter: blur(10px);
}

.pet-room__bar-row {
  display: grid;
  grid-template-columns: 2.4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ds-space-sm);
}

.pet-room__bar-label {
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  font-weight: 700;
}

.status-bar {
  position: relative;
  height: 0.5rem;
  overflow: hidden;
  border-radius: var(--ds-radius-pill);
  background: rgb(3 14 28 / 78%);
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 55%);
}

.status-bar__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width var(--ds-motion-base) ease-out;
}
.status-bar--good .status-bar__fill {
  background: linear-gradient(90deg, #63e6b0, #9be8ff);
}
.status-bar--mid .status-bar__fill {
  background: linear-gradient(90deg, #ffd166, #ffb347);
}
.status-bar--low .status-bar__fill {
  background: linear-gradient(90deg, #ff8a80, #ff5d73);
}

.pet-room__bar-value {
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pet-room__status-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}

.pet-room__xp {
  color: var(--ds-glow-primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.pet-room__status-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 宠物舞台 ───────────────────────────────────────────────── */
.pet-room__stage {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  padding-block: var(--ds-space-sm);
}

.pet-room__stage::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(88vw, 26rem);
  aspect-ratio: 1;
  transform: translate(-50%, -52%);
  border-radius: 50%;
  background: radial-gradient(circle, rgb(126 226 255 / 12%), transparent 68%);
  pointer-events: none;
}

.pet-room__pet {
  position: relative;
  display: grid;
  place-items: center;
}

.pet-room__nameplate {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ds-space-sm);
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-pill);
  background: rgb(6 20 38 / 78%);
  box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
  backdrop-filter: blur(8px);
}

.pet-room__nameplate-name {
  color: var(--ds-text-primary);
  font-weight: 700;
}

.pet-room__nameplate-meta {
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
}

.pet-room__hatch {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.25rem 0 0;
  padding: 0.5rem 1rem;
  border: 1px dashed rgb(155 232 255 / 50%);
  border-radius: var(--ds-radius-pill);
  background: rgb(10 34 58 / 68%);
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  animation: pet-room-pulse 3.2s ease-in-out infinite;
}

/* ── 今日探险卡 ─────────────────────────────────────────────── */
.pet-room__quest {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  width: 100%;
  min-height: 4.75rem;
  padding: var(--ds-space-md) var(--ds-space-lg);
  overflow: hidden;
  border: 1px solid rgb(255 200 120 / 55%);
  border-radius: var(--ds-radius-lg);
  background:
    radial-gradient(120% 140% at 100% 0%, rgb(255 196 110 / 32%), transparent 56%),
    linear-gradient(120deg, rgb(19 64 92 / 95%), rgb(10 30 55 / 95%));
  box-shadow:
    0 10px 30px rgb(0 0 0 / 35%),
    inset 0 0 0 1px rgb(255 255 255 / 6%);
  color: var(--ds-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform var(--ds-motion-fast) ease-out, box-shadow var(--ds-motion-fast) ease-out;
}
.pet-room__quest::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 30%,
    rgb(255 255 255 / 14%) 50%,
    transparent 70%
  );
  transform: translateX(-120%);
  animation: pet-room-shimmer 5.5s ease-in-out infinite;
}
.pet-room__quest:active {
  transform: scale(0.985);
}
.pet-room__quest:focus-visible,
.pet-room__shop:focus-visible,
.pet-action:focus-visible,
.pet-room__retry:focus-visible,
.pet-room__link:focus-visible {
  outline: 3px solid var(--ds-glow-primary);
  outline-offset: 3px;
}

.pet-room__quest-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--ds-radius-md);
  background: rgb(255 196 110 / 16%);
  font-size: 1.5rem;
}

.pet-room__quest-text {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.pet-room__quest-text strong {
  font-size: var(--ds-font-size-title);
  line-height: 1.2;
}
.pet-room__quest-text small {
  overflow: hidden;
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-room__quest-arrow {
  margin-left: auto;
  color: var(--ds-accent-text);
  font-size: 1.4rem;
  line-height: 1;
}

/* ── 动作区 ─────────────────────────────────────────────────── */
.pet-room__actions {
  display: grid;
  gap: var(--ds-space-md);
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: rgb(7 22 42 / 72%);
  box-shadow: var(--ds-shadow-card);
  backdrop-filter: blur(10px);
}

.pet-room__group {
  display: grid;
  gap: 0.45rem;
}

.pet-room__group--touch {
  padding-top: var(--ds-space-sm);
  border-top: 1px solid rgb(140 200 255 / 12%);
}

.pet-room__group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-font-size-caption);
  font-weight: 700;
  letter-spacing: 0.06em;
}

.pet-room__cap {
  color: var(--ds-text-muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: 0;
}

.pet-room__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pet-action {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.75rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-pill);
  background: linear-gradient(160deg, rgb(32 83 120 / 92%), rgb(11 34 60 / 94%));
  box-shadow: 0 3px 10px rgb(0 0 0 / 28%);
  color: var(--ds-text-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform var(--ds-motion-fast) ease-out, box-shadow var(--ds-motion-fast) ease-out;
}
.pet-action:active:not(:disabled) {
  transform: translateY(1px) scale(0.96);
  box-shadow: 0 1px 4px rgb(0 0 0 / 30%);
}
.pet-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pet-action--touch {
  justify-content: center;
  width: 100%;
  border-color: rgb(155 232 255 / 40%);
  background: linear-gradient(150deg, rgb(24 92 118 / 92%), rgb(10 42 66 / 94%));
}

.pet-action__icon {
  font-size: 1.15rem;
  line-height: 1;
}

.pet-action__label {
  white-space: nowrap;
}

.pet-action__count {
  padding: 0.05rem 0.4rem;
  border-radius: var(--ds-radius-pill);
  background: rgb(3 14 28 / 60%);
  color: var(--ds-text-secondary);
  font-size: 0.78em;
  font-variant-numeric: tabular-nums;
}

.pet-room__empty {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-font-size-caption);
  line-height: 1.5;
}

.pet-room__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-glow-primary);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.pet-room__cap-hint {
  margin: 0;
  color: var(--ds-accent-text);
  font-size: var(--ds-font-size-caption);
}

.pet-room__error {
  margin: 0;
  padding: 0.55rem 0.9rem;
  border: 1px solid rgb(255 138 128 / 45%);
  border-radius: var(--ds-radius-md);
  background: rgb(90 24 32 / 55%);
  color: #ffd9d6;
  font-size: var(--ds-font-size-caption);
}

.pet-room__shop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.9rem;
  border: 1px solid rgb(255 196 110 / 45%);
  border-radius: var(--ds-radius-pill);
  background: linear-gradient(135deg, rgb(255 179 71 / 18%), rgb(255 138 61 / 10%));
  color: var(--ds-accent-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform var(--ds-motion-fast) ease-out;
}
.pet-room__shop:active {
  transform: scale(0.97);
}

/* ── 动效 ───────────────────────────────────────────────────── */
@keyframes pet-room-beam {
  from {
    opacity: 0.38;
  }
  to {
    opacity: 0.82;
  }
}

@keyframes pet-room-glow {
  0%,
  100% {
    opacity: 0.75;
    transform: translate(-50%, -50%) scale(0.97);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.03);
  }
}

@keyframes pet-room-rise {
  0% {
    transform: translateY(0) scale(0.8);
    opacity: 0;
  }
  12% {
    opacity: 0.55;
  }
  70% {
    opacity: 0.28;
  }
  100% {
    transform: translateY(-85vh) scale(1.05);
    opacity: 0;
  }
}

@keyframes pet-room-sway {
  from {
    transform: rotate(-4deg);
  }
  to {
    transform: rotate(5deg);
  }
}

@keyframes pet-room-lamp {
  0%,
  100% {
    opacity: 0.75;
    transform: translate(-50%, -28%) scale(0.96);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -28%) scale(1.04);
  }
}

@keyframes pet-room-pulse {
  0%,
  100% {
    border-color: rgb(155 232 255 / 30%);
  }
  50% {
    border-color: rgb(155 232 255 / 65%);
  }
}

@keyframes pet-room-shimmer {
  0%,
  55% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(120%);
  }
}

@keyframes pet-room-spin {
  to {
    transform: rotate(360deg);
  }
}

/*
 * 减弱动效：光束、气泡、光晕、装饰、闪光与进度条过渡全部停下。
 * 宠物自身的动效由 `PetAvatar` 内的同一媒体查询负责。
 */
@media (prefers-reduced-motion: reduce) {
  .pet-room,
  .pet-room * {
    animation: none !important;
    transition: none !important;
  }
}

/* 窄屏下让「饥饿值 30/100」不至于把状态条挤没 */
@media (max-width: 22rem) {
  .pet-room__bar-row {
    grid-template-columns: 2.1rem minmax(0, 1fr);
  }
  .pet-room__bar-value {
    grid-column: 2;
    justify-self: end;
  }
}

.pet-room__nav { display: flex; gap: var(--ds-space-sm); justify-content: center; }
.pet-room__nav button { padding: 0.3rem 0.8rem; border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-pill); background: rgb(8 30 52 / 60%); color: var(--ds-text-secondary); font: inherit; font-size: 0.8rem; }
</style>
