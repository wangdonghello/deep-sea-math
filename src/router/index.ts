import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import { initProductionStores } from '@/app/productionStores'
import { buildQuestContext } from '@/app/questContext'
import { findUnlockedCreature } from '@/app/unlockedCreature'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { HOME_PATH, PROFILES_PATH, nextRoute, pathnameOf } from './nextRoute'

/**
 * 全局路由表（Task 17）。
 *
 * 三个装配决定：
 * 1. **全部视图都走 `routes/` 下的薄封装组件**（`ObservationView` 例外：它无
 *    emit，直接经 `props` 收守卫放行的 `creature`）。封装组件是"生产 store 从
 *    哪来、emit 落到哪"的唯一容身之处——写在视图里会让 `views/*` 认识路由与
 *    存储（组件测试就再也注入不了内存态 fake），写在 App.vue 里又拿不到子组件
 *    的事件。守卫只负责"该去哪、带什么上下文"，不碰具体视图的 props。
 * 2. **守卫装载的上下文走 `to.meta`**：`props`/setup 都是同步求值，而题组与
 *    解锁状态都要读事件。挂在本次导航上，缓存失效问题就不存在了。
 * 3. **除 `/` 的重定向外一律懒加载**：首次打开只需要档案选择页，把图鉴、
 *    家长区一起打进首屏会拖慢孩子看到"选择你的档案"的时间。
 */

const routes: RouteRecordRaw[] = [
  // 首次打开（无深链）永远落在档案选择页；`redirect` 是无条件的，不需要守卫。
  { path: '/', redirect: PROFILES_PATH },

  { path: PROFILES_PATH, name: 'profiles', component: () => import('./routes/ProfilesRoute.vue') },
  { path: HOME_PATH, name: 'home', component: () => import('./routes/HomeRoute.vue') },
  {
    path: '/quest',
    name: 'quest',
    // 封装组件而不是直接挂 `QuestView`：它用 `route.fullPath` 作 key 强制
    // 重挂载（见 `routes/QuestRoute.vue` 的说明），否则从 `/quest?practice=`
    // 回到当日题组时，`useQuizSession` 仍握着上一次的 sessionId。
    component: () => import('./routes/QuestRoute.vue'),
  },
  { path: '/bestiary', name: 'bestiary', component: () => import('./routes/BestiaryRoute.vue') },
  {
    path: '/observation/:id',
    name: 'observation',
    component: () => import('@/views/ObservationView.vue'),
    // 守卫已确认该生物已解锁并通过 `meta` 交付内容对象；视图只收 creature。
    props: (route) => ({ creature: route.meta.creature }),
  },
  { path: '/mistakes', name: 'mistakes', component: () => import('./routes/MistakesRoute.vue') },
  { path: '/parent', name: 'parent', component: () => import('./routes/ParentRoute.vue') },
  { path: '/map', name: 'map', component: () => import('./routes/MapRoute.vue') },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * 全局前置守卫（Task 17）。
 *
 * 顺序是刻意的：
 * 1. **先 await 生产存储**——`props` 函数要同步读单例，晚于组件渲染就晚了；
 *    首次导航会为此多一次微任务，之后原样返回；
 * 2. **再跑纯函数 `nextRoute`**做档案判定，把"该去哪"与 I/O 分开（可单测）；
 * 3. **最后装载路由专属上下文**（答题页题组 / 观察舱生物）——它们都依赖
 *    档案上下文，且都要读事件。
 */
router.beforeEach(async (to) => {
  const stores = await initProductionStores()
  const session = useProfileSessionStore()
  const hasProfile = session.projection !== null
  const target = nextRoute({ path: pathnameOf(to.path), hasProfile })

  // 未选档案（或已有档案却落在档案选择页）：重定向，并保留 query 里的
  // 原始意图（例如被要求登录后继续 `/quest?session=x`）。
  if (target !== to.path) {
    return { path: target, query: to.query }
  }

  const profileId = session.activeProfileId

  if (to.name === 'quest') {
    const events = await stores.quiz.listEvents(profileId!)
    // `/quest?practice=a,b`：错题重练（题号由孩子点选，顺序即点名顺序）。
    const practiceParam = to.query.practice
    const practiceIds = typeof practiceParam === 'string'
      ? practiceParam.split(',').filter((id) => id !== '')
      : []
    const context = buildQuestContext(profileId!, events, Date.now(), { practiceIds })

    // 只有"当日题组不存在且不是重练"才打回首页：重练没有当日题组也做得成。
    if (context.sessionId === null) return HOME_PATH
    // `meta` 是本次导航的私有载荷：同一路径下次进入会重新装配，不会残留。
    to.meta.questContext = context
  }

  if (to.name === 'observation') {
    // 未解锁的生物 MUST NOT 泄露名称/学名：读不到已解锁条目就打回图鉴。
    const creature = await findUnlockedCreature(stores, profileId!, to.params.id as string)
    if (creature === null) return '/bestiary'
    // `meta` 是本次导航的私有载荷：同一路径下次进入会重新判定，不会残留。
    to.meta.creature = creature
  }

  return true
})

export default router
