# `src/` 分层说明

六层结构。**依赖方向单向**：`views → router/routes → features → domain`，`data` 与 `domain` 平级（`features` 可依赖两者，`domain` 不依赖任何层）。

```
domain/      纯 TypeScript 业务规则（零依赖）
data/        IndexedDB 仓储 + 内容种子
                        ↕（平级，互不依赖）
features/    按功能域的 composable + 组件
views/       路由级页面（只做装配）
router/      路由表 + 导航守卫 + 薄封装
app/ shared/ 生产 store 装配 / 横切工具
```

## 每层能依赖什么、不能依赖什么

| 层 | 允许依赖 | 禁止依赖 |
|---|---|---|
| `domain/` | 仅自身与被注入的窄接口（`clock` / `idGenerator` / `digest` / `randomUUID`） | Vue、`vue-router`、`pinia`、`window`、`document`、`indexedDB`、`localStorage`、任何框架运行时，以及 `data/` `features/` `views/` |
| `data/` | `domain/`（类型与纯函数）、`idb` | `features/`、`views/`、`router/` |
| `features/` | `domain/`、`data/` | `views/`（反向依赖）、直接读写 IndexedDB、直接操作 DOM 的业务规则 |
| `views/` | `features/` 的窄接口、`domain/`（类型）、`router/` | 直接调用 `data/` 仓储、自己装配生产存储、承载业务判定 |
| `router/` | `app/`（守卫初始化）、各 `features/` 的窄接口、`domain/` | 在 `routes/*.vue` 里写业务规则 |
| `app/` `shared/` | `data/`、`domain/`、`features/` | 被 `domain/` 反依赖；`shared` 内不得出现业务规则 |

## 为什么 `domain/` 必须零依赖

1. **可测性**：纯 TS 意味着 765 条用例里最核心的判等、五步状态机、组题、解锁、投影重放都能在 Node 下跑，不需要 jsdom、不需要 fake IndexedDB。一旦它 import 了 Vue 或浏览器全局，"纯规则单测"立刻变成"半个集成测试"。
2. **确定性**：时间、UUID、摘要都必须由调用方注入。`buildDailyQuest` 因此能在同输入下产出同题序（当天刷新不重抽），`replayProjections` 因此能在任意事件序列上复现同一投影。
3. **单向依赖的锚点**：六层里只有 `domain` 谁也不依赖，它才可能成为唯一的事实来源。若 `domain` 反向依赖 `data/`，业务规则就会与存储实现共生——换掉 IndexedDB 要改判等逻辑，这种耦合在这类本地优先应用里无法收敛。

## 生产 store 的唯一接线点

`app/productionStores.ts` 把 `data/db.ts` 的 `resolveStorage()` 门面适配成各视图所需的窄接口（`ProfileStore` / `HomeStore` / `QuizSessionStore` / `BestiaryStore` / `MistakeBookStore` / `ParentStore`）。`views/*` 只认识窄接口，因此在测试里可以整体注入内存态 fake；路由守卫在 `beforeEach` 里 `await initProductionStores()`，`routes/*.vue` 薄封装在 setup 期同步取单例。

## 事件溯源

全部进度存 IndexedDB 事件日志，页面状态由 `domain/eventLog/replay.ts` 的 `replayProjections` 重建；投影是可随时清空重建的缓存，事件才是事实来源。同毫秒事件的次序由 `eventOrder` 台账还原，避免重放结果依赖写入时序。

快速开始、配置与使用示例见仓库根目录的 `README.md`。
