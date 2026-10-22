/**
 * `src/app/productionStores.ts` —— 生产环境的存储装配（Task 17）。
 *
 * 定位：**视图与存储之间唯一的接线点**。`views/*` 全部只依赖 `features/*` 的窄
 * 接口（`ProfileStore` / `HomeStore` / `QuizSessionStore` / `BestiaryStore` /
 * `MistakeBookStore` / `ParentStore`），本模块负责把 Task 9 的
 * {@link StorageFacade} 适配成那些窄接口。适配只发生在这里——视图因此可以在
 * 无 IndexedDB 的测试环境里注入内存态 fake（见各视图测试）。
 *
 * 异步解析的处理方式：`resolveStorage()` 是异步的（要探测 IndexedDB 可用性），
 * 而路由的 `props` 函数是**同步**求值的。因此采用「守卫里 await 初始化 +
 * 模块单例 + 同步取值」：
 * - {@link initProductionStores} 在 `router.beforeEach` 里 await（守卫先于
 *   组件渲染完成，封装组件 setup 时单例必定就绪）；
 * - {@link getProductionStores} 供 `src/router/routes/*` 的封装组件同步读取，
 *   未初始化时**抛错**而不是回退到空实现——空 store 会把故障伪装成"今天没题"，
 *   比崩掉更难排查。
 *
 * 为什么不用 `<Suspense>`：懒加载视图 + 异步 props 会把"存储还没就绪"扩散成
 * 一次全局 loading 态，而首页/图鉴在拿到 store 前本就不该渲染任何数据。
 */

import { resolveStorage, type StorageFacade } from '@/data/db'
import { QUESTION_BANK_BY_GRADE } from '@/data/content'
import type { DomainEvent, QuizType } from '@/domain/model/types'

import { createParentStore } from '@/features/parentPanel/createParentStore'
import { createProfileSelectStore } from '@/features/profileSelect/createProfileSelectStore'
import type { HomeStore } from '@/features/home/types'
import type { MistakeBookStore, MistakeQuestionCatalog, MistakeQuestionMetadata } from '@/features/mistakeBook/types'
import type { ParentGuardStore, ParentStore } from '@/features/parentPanel/types'
import type { ProfileStore } from '@/features/profileSelect/types'
import type { BestiaryStore } from '@/features/bestiary/types'
import type { QuizSessionStore } from '@/features/quizStage/useQuizSession'

/** 各视图所需窄接口的装配结果。 */
export interface ProductionStores {
  /** 存储门面本体（降级标记、关连接等只在这里用一次）。 */
  readonly storage: StorageFacade
  /** 档案选择页（T11）。 */
  readonly profileSelect: ProfileStore
  /** 首页（T12）。 */
  readonly home: HomeStore
  /** 答题页（T13）。 */
  readonly quiz: QuizSessionStore
  /** 图鉴 / 地图（T14）：只需读事件重放解锁投影。 */
  readonly bestiary: BestiaryStore
  /** 错题本（T15）。 */
  readonly mistakes: MistakeBookStore
  /** 错题本展示用的题库元数据目录。 */
  readonly mistakeCatalog: MistakeQuestionCatalog
  /** 家长区（T16）。 */
  readonly parent: ParentStore
  /** 家长区门禁的 PIN 仓储（P1：`/parent` 门禁页用）。 */
  readonly parentGate: ParentGuardStore
}

/**
 * 题库的 `questionId → QuizType` 表（RETRO R19 遗留）。
 *
 * 常量、在 import 时构建一次：题目类型是内容事实，运行期不会变。家长报告的
 * 「题型掌握分布」与错题本的选题型筛选都只有这一份归属口径——两处各建一份
 * 必然漂移（家长看到"应用题 0 人"而错题本里排着三道理应用题）。
 */
export const ALL_QUESTIONS = Object.freeze(
  Object.values(QUESTION_BANK_BY_GRADE).flatMap((bank) => bank.questions),
)

export const QUESTION_TYPE_BY_ID: Readonly<Record<string, QuizType>> = Object.freeze(
  Object.fromEntries(ALL_QUESTIONS.map((question) => [question.id, question.type])),
)

/**
 * 错题本目录：题目 id → 展示元数据。
 *
 * 同样在 import 时构建。缺条目时错题本仍可按题目 id 展示（契约如此），因此
 * 这里不做兜底填充——编一个 `type` 会让筛选器变成一个说谎的分类器。
 */
export const MISTAKE_CATALOG: MistakeQuestionCatalog = Object.freeze(
  Object.fromEntries(
    ALL_QUESTIONS.map(
      (question): [string, MistakeQuestionMetadata] => [
        question.id,
        {
          type: question.type,
          story: { title: question.story.title, body: question.story.body },
          options: question.options,
          answer: question.answer,
          hints: question.hints,
          similarQuestionIds: question.similarQuestionIds,
        },
      ],
    ),
  ),
)

/** 模块单例：初始化后不再重建（重复解析 = 重复打开同一个库）。 */
let stores: ProductionStores | null = null
/** 进行中的初始化；并发调用共享同一个 Promise，避免开两次库。 */
let pending: Promise<ProductionStores> | null = null

/** 把存储门面适配成各视图的窄接口。 */
function assemble(storage: StorageFacade): ProductionStores {
  /** 事件读 + 幂等写：首页 / 答题页 / 图鉴 / 地图 / 错题本共用同一份适配。 */
  const eventAccess = {
    listEvents: (profileId: string): Promise<readonly DomainEvent[]> =>
      storage.events.listByProfile(profileId),
    appendEvents: (incoming: readonly DomainEvent[]): Promise<readonly DomainEvent[]> =>
      storage.events.append(incoming),
  }
  return {
    storage,
    profileSelect: createProfileSelectStore(storage.profiles),
    // 首页另需读家长设置（题量与预计用时的上限都由它决定）。
    home: {
      readSettings: (profileId: string) => storage.settings.get(profileId),
      ...eventAccess,
    } as HomeStore,
    quiz: eventAccess as QuizSessionStore,
    bestiary: { listEvents: eventAccess.listEvents },
    mistakes: { listEvents: eventAccess.listEvents },
    mistakeCatalog: MISTAKE_CATALOG,
    parent: createParentStore(storage),
    // 门禁只要"读/写一条家长 PIN"两个成员；GuardRepo 结构上满足这个窄接口。
    parentGate: storage.guard,
  }
}

/**
 * 解析存储并装配全部窄接口（幂等）。
 *
 * 首次调用才真正打开库；之后原样返回同一份装配结果。并发调用共享一次打开
 * 过程——两个标签页几乎同时首开时，重复 `openDb` 只会多一条闲置连接。
 */
export async function initProductionStores(): Promise<ProductionStores> {
  if (stores !== null) return stores
  if (pending === null) {
    pending = resolveStorage().then((storage) => {
      stores = assemble(storage)
      return stores
    })
  }
  return pending
}

/**
 * 同步取已装配的存储（供路由封装组件在 setup 期读取）。
 *
 * @throws {Error} 尚未调过 {@link initProductionStores}。抛错是刻意的：让
 *   「忘了在守卫里初始化」在第一次渲染就炸掉，而不是带着一个空实现把数据
 *   故障演变成"今天没有题"。
 */
export function getProductionStores(): ProductionStores {
  if (stores === null) {
    throw new Error('生产存储尚未初始化：路由守卫 must await initProductionStores()')
  }
  return stores
}
