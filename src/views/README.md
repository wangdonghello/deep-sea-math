# `src/views/` —— 路由级页面

**职责**：每个文件对应一条路由的页面级组件，负责组装 `features/` 的组件与
composable，不承载业务规则。

## 硬约束

- 只允许依赖 `features/`、`domain/`（类型）与 `router/`。
- 页面级数据获取与副作用放在 `features/` 的 composable 中，本层只做装配。
- 路由表集中在 `src/router/index.ts`（Task 17 补齐），不在此处注册路由。

## 规划中的页面

路由清单逐行对齐 `tasks.md` Task 17 断言可达的路径；design.md §4 列出的
`UnlockOverlay` 是覆盖层组件、不占路由，故不在本表。

| 文件 | 路由 | 任务 |
|---|---|---|
| `ProfileSelectView.vue` | `/`（未选档案时由 `/` 重定向到此） | Task 11 |
| `HomeView.vue` | `/home` | Task 12 |
| `QuestView.vue` | `/quest` | Task 13 |
| `BestiaryView.vue` | `/bestiary` | Task 14 |
| `ObservationView.vue` | `/observation/:id` | Task 14 |
| `MapView.vue` | 路由待 Task 17 定稿（四区地图 + 深度进度；`/` 默认重定向到档案选择） | Task 14 |
| `MistakeBookView.vue` | `/mistakes` | Task 15 |
| `ParentView.vue` | `/parent` | Task 16 |

本目录在 Task 1 阶段仅为占位，尚无代码。快速开始请见仓库根目录的 `README.md`。
