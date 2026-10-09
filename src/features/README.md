# `src/features/` —— 功能域组合式逻辑与组件

**职责**：按功能域组织的 Vue 组合式函数（composable）与可复用组件。
每个子目录对应 design.md §1 定义的一个功能域，内部以 `use*.ts` 承载逻辑、
`.vue` 负责渲染。

## 硬约束

- 只允许依赖 `domain/`（纯函数与类型），**不得反向依赖 `views/`**。
- 业务判定一律委托 `domain/`，本层只做状态编排与渲染；如需调用仓储，
  必须在 composable 内通过 `data/` 暴露的接口完成，并保持可被测试替身替换。
- 组件内不得直接操作 `localStorage` / `indexedDB`。

## 规划中的功能域

下表逐行对齐 `openspec/changes/dsm1234/design.md` §1 列出的功能域。

| 功能域 | 做什么 | 不做什么 |
|---|---|---|
| `profileSelect/` | 档案列表渲染、PIN 盘输入与锁定倒计时（Task 11） | 不做 PIN 哈希/比对（属 `domain/crypto/`） |
| `quest/` | 当日题组的领取与恢复：按 `buildDailyQuest` 取题、题组级进度、开始下潜入口（Task 4/12 的 UI 侧） | 不做单题判等与题型/难度计算（属 `domain/quiz/`） |
| `quizStage/` | 单题作答舞台：五步引导、提示栈、数字键盘、提交与订正编排（Task 13） | 不做五步合法性判定（属 `domain/quiz/fiveStepMachine`） |
| `hint/` | 分层提示链的展开/收起与层级推进（第 n 次取提示得第 n 层，超 5 层不再前进） | 不内置提示文案内容（文案由 `domain/hint/hintChainSelector` 选出） |
| `bestiary/` | 图鉴列表、四区筛选、观察舱插画与知识卡渲染（Task 14） | 不做解锁判定（属 `domain/reward/`） |
| `mapPanel/` | 深海地图主体：四区地图 + 深度刻度 + 潜水艇基地，SVG/CSS 动画实现，不引动画库 | 不做解锁规则与深度进度计算 |
| `parentPanel/` | 家长区：题量/时长设置、学习报告、PIN 重置、删除档案（Task 16） | 不做投影重放算法本身（属 `domain/eventLog/replay`） |
| `mistakeBook/` | 错题列表与筛选（按题型/掌握状态）、进入重练并携带相似题（Task 15） | 不做判等与掌握度迁移（属 `domain/`） |

## 与 tasks.md 的两处路径差异（已记录结论，非静默删除）

`tasks.md` 的测试路径里出现过两个 **不在 design.md §1 功能域清单中** 的目录，
此处显式记录处理结论，避免后续实施时重复纠结：

### 1. `features/home/` —— 不建，合并进 `views/HomeView.vue` + `features/mapPanel/`

`tasks.md` Task 12 的测试写作 `tests/features/home/HomeView.test.ts`，但
design.md §1 的 features 清单里没有 `home/`，§4 则明确 `HomeView` 是**视图**
（由 `MapPanel`、`QuestCard`、`FishBackdrop`、`DepthScale`、`TabBar` 组成）。
若另建 `features/home/`，会与 `views/HomeView.vue` 职责重叠、破坏
"features 提供能力、views 负责装配" 的分层。

**结论**：不建 `features/home/`。首页能力分别落在 `features/mapPanel/`（地图主体）
与 `features/quest/`（任务卡与题组进度）。若后续 Task 12 需要首页级 composable，
应放入上述两域之一，而非新建 `home/`。

### 2. `features/theme/` —— 不列为功能域，仅作展示性子目录

`tasks.md` Task 10 写作 `src/features/theme/FishBackdrop.vue`，而 design.md §1
把全局主题样式放在 `styles/`，§4 则以 SVG/CSS 方案描述 `FishBackdrop`。
`theme/` 与 `styles/`（全局色板/字号阶）职责重叠，且 FishBackdrop 是纯装饰性
展示组件、不含任何业务规则，不构成 design §1 意义上的"功能域"。

**结论**：不把 `theme/` 列为功能域。Task 10 落地时 `src/styles/theme.css`
承载色板与字号阶；`FishBackdrop.vue` 等纯展示组件如需集中放置，
放在 `src/features/theme/` 作为**展示性子目录**（非功能域），
其中不得出现业务规则判断。

本目录在 Task 1 阶段仅为占位，尚无代码。快速开始请见仓库根目录的 `README.md`。
