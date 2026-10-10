import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomeView from '@/views/HomeView.vue'
import type { HomeStore } from '@/features/home/types'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import type { AnswerSubmittedEvent, DomainEvent, SessionStartedEvent } from '@/domain/model/types'

/**
 * `views/HomeView` 的行为契约（design §4：地图主体 + 任务卡浮层，方案 A）。
 *
 * 锁四组事：
 * 1. 首页由 `MapPanel`（主体）+ `QuestCard`（浮层）两块拼成，且 `FishBackdrop`
 *    出现在首页——设计稿 A「上半屏地图、下半屏任务卡、背景有鱼」的最小落地形态；
 * 2. 任务卡的两种状态由**事件投影**驱动，而不是组件自己猜：有当日未完成题组
 *    时展示进度 `N / 9` 与「开始下潜」；没有题组时展示「领取今日任务」；
 * 3. 「领取今日任务」真的会写 `session-started` 事件（组题走 Task 4 的
 *    `buildDailyQuest`，不是组件里编 9 个空槽）；
 * 4. 首页只读本地存储（IndexedDB / 内存态），**不发起任何网络请求**
 *    （spec §离线优先：题组与投影都来自本地事件日志）。
 *
 * 事件流的构造方式与 `ProfileSelectView.test.ts` 一致：用 `vi` 造确定性时钟，
 * 事件用字面量手写（不经过仓储），使断言不必依赖 fake-indexeddb。
 */

/** 固定「现在」：UTC 2026-10-10 02:00，与当日题组事件的日期键对齐。 */
const NOW = Date.UTC(2026, 9, 10, 2, 0, 0)

const PROFILE_ID = 'p-home'

/** 默认 9 题（5 基础 / 3 应用 / 1 探测），进度断言的分母。 */
const QUESTION_IDS = Array.from({ length: 9 }, (_, index) => `q-${index + 1}`)

/** 造一条 `session-started` 事件（当日题组的起点）。 */
function sessionStarted(sessionId: string, occurredAt: number = NOW): SessionStartedEvent {
  return {
    eventId: `ev-start-${sessionId}`,
    profileId: PROFILE_ID,
    occurredAt,
    type: 'session-started',
    sessionId,
    questionIds: [...QUESTION_IDS],
    difficultyTrace: [1, 1, 1],
  }
}

/** 造一条答对事件（用于推进 `questProgress.answeredQuestionIds`）。 */
function answerSubmitted(sessionId: string, questionId: string, index: number): AnswerSubmittedEvent {
  return {
    eventId: `ev-${sessionId}-${questionId}`,
    profileId: PROFILE_ID,
    occurredAt: NOW + index * 1000,
    type: 'answer-submitted',
    sessionId,
    questionId,
    submitted: '6',
    correct: true,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 1200,
  }
}

/** 记录写入的假存储：只留首页真正用到的三个能力（窄接口，见 `types.ts`）。 */
function createStore(seed: readonly DomainEvent[] = []): HomeStore & { appended: DomainEvent[] } {
  const log = [...seed]
  return {
    appended: log,
    async readSettings() {
      return { basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 }
    },
    async listEvents() {
      return [...log]
    },
    async appendEvents(events) {
      log.push(...events)
      return [...log]
    },
  }
}

/**
 * 挂载首页并等 `onMounted` 里的加载落地。
 *
 * 每次都新建 Pinia 并写入会话态：首页的「当前档案」来自 T11 的
 * `profileSessionStore`，没有它首页既不知道给谁组题，也不该发起任何读取。
 */
async function mountHome(options: {
  store?: HomeStore
  now?: number
  withSession?: boolean
  logger?: (entry: Record<string, unknown>) => void
}): Promise<VueWrapper> {
  setActivePinia(createPinia())
  if (options.withSession !== false) {
    useProfileSessionStore().setActive({
      profileId: PROFILE_ID,
      nickname: '小深',
      avatarId: 'angler',
    })
  }
  const view = mount(HomeView, {
    props: {
      store: options.store ?? createStore(),
      clock: () => options.now ?? NOW,
      idGenerator: makeIdGenerator(),
      logger: options.logger,
    },
  })
  await flushPromises()
  return view
}

/** 确定性 ID 发生器：测试里断言「写入的事件」不必猜 UUID。 */
function makeIdGenerator(prefix = 'id'): () => string {
  let counter = 0
  return () => `${prefix}-${(counter += 1)}`
}

describe('views: HomeView', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('渲染 MapPanel 与 QuestCard，且 FishBackdrop 出现在首页', async () => {
    const view = await mountHome({})

    // 地图主体与任务卡浮层两块都在（design §4 HomeView 的职责）
    expect(view.find('[data-testid="map-panel"]').exists()).toBe(true)
    expect(view.find('[data-testid="quest-card"]').exists()).toBe(true)
    // 设计稿 A 的鱼群背景：Task 10 的组件原样出现在首页
    expect(view.find('[data-testid="fish-backdrop"]').exists()).toBe(true)
    // 鱼群条数有界：首页不放大数量（RETRO R7：count 无上限，调用方负责约束）
    expect(view.findAll('[data-testid="fish-backdrop"] svg').length).toBeLessThanOrEqual(12)
  })

  it('无当日题组时展示「领取今日任务」', async () => {
    const view = await mountHome({ store: createStore([]) })

    const card = view.find('[data-testid="quest-card"]')
    expect(card.text()).toContain('领取今日任务')
    // 没有题组就没有进度可言：进度行与「开始下潜」都不出现
    expect(card.find('[data-testid="quest-progress"]').exists()).toBe(false)
    expect(view.find('[data-testid="quest-start"]').exists()).toBe(false)
  })

  it('有未完成题组时展示进度"N / 9"与「开始下潜」按钮', async () => {
    const store = createStore([
      sessionStarted('s-1'),
      answerSubmitted('s-1', 'q-1', 0),
      answerSubmitted('s-1', 'q-2', 1),
      answerSubmitted('s-1', 'q-3', 2),
    ])
    const view = await mountHome({ store })

    expect(view.find('[data-testid="quest-progress"]').text()).toBe('3 / 9')
    // 「领取今日任务」让位给「开始下潜」：题组已存在，重复领取会重抽题
    expect(view.text()).not.toContain('领取今日任务')
    expect(view.find('[data-testid="quest-start"]').exists()).toBe(true)
  })

  it('点「开始下潜」会抛出当前题组的 sessionId（由路由层决定跳转）', async () => {
    const store = createStore([sessionStarted('s-live')])
    const view = await mountHome({ store })

    await view.get('[data-testid="quest-start"]').trigger('click')

    // 组件不自己导航（Task 17 的路由表还没建）：只上报"下潜哪一组"
    expect(view.emitted('start')).toEqual([['s-live']])
  })

  it('点「领取今日任务」经 buildDailyQuest 写入 session-started，随后变为可下潜状态', async () => {
    const store = createStore([])
    const view = await mountHome({ store })

    await view.get('[data-testid="quest-claim"]').trigger('click')
    await flushPromises()

    // 真的落了事件，而不是只在内存里摆 9 个空槽
    const started = store.appended.filter((event) => event.type === 'session-started')
    expect(started).toHaveLength(1)
    expect(started[0]).toMatchObject({
      profileId: PROFILE_ID,
      type: 'session-started',
    })
    // 5 基础 / 3 应用 / 1 探测：题组长度由家长设置决定，默认 9
    expect((started[0] as SessionStartedEvent).questionIds).toHaveLength(9)

    // 领取后即获得当日题组：进度 0 / 9 + 「开始下潜」
    expect(view.find('[data-testid="quest-progress"]').text()).toBe('0 / 9')
    expect(view.find('[data-testid="quest-start"]').exists()).toBe(true)
    expect(view.find('[data-testid="quest-claim"]').exists()).toBe(false)
  })

  it('同一天重复进入不再重新抽题（dailyQuestIndex 先到者胜）', async () => {
    const store = createStore([])
    const view = await mountHome({ store })

    await view.get('[data-testid="quest-claim"]').trigger('click')
    await flushPromises()
    const firstSessionId = (store.appended.find((event) => event.type === 'session-started') as SessionStartedEvent)
      .sessionId

    // 重新挂载（等价比刷新页面）：仍展示同一组题，不再写新事件
    const reloaded = await mountHome({ store })
    await reloaded.get('[data-testid="quest-start"]').trigger('click')

    expect(store.appended.filter((event) => event.type === 'session-started')).toHaveLength(1)
    expect(reloaded.emitted('start')).toEqual([[firstSessionId]])
  })

  it('题组数据来自本地存储：首页不发起任何网络请求', async () => {
    const store = createStore([sessionStarted('s-net')])
    const view = await mountHome({ store })

    await view.get('[data-testid="quest-start"]').trigger('click')
    await flushPromises()

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(store.appended.filter((event) => event.type === 'session-started')).toHaveLength(1)
    expect(view.text()).toContain('暮光区')
  })

  it('没有会话态时不组题、不读存储，只提示先选档案', async () => {
    const store = createStore([])
    const view = await mountHome({ store, withSession: false })

    expect(view.find('[data-testid="quest-claim"]').exists()).toBe(false)
    expect(view.text()).toContain('选择档案')
    // 未登录态连存储都不该碰：没有当前档案就没有"给谁读"的答案
    expect(store.appended).toEqual([])
  })

  it('渲染深度刻度：潜水艇基地起点与四区深度范围', async () => {
    const view = await mountHome({})

    const scale = view.find('[data-testid="depth-scale"]')
    expect(scale.exists()).toBe(true)
    // 起点 + 四区：spec §深海地图与深度进度 的 frozen 配置
    expect(view.find('[data-testid="zone-base"]').exists()).toBe(true)
    for (const zoneId of ['twilight', 'midnight', 'abyss', 'hadal']) {
      expect(view.find(`[data-testid="zone-${zoneId}"]`).exists()).toBe(true)
    }
    // 深度范围用区间表述， MUST NOT 写成唯一定点深度（spec §深度为范围而非定点）
    expect(view.text()).toContain('约 200–1,000 米')
    expect(view.text()).toContain('约 6,000 米以下')
  })

  it('底部 TabBar 常驻，首页不自行跳转（Task 17 才挂路由）', async () => {
    const view = await mountHome({})

    expect(view.find('[data-testid="tab-bar"]').exists()).toBe(true)
    expect(view.find('[data-testid="tab-home"]').exists()).toBe(true)
    expect(view.emitted('navigate')).toBeUndefined()
  })

  it('存储读取失败时只给中性文案，不泄露错因', async () => {
    const calls: Record<string, unknown>[] = []
    const store: HomeStore = {
      async readSettings() {
        throw new Error('indexeddb 打开失败 /Users/wangdong/secret-db')
      },
      async listEvents() {
        throw new Error('unreachable')
      },
      async appendEvents() {
        throw new Error('unreachable')
      },
    }
    const view = await mountHome({ store, logger: (entry) => calls.push(entry) })

    const error = view.find('[data-testid="home-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('今日任务打不开，请稍后再试')
    // 错因（含本机路径）绝不上屏；它只经脱敏日志出去
    expect(view.text()).not.toContain('indexeddb')
    expect(view.text()).not.toContain('secret-db')
    // 失败态不假装"今天没题"：没有领取按钮
    expect(view.find('[data-testid="quest-claim"]').exists()).toBe(false)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0].event).toBe('home-load-failed')
  })

  it('当日题组已完成时不给「开始下潜」，只展示成果', async () => {
    const store = createStore([
      sessionStarted('s-done'),
      ...QUESTION_IDS.map((questionId, index) => answerSubmitted('s-done', questionId, index)),
      {
        eventId: 'ev-done',
        profileId: PROFILE_ID,
        occurredAt: NOW + 10_000,
        type: 'session-completed',
        sessionId: 's-done',
        rewards: ['quest-complete'],
      },
    ])
    const view = await mountHome({ store })

    expect(view.find('[data-testid="quest-progress"]').text()).toBe('9 / 9')
    expect(view.find('[data-testid="quest-done"]').exists()).toBe(true)
    expect(view.find('[data-testid="quest-start"]').exists()).toBe(false)
    expect(view.find('[data-testid="quest-claim"]').exists()).toBe(false)
    expect(view.emitted('start')).toBeUndefined()
  })

})

