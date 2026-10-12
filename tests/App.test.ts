import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '@/App.vue'
import router from '@/router/index.ts'
import { initProductionStores } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { useParentSessionStore } from '@/features/parentPanel/parentSessionStore'
import { QUESTION_BANK } from '@/data/content'
import type { DomainEvent, Profile } from '@/domain/model/types'
import { deleteDatabase, installFakeIndexedDb } from './data/fakeIndexedDb'

/**
 * `tests/App.test.ts` —— 整体装配的行为契约（Task 17 的验收面）。
 *
 * 这一层测的不是某个组件，而是"散装页面接成可玩应用"之后**真的能走通**：
 * 首开落在哪、每条路由可不可达、做完一组题会不会弹解锁反馈、系统要求减弱
 * 动效时鱼群静不静止。因此这里用**真的 router + 真的 Pinia + 真的
 * fake-indexeddb**，与生产 `main.ts` 的装配逐项一致——用 stub 换掉任何一块，
 * "可达"就只是"我以为可达"。
 *
 * 与组件测试的分工：`tests/features/**` 锁单个视图的行为（注入内存态 fake），
 * 本文件锁**接线**（存储单例、路由表、守卫、emit 落点）。
 */

/** 本文件的档案 id（每个用例独立，避免事件互相污染）。 */
const PROFILE_ID = 'profile-app'

/** 当日题组 id。 */
const SESSION_ID = 'session-app'

/** 固定题组：取题库前 3 题（足够走完"完成 → 发奖"的最小闭环）。 */
const QUESTION_IDS = QUESTION_BANK.questions.slice(0, 3).map((question) => question.id)

/** 已解锁的生物 id（图鉴库第一条）。 */
const CREATURE_ID = 'johnson-anglerfish'

/** 还原 fake-indexeddb 注入；`beforeEach` 里赋值。 */
let restoreIndexedDb: (() => void) | null = null

/** 是否已删过一次库：连接一旦被生产单例持有，删库会被 blocked 永久挂住。 */
let databaseCleared = false

/** 挂载中的应用实例；`afterEach` 卸载。 */
let app: VueWrapper | null = null

/** 让 `window.matchMedia` 可预测：jsdom 里它默认总是 `matches: false`。 */
function stubMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

/** 造一个档案（家长区同款字段；PIN 只以哈希形态存在）。 */
function makeProfile(): Profile {
  return {
    id: PROFILE_ID,
    nickname: '小深',
    avatarId: 'submarine',
    pinHash: 'c'.repeat(64),
    salt: 'd'.repeat(16),
    createdAt: Date.now(),
  }
}

/** 造一条 `session-started` 事件（当日题组）。 */
function sessionStarted(): DomainEvent {
  return sessionStartedFor([...QUESTION_IDS])
}

/** 造一条当日 `session-started` 事件，题序由调用方指定（不重新抽题）。 */
function sessionStartedFor(questionIds: readonly string[]): DomainEvent {
  return {
    eventId: 'ev-start',
    profileId: PROFILE_ID,
    occurredAt: Date.now(),
    type: 'session-started',
    sessionId: SESSION_ID,
    questionIds: [...questionIds],
    difficultyTrace: [1, 1, 1],
  }
}

/** 造一组"全部答对"的事件（整组完成判定只要求每题至少提交过一次）。 */
function answersForAll(): DomainEvent[] {
  return QUESTION_IDS.map((questionId, index) => ({
    eventId: `ev-answer-${questionId}`,
    profileId: PROFILE_ID,
    occurredAt: Date.now() + index + 1,
    type: 'answer-submitted' as const,
    sessionId: SESSION_ID,
    questionId,
    submitted: '6',
    correct: true,
    usedHintLevel: 0,
    retryCount: 0,
    ms: 1200,
  }))
}

/** 造一组"整组完成 + 解锁图鉴卡"的事件（解锁反馈的触发物）。 */
function completionEvents(): DomainEvent[] {
  return [
    {
      eventId: 'ev-complete',
      profileId: PROFILE_ID,
      occurredAt: Date.now() + 100,
      type: 'session-completed',
      sessionId: SESSION_ID,
      rewards: ['quest-complete', 'independent-mastery'],
    },
    {
      eventId: 'ev-unlock',
      profileId: PROFILE_ID,
      occurredAt: Date.now() + 101,
      type: 'unlock-granted',
      targetId: CREATURE_ID,
      kind: 'creature',
      reason: SESSION_ID,
    },
  ]
}

/** 把档案与事件写进 fake-indexeddb（经生产仓储，不碰内部细节）。 */
async function seed(events: readonly DomainEvent[]): Promise<void> {
  const { storage } = await initProductionStores()
  await storage.profiles.save(makeProfile())
  if (events.length > 0) await storage.events.append(events)
}

/**
 * 清空存储里的全部档案数据（用例之间隔离）。
 *
 * 走 `removeByProfile` 而不是 `deleteDatabase`：生产存储单例在整个测试文件
 * 内持有同一条 IndexedDB 连接，删库会被 `blocked` 永久挂住（见
 * `tests/data/fakeIndexedDb.ts` 的说明）。删档要清的四段数据与家长区
 * （Task 16）删档案的边界一致：事件、设置、图鉴缓存、档案本身。
 */
async function clearStorage(): Promise<void> {
  const { storage } = await initProductionStores()
  for (const profile of await storage.profiles.list()) {
    await storage.events.removeByProfile(profile.id)
    await storage.settings.remove(profile.id)
    await storage.bestiary.clear(profile.id)
    await storage.profiles.remove(profile.id)
  }
  // 家长 PIN 与档案无关，按上面的循环清不掉；不清它会让下一个用例的门禁页
  // 误判成"已设过 PIN"，进而断言到"校验"模式。
  await storage.guard.clear()
}

/** 写入会话态（等价于孩子在档案选择页输对了 PIN）。 */
function signIn(): void {
  useProfileSessionStore().setActive({
    profileId: PROFILE_ID,
    nickname: '小深',
    avatarId: 'submarine',
  })
}

/**
 * 挂载整个应用（Pinia + Router + fake-indexeddb），并等首次导航落地。
 *
 * 每次调用都新建 Pinia 并（按需）写入会话态：会话态是易失态，用例之间共享会
 * 把"未选档案"与"已选档案"两种前提搅在一起。**先建 Pinia 再写入会话**——
 * 顺序反了会被这次新建的 Pinia 清空。
 *
 * @param options.signedIn 是否模拟"已选档案"（输对 PIN 之后的会话态）；
 *   缺省为**未选档案**（首次打开的真实处境）。
 */
async function bootApp(options: { signedIn?: boolean } = {}): Promise<VueWrapper> {
  setActivePinia(createPinia())
  if (options.signedIn === true) signIn()
  const wrapper = mount(App, { global: { plugins: [router] } })
  app = wrapper
  await router.isReady()
  await flushPromises()
  return wrapper
}

/**
 * 等解锁反馈出现（真实轮询走 IndexedDB，是宏任务，`flushPromises` 等不到）。
 *
 * 刻意用真定时器轮询而不是 `flushPromises`：装配层的反馈链路终点是
 * `setInterval` + 一次 IndexedDB 读，测试必须按它真实的节奏等，否则断言会在
 * 反馈出现之前就跑完——那种"绿"是假的。
 *
 * @param timeoutMs 最长等待时间（默认 2000ms，覆盖一个轮询周期 1000ms）。
 */
async function waitForOverlay(timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (app!.find('[data-testid="unlock-overlay"]').exists()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}

/** 等解锁反馈消失。 */
async function waitForOverlayGone(timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!app!.find('[data-testid="unlock-overlay"]').exists()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}

/**
 * 等路由落到指定路径（点按页签触发的导航专用）。
 *
 * 页签的 `router.push` 是 fire-and-forget（见 `routes/HomeRoute.vue`），而守卫
 * 要 await 生产存储的 IndexedDB 连接——那是**宏任务**，`flushPromises` 排不完。
 * 因此这里按真实节奏轮询，断言"真的落了地"，而不是"我以为已经落地"。
 */
async function waitForPath(path: string, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (router.currentRoute.value.path === path) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return false
}

/**
 * 把一条由多次 IndexedDB 读写串成的链路跑完。
 *
 * 为什么不能只 `flushPromises()` 一次：`submitAnswer` 内部是
 * `refreshEvents → append → finishIfComplete → appendMany` 四段，每段都要等
 * 一次 fake-indexeddb 的事务（**宏任务**）。`flushPromises` 只排空微任务队列，
 * 排不完第四段就断言"没发奖"，会得到一个假阴性。
 */
async function settle(rounds = 12): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await flushPromises()
}

beforeEach(async () => {
  restoreIndexedDb = await installFakeIndexedDb()
  // 只在首个用例前删库：此后单例持有连接，删库会被 blocked 挂住（见
  // `clearStorage` 的说明）。
  if (!databaseCleared) {
    await deleteDatabase('deep-sea-math')
    databaseCleared = true
  }
  await clearStorage()
  stubMatchMedia(false)
})

afterEach(async () => {
  app?.unmount()
  app = null
  // 先把在飞的存储操作耗尽，再撤掉 fake-indexeddb 全局：否则挂起的事务会在
  // 全局被删后 abort，冒出一个与断言无关的 Unhandled Rejection。
  await new Promise((resolve) => setTimeout(resolve, 0))
  restoreIndexedDb?.()
  restoreIndexedDb = null
})

describe('App: 整体装配', () => {
  it('首次打开（未选档案）被重定向到档案选择页', async () => {
    await seed([])
    await bootApp()

    // `/` 无条件重定向；守卫再依据"没有会话"把根路径落到档案选择页
    expect(router.currentRoute.value.path).toBe('/profiles')
    expect(app!.find('[data-testid="profile-select"]').exists()).toBe(true)
  })

  it('已选档案后首页可达，且任务卡显示今日进度', async () => {
    await seed([sessionStarted(), ...answersForAll().slice(0, 1)])
    await bootApp({ signedIn: true })
    await router.push('/home')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/home')
    expect(app!.find('[data-testid="home"]').exists()).toBe(true)
    // 进度由事件投影驱动：1/3 已答
    expect(app!.find('[data-testid="quest-progress"]').text()).toBe('1 / 3')
  })

  it('答题页可达，并由守卫装载当日题组', async () => {
    await seed([sessionStarted()])
    await bootApp({ signedIn: true })
    await router.push('/quest')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/quest')
    const view = app!.find('[data-testid="quest-view"]')
    expect(view.exists()).toBe(true)
    // 题组由 `session-started` 固定：题序来自题库而非 demo 池
    expect(app!.text()).toContain(QUESTION_BANK.questions[0].story.title)
  })

  it('没有当日题组时答题页打回首页', async () => {
    await seed([])
    await bootApp({ signedIn: true })
    await router.push('/quest')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/home')
    expect(app!.find('[data-testid="quest-view"]').exists()).toBe(false)
  })

  it('首页常驻导航只含孩子页签：不含家长区，点页签到不了 /parent', async () => {
    await seed([])
    await bootApp({ signedIn: true })
    await router.push('/home')
    await flushPromises()

    // 常驻导航只剩三个孩子页签（家长区不在其中，见 TabBar.test.ts）
    expect(app!.findAll('[data-testid="tab-bar"] .tab-bar__item')).toHaveLength(3)
    expect(app!.find('[data-testid="tab-bar"]').text()).not.toContain('家长区')

    // 逐个点击：落点必须是孩子页面，绝不能是家长区
    for (const [tabId, path] of [
      ['tab-bestiary', '/bestiary'],
      ['tab-mistake', '/mistakes'],
      ['tab-home', '/home'],
    ] as const) {
      // 每次先回首页：TabBar 只在首页常驻（其他页面各有自己的布局）
      await router.push('/home')
      await flushPromises()
      await app!.get(`[data-testid="${tabId}"]`).trigger('click')
      expect(await waitForPath(path)).toBe(true)
      expect(router.currentRoute.value.path).not.toBe('/parent')
    }
  })

  it('图鉴、错题本、家长区门禁页、地图均可达', async () => {
    await seed([])
    await bootApp({ signedIn: true })

    for (const [path, testid] of [
      ['/bestiary', 'bestiary-view'],
      ['/mistakes', 'mistake-book'],
      // P1 起 `/parent` 是门禁页（不是旧的一体化家长页）
      ['/parent', 'parent-gate'],
      ['/map', 'map-view'],
    ] as const) {
      await router.push(path)
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(path)
      expect(app!.find(`[data-testid="${testid}"]`).exists()).toBe(true)
    }
  })

  it('观察舱只接受已解锁生物：未解锁打回图鉴且不泄露名称', async () => {
    await seed([])
    await bootApp({ signedIn: true })
    await router.push(`/observation/${CREATURE_ID}`)
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/bestiary')
    // 名称/学名 MUST NOT 出现在任何地方（守卫在渲染前就拦下了）
    expect(app!.text()).not.toContain('约翰逊鮟鱇鱼')
    expect(app!.text()).not.toContain('Melanocetus')
    expect(app!.find('[data-testid="observation-view"]').exists()).toBe(false)
  })

  it('观察舱可达已解锁生物并展示知识卡', async () => {
    await seed([
      sessionStarted(),
      ...answersForAll(),
      ...completionEvents(),
    ])
    await bootApp({ signedIn: true })
    await router.push(`/observation/${CREATURE_ID}`)
    await flushPromises()

    expect(router.currentRoute.value.path).toBe(`/observation/${CREATURE_ID}`)
    const view = app!.find('[data-testid="observation-view"]')
    expect(view.exists()).toBe(true)
    expect(view.text()).toContain('约翰逊鮟鱇鱼')
  })

  it('整组完成后 UnlockOverlay 出现并展示奖励名', async () => {
    await seed([sessionStarted(), ...answersForAll()])
    await bootApp({ signedIn: true })
    // 挂载时还没有完成事件：首轮 check 只建基线，不弹历史反馈
    await router.push('/home')
    await flushPromises()
    expect(app!.find('[data-testid="unlock-overlay"]').exists()).toBe(false)

    // 落库一次"整组完成"（等价于孩子在答题页提交了最后一题）
    const { storage } = await initProductionStores()
    await storage.events.append(completionEvents())
    // 路由变化触发 check；随后由轮询兜底（答题完成往往紧接着一次页面内跳转）
    await router.push('/bestiary')
    expect(await waitForOverlay()).toBe(true)

    const overlay = app!.find('[data-testid="unlock-overlay"]')
    // 奖励名逐条可指认：两枚徽章 + 图鉴卡物种名
    expect(overlay.text()).toContain('整组完成徽章')
    expect(overlay.text()).toContain('独立掌握徽章')
    expect(overlay.text()).toContain('约翰逊鮟鱇鱼')

    // 显式关闭后消失（反馈不是自动消失的装饰）
    await app!.get('[data-testid="unlock-overlay-close"]').trigger('click')
    expect(app!.find('[data-testid="unlock-overlay"]').exists()).toBe(false)
  })

  it('同一完成不会重复弹反馈（幂等基线）', async () => {
    await seed([sessionStarted(), ...answersForAll()])
    await bootApp({ signedIn: true })
    const { storage } = await initProductionStores()
    await storage.events.append(completionEvents())

    await router.push('/bestiary')
    expect(await waitForOverlay()).toBe(true)
    await app!.get('[data-testid="unlock-overlay-close"]').trigger('click')

    // 来回导航：同一次完成不再复播（`seenSessionId` 基线已前移）
    await router.push('/map')
    await flushPromises()
    await router.push('/bestiary')
    await flushPromises()
    expect(await waitForOverlayGone(500)).toBe(true)
  })

  it('错题本点"练这道"带着题号进答题页', async () => {
    await seed([])
    await bootApp({ signedIn: true })
    await router.push('/mistakes')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/mistakes')

    // 带题号的深链：守卫按 practice 装载（不进当日题组）
    const target = QUESTION_BANK.questions[0].id
    await router.push(`/quest?practice=${target}`)
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/quest')
    expect(app!.find('[data-testid="quest-view"]').exists()).toBe(true)
  })

  it('/quest?session=<当日另一组> 打开的就是那一组（参数真正生效，不是摆设）', async () => {
    await seed([
      sessionStarted(),
      // 同日的第二组题：当日题组索引先到者胜，指向第一组
      {
        eventId: 'ev-start-second',
        profileId: PROFILE_ID,
        occurredAt: Date.now() + 1,
        type: 'session-started' as const,
        sessionId: 'session-second',
        questionIds: [QUESTION_IDS[1]],
        difficultyTrace: [1, 1, 1],
      },
    ])
    await bootApp({ signedIn: true })
    await router.push('/quest?session=session-second')
    await flushPromises()

    // 守卫优先采纳 query.session：手里的题是第二组的那一道，而不是当日索引那组
    expect(router.currentRoute.value.path).toBe('/quest')
    expect(app!.find('[data-testid="quest-view"]').exists()).toBe(true)
    expect(app!.text()).toContain(QUESTION_BANK.questions[1].story.title)
    expect(app!.text()).not.toContain(QUESTION_BANK.questions[0].story.title)
  })

  it('/quest?session=<别档/未知 id> 回落当日题组，绝不渲染别档的题', async () => {
    await seed([sessionStarted()])
    // 另一个档案的题组事件：守卫只能按当前档案校验归属
    const { storage } = await initProductionStores()
    await storage.events.append([{
      eventId: 'ev-other-start',
      profileId: 'profile-other',
      occurredAt: Date.now(),
      type: 'session-started',
      sessionId: 'session-other',
      questionIds: [QUESTION_IDS[1]],
      difficultyTrace: [1, 1, 1],
    }])
    await bootApp({ signedIn: true })
    await router.push('/quest?session=session-other')
    await flushPromises()

    // 归属校验不通过：回落当日题组（第一组的第一题），而不是别档的题
    expect(router.currentRoute.value.path).toBe('/quest')
    expect(app!.find('[data-testid="quest-view"]').exists()).toBe(true)
    expect(app!.text()).toContain(QUESTION_BANK.questions[0].story.title)
    expect(app!.text()).not.toContain(QUESTION_BANK.questions[1].story.title)
  })

  it('/quest?practice=<题库里没有的题号> 回落首页，不留死路', async () => {
    await seed([])
    await bootApp({ signedIn: true })
    await router.push('/quest?practice=q-not-in-bank')
    await flushPromises()

    // 没有可练的题：宁可回首页，也不要渲染一个"题库暂时不够"的死胡同
    expect(router.currentRoute.value.path).toBe('/home')
    expect(app!.find('[data-testid="quest-view"]').exists()).toBe(false)
  })

  it('端到端：答题页作答 → 发奖落库 → 解锁反馈 → 观察舱可达', async () => {
    // 当日题组只含 q001（基础题，答案可经数字键盘敲出）：最小可完成的闭环
    await seed([sessionStartedFor(['q001'])])
    await bootApp({ signedIn: true })
    await router.push('/quest')
    await flushPromises()
    expect(app!.find('[data-testid="quest-view"]').exists()).toBe(true)

    // 经真实组件作答：`7 + 5`（判等按 token 归一，空格不影响）
    for (const key of ['7', '+', '5']) {
      await app!.get(`[data-key="${key}"]`).trigger('click')
    }
    await app!.get('[data-testid="action-submit"]').trigger('click')
    await settle()

    // 发奖真的落了库：整组完成徽章 + 图鉴卡 + 区域下潜
    const { storage } = await initProductionStores()
    const events = await storage.events.listByProfile(PROFILE_ID)
    const completed = events.find((event) => event.type === 'session-completed')
    expect(completed).toBeDefined()
    const unlocked = events.filter(
      (event) => event.type === 'unlock-granted' && event.kind === 'creature',
    )
    expect(unlocked.map((event) => (event as { targetId: string }).targetId)).toEqual([CREATURE_ID])

    // 解锁反馈展示奖励名（含物种名，而不是标识）
    expect(await waitForOverlay()).toBe(true)
    const overlay = app!.find('[data-testid="unlock-overlay"]')
    expect(overlay.text()).toContain('整组完成徽章')
    expect(overlay.text()).toContain('约翰逊鮟鱇鱼')
    await app!.get('[data-testid="unlock-overlay-close"]').trigger('click')

    // 刚解锁的生物现在进得去观察舱（守卫放行，而不是打回图鉴）
    await router.push(`/observation/${CREATURE_ID}`)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(`/observation/${CREATURE_ID}`)
    expect(app!.find('[data-testid="observation-view"]').text()).toContain('约翰逊鮟鱇鱼')
  })

  it('首次安装可直接进家长区门禁页（未设过 PIN → 设置模式）', async () => {
    await seed([])
    await bootApp({ signedIn: false })
    expect(router.currentRoute.value.path).toBe('/profiles')

    // 档案选择页有一个不显眼的家长区入口（T16 审查的残余风险：不进孩子常驻导航）
    await app!.get('[data-testid="goto-parent"]').trigger('click')
    // `gate.load()` 要读一次 IndexedDB（宏任务），`flushPromises` 等不到。
    await settle()
    expect(router.currentRoute.value.path).toBe('/parent')
    // 没设过家长 PIN：门禁页进入"设置"模式（而不是把"没设过"当成"密码错了"）
    expect(app!.find('[data-testid="parent-gate"]').exists()).toBe(true)
    expect(app!.find('[data-testid="parent-gate-hint"]').text()).toContain('设置')
    expect(app!.find('[data-testid="pin-input"]').exists()).toBe(true)
  })

  it('未解锁时家长区三个子路径一律打回门禁页', async () => {
    await seed([])
    await bootApp({ signedIn: true })

    for (const path of ['/parent/overview', '/parent/settings', '/parent/manage']) {
      await router.push(path)
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/parent')
      expect(app!.find('[data-testid="parent-gate"]').exists()).toBe(true)
    }
  })

  it('门禁设置 PIN（输两次）通过后落到总览，三个子页占位均可达', async () => {
    await seed([])
    await bootApp({ signedIn: true })

    await router.push('/parent')
    await settle()

    // 首次设置：输 4 位 → 确认 4 位 → 落总览
    const enter = async (digits: string): Promise<void> => {
      for (const digit of digits) {
        await app!.get(`[data-testid="pin-key-${digit}"]`).trigger('click')
      }
      await app!.get('[data-testid="pin-submit"]').trigger('click')
      // 提交要落一次 IndexedDB（salt 哈希 + 写 guard 库），等它真正完成。
      await settle()
    }
    await enter('1234')
    await enter('1234')

    // 放行后的导航由组件内的 `void router.push` 发起：懒加载的路由组件要等一个
    // 宏任务，`flushPromises`/`settle` 都排不完，必须按真实节奏等它落地。
    expect(await waitForPath('/parent/overview')).toBe(true)
    for (const [path, testid] of [
      ['/parent/overview', 'parent-overview'],
      ['/parent/settings', 'parent-settings'],
      ['/parent/manage', 'parent-manage'],
    ] as const) {
      await router.push(path)
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(path)
      expect(app!.find(`[data-testid="${testid}"]`).exists()).toBe(true)
    }
    // 占位页的"返回"回到档案选择页（同样是组件内 push，按真实节奏等）。
    // 本用例是"已登录"状态，守卫规则 3 会把档案选择页再落到首页——这是全站
    // 一致的既有行为（已选档案却停在选档案是死路），不是本页特例。
    await app!.get('[data-testid="parent-back"]').trigger('click')
    expect(await waitForPath('/home')).toBe(true)
  })

  it('家长区解锁态只存在于本次会话（新会话必须重新验证）', async () => {
    await seed([])
    await bootApp({ signedIn: true })

    // 本次会话解锁后子路径可达
    useParentSessionStore().unlock()
    await router.push('/parent/settings')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/parent/settings')

    // 模拟"刷新"：换一份全新 Pinia（会话态是易失态，MUST NOT 跨刷新留存）
    setActivePinia(createPinia())
    await router.push('/parent/manage')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/parent')
    expect(app!.find('[data-testid="parent-gate"]').exists()).toBe(true)
  })

  it('prefers-reduced-motion 下鱼群静止', async () => {
    stubMatchMedia(true)
    await seed([])
    await bootApp({ signedIn: true })
    await router.push('/map')
    await flushPromises()

    const backdrop = app!.find('[data-testid="fish-backdrop"]')
    expect(backdrop.exists()).toBe(true)
    // 组件把"是否允许动画"显式暴露给测试与 CSS
    expect(backdrop.attributes('data-motion')).toBe('reduced')
    expect(app!.findAll('.fish-backdrop__fish--drifting')).toHaveLength(0)
  })
})
