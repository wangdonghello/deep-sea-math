# `src/views/` —— 路由级页面

**职责**：每个文件对应一条路由的页面级组件，负责组装 `features/` 的组件与 composable，不承载业务规则。

## 硬约束

- 只允许依赖 `features/` 的窄接口、`domain/`（类型）与 `router/`。
- 不得直接调用 `data/` 仓储、不得自己装配生产存储（那会让组件测试再也注入不了内存态 fake）。
- 页面级数据获取与副作用放在 `features/` 的 composable 中，本层只做装配。
- 路由表集中在 `src/router/index.ts`，不在此处注册路由。

## 页面与路由

`ObservationView` 是唯一没有 emit 的页面：守卫确认生物已解锁后通过 `props: route => ({ creature: route.meta.creature })` 直接交付内容对象。

| 文件 | 路由 | 说明 |
|---|---|---|
| `ProfileSelectView.vue` | `/profiles`（`/` 无条件重定向到此） | 档案列表 + PIN 盘 + 锁定倒计时 |
| `HomeView.vue` | `/home` | 地图主体 + 任务卡浮层 + 页签导航 |
| `QuestView.vue` | `/quest` | 答题页：五步引导、提示栈、数字键盘；`?practice=` 重练、`?session=` 深链 |
| `BestiaryView.vue` | `/bestiary` | 图鉴列表与四区筛选 |
| `ObservationView.vue` | `/observation/:id` | 观察舱：学名、深度区间、知识卡、来源 |
| `MapView.vue` | `/map` | 四区地图与深度进度 |
| `MistakeBookView.vue` | `/mistakes` | 错题本与筛选 |
| `ParentGateView.vue` | `/parent` | 家长区门禁：输家长 PIN 后进入总览 / 设置与报告 / 档案管理 |

家长区的三个功能区页面（`FamilyOverviewSection` / `LearningSettingsSection` /
`ProfileManageSection`）是 `features/parentPanel/` 下的组件，由
`routes/Parent*Route.vue` 三个薄封装注入存储后挂载——它们不是 `views/` 的
页面组件（`views/` 只收路由级页面）。

生产 store 的装配在 `src/router/routes/*.vue`（薄封装）与 `src/app/productionStores.ts`，不在本目录。分层总览见 [`../README.md`](../README.md)。
