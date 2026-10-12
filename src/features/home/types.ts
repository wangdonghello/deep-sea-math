/**
 * `features/home/` 的类型与窄接口。
 *
 * 与 `profileSelect/types.ts` 同一立场：这里只放**首页所需的契约**，不放任何
 * 业务规则。`HomeStore` 是首页与存储之间的窄接口——首页只做三件事：读设置、
 * 读事件、写事件。组题、投影、奖励判定全部在 `domain/`（Task 4 / Task 6 /
 * Task 7），composable 只负责"什么时候调用、调用后怎么反应"。
 */

import type { DomainEvent, Question, Settings } from '@/domain/model/types'

/** 当前档案的只读快照（来自 T11 的 `profileSessionStore`）。 */
export interface HomeProfile {
  profileId: string
  nickname: string
  avatarId: string
}

/**
 * 首页所需的全部数据能力 —— 与存储层之间的窄接口。
 *
 * 之所以是窄接口而不是直接依赖 T9 的 `StorageFacade`：首页一旦直接依赖门面，
 * 组件测试就得先准备一个 IndexedDB（或 fake-indexeddb）才能挂载，而首页要测的
 * 是"任务卡怎么展示"，与存储介质无关。生产装配由 `homeStore.ts` 把 T9 的门面
 * 适配进来，测试则注入内存态 fake（见 `tests/features/home/HomeView.test.ts`）。
 */
export interface HomeStore {
  /** 读家长设置；决定题量与预计用时。 */
  readSettings(profileId: string): Promise<Settings>
  /** 读该档案的全量事件（重放投影的唯一输入）。 */
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
  /**
   * 幂等追加事件；返回合并后的全量事件。
   *
   * @param events 待写入事件（只读），必须同属一个档案。
   */
  appendEvents(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

/**
 * 任务卡的展示状态（纯展示枚举，不含判断规则）。
 *
 * 判定在 composable 里完成（`useHomeQuest`），组件只按状态渲染对应文案——
 * 这样"什么算有题组"只有一个真相来源，卡片永远不需要自己读事件。
 */
export type QuestCardState =
  /** 无当日题组：展示「领取今日任务」 */
  | 'empty'
  /** 有未完成题组：展示进度与「开始下潜」 */
  | 'active'
  /** 当日题组已完成：只展示成果，不给重复入口 */
  | 'done'

/** 「领取今日任务」的可选注入（测试用它固定时钟与 ID）。 */
export interface HomeQuestOptions {
  /** 数据能力窄接口。 */
  store: HomeStore
  /** 时钟（Unix 毫秒）；决定"今天"是哪一天。缺省 `Date.now`。 */
  clock?: () => number
  /** ID 发生器；产出 `session.id` 与事件 ID。缺省 Web Crypto UUID。 */
  idGenerator?: () => string
  /**
   * 候选题目池（**必填**）。
   *
   * 刻意没有缺省值：早先缺省到一份演示 fixture 时，首页用它组出的题组在答题页
   * （按正式题库查题）里一道都查不到，守卫把 `/quest` 打回首页，表现为“点开始
   * 下潜没有任何反应”。让调用方必须显式给池后，这类接线错误在编译期就暴露，
   * 而不是变成一次静默的、看不出原因的跳转失败。
   */
  pool: readonly Question[]
  /**
   * 日志出口；发出的对象先经 `redact()` 脱敏。
   *
   * 与 `profileSelect` 同一立场：首页不直接 `console.*`。失败原因属于诊断信息，
   * 从日志出口出去必须脱敏；UI 只显示中性文案（`errorMessage`）。
   */
  logger?: (entry: Record<string, unknown>) => void
}
