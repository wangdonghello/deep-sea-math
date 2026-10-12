/**
 * `src/router/nextRoute.ts` —— 导航守卫的**纯函数**内核（Task 17 REFACTOR）。
 *
 * 守卫本身必须做 I/O（读会话态、初始化存储、装载题组上下文），因此把"该去哪"
 * 这部分抽成不碰任何全局的纯函数：路由表怎么配、守卫怎么 await 都可以改，而这
 * 几条规则只有一处实现、可被单测穷举。
 *
 * 规则（与 spec `child-profiles` §切换档案、`creature-bestiary` §观察舱对齐，
 * 以及 P1 的家长门禁）：
 * 1. **未选档案** → `/profiles`：孩子常驻的任何页面都 must not 在没有档案的
 *    情况下渲染数据（没有"给谁读"的答案，读出来也无法归属）。家长区（含三个
 *    子路径）是唯一例外——第一个档案就是在没有档案的前提下创建的；
 * 2. **已选档案** → 目标路径：正常放行（含 `/quest` 的 query、`/observation/:id`
 *    的参数——纯函数只认 pathname，query 由路由层原样保留）；
 * 3. **已归档会话** → `/home`：已经有当前档案时落在档案选择页是死路（选完档案
 *    又回到选档案），一律回首页；退出登录/删档后会话被清空，规则 1 自然接手；
 * 4. **家长子路径未解锁** → `/parent`：家长区的三个子路径（overview/settings/
 *    manage）只在本次会话通过家长 PIN 后可达。规则只看**内存态** `unlocked`，
 *    不在守卫里做任何异步 PIN 校验（校验只发生在门禁页内）；门禁页自身不受
 *    此规则约束，否则目标等于当前路径，vue-router 会判定为无限重定向。
 *
 * `/` 的重定向不在这里：它没有条件判断（永远去档案选择页），写在路由表的
 * `redirect` 里更直白。
 */

/** 档案选择页路径（与 `features/profileSelect/types.ts` 的 `HOME_PATH` 同一口径）。 */
export const PROFILES_PATH = '/profiles'

/** 首页路径（T11 的 `HOME_PATH` 同值；此处不 import 是为了让守卫不依赖 feature）。 */
export const HOME_PATH = '/home'

/**
 * 家长区**门禁页**路径。
 *
 * 它本身是首次建档的入口，因此**不要求已有档案**（否则永远建不了第一个），
 * 也**不要求已解锁**（这里正是输入家长 PIN 的地方）。
 */
export const PARENT_PATH = '/parent'

/** 家长区总览（门禁通过后的落点）。 */
export const PARENT_OVERVIEW_PATH = '/parent/overview'

/** 家长区设置与学习报告。 */
export const PARENT_SETTINGS_PATH = '/parent/settings'

/** 家长区档案管理（仅本机管理）。 */
export const PARENT_MANAGE_PATH = '/parent/manage'

/**
 * 需要家长 PIN 放行的子路径。
 *
 * `PARENT_PATH`（门禁页）刻意不在其中：把门禁页也纳入"未解锁就打回门禁页"
 * 会让目标等于当前路径，vue-router 会判定为无限重定向。
 */
export const PARENT_CHILD_PATHS: ReadonlySet<string> = new Set([
  PARENT_OVERVIEW_PATH,
  PARENT_SETTINGS_PATH,
  PARENT_MANAGE_PATH,
])

/**
 * 没有档案也可到达的路径。
 *
 * 家长区（门禁页与三个子路径）必须在名单里：第一个档案恰恰是在没有档案的
 * 前提下创建的，把它也算作"必须选档案"会让首次安装永远卡在档案选择页
 * （点家长区 → 被守卫打回 → 再点）。
 */
export const PROFILE_OPTIONAL_PATHS: ReadonlySet<string> = new Set([
  PROFILES_PATH,
  PARENT_PATH,
  ...PARENT_CHILD_PATHS,
])

/** 守卫所需的全部输入（纯数据，不含 router / pinia / 存储）。 */
export interface GuardState {
  /** 目标路径的 pathname（不含 query 与 hash）。 */
  readonly path: string
  /** 当前是否已有档案会话（`profileSessionStore.projection !== null`）。 */
  readonly hasProfile: boolean
  /** 本次会话是否已通过家长 PIN（`parentSessionStore.unlocked`）。 */
  readonly parentUnlocked: boolean
}

/**
 * 该路径在没有档案时是否仍然可访问。
 *
 * @param path 目标 pathname。
 */
export function reachableWithoutProfile(path: string): boolean {
  return PROFILE_OPTIONAL_PATHS.has(path)
}

/**
 * 决定一次导航真正该去的路径。
 *
 * @param state 见 {@link GuardState}。
 * @returns 应当导航到的路径（不含 query；调用方负责把原 query 带回去）。
 */
export function nextRoute(state: GuardState): string {
  // 规则 1：未选档案时，非"可选档案"页面一律去档案选择页。
  if (!state.hasProfile && !reachableWithoutProfile(state.path)) {
    return PROFILES_PATH
  }
  // 规则 3：已有会话却停在档案选择页 → 回首页（登录后的落点只能是首页）。
  if (state.hasProfile && state.path === PROFILES_PATH) {
    return HOME_PATH
  }
  // 规则 4：家长子路径要求本次会话已解锁家长 PIN（异步校验只在门禁页内做）。
  if (PARENT_CHILD_PATHS.has(state.path) && !state.parentUnlocked) {
    return PARENT_PATH
  }
  return state.path
}

/**
 * 从完整路径里取出 pathname（去掉 query 与 hash）。
 *
 * 单独成函数而不是在 {@link nextRoute} 里内联：守卫拿到的是 `to.fullPath`，
 * 而规则比对必须只看路径段——`/quest?session=x` 与 `/quest` 是同一目标。
 */
export function pathnameOf(fullPath: string): string {
  return fullPath.split('?')[0].split('#')[0]
}
