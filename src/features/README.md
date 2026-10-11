# `src/features/` —— 功能域组合式逻辑与组件

**职责**：按功能域组织的 Vue 组合式函数（composable）与可复用组件。每个子目录一个功能域，内部以 `use*.ts` 承载逻辑、`.vue` 负责渲染。

## 硬约束

- 只允许依赖 `domain/`（纯函数与类型）与 `data/`（经窄接口），**不得反向依赖 `views/`**。
- 业务判定一律委托 `domain/`，本层只做状态编排与渲染。
- 组件内不得直接操作 `localStorage` / `indexedDB`：存储经窄接口注入，测试方可整体替换为内存态 fake。

## 功能域

| 功能域 | 做什么 | 不做什么 |
|---|---|---|
| `profileSelect/` | 档案列表渲染、PIN 盘输入与锁定倒计时；`createProfileSelectStore` 把仓储适配成档案窄接口 | 不做 PIN 哈希/比对（属 `domain/crypto/`） |
| `home/` | 首页地图主体（四区 + 深度刻度 + 潜水艇基地）、任务卡浮层、页签导航；`useHomeQuest` 编排"读设置 → 重放投影 → 定位当日题组" | 不做组题与判等（属 `domain/quiz/`） |
| `quizStage/` | 单题作答舞台：五步引导渲染、提示栈、数字键盘、提交与订正编排（`useQuizSession`） | 不做五步合法性判定（属 `domain/quiz/fiveStepMachine`） |
| `bestiary/` | 图鉴列表、四区筛选、观察舱插画与知识卡渲染（`useBestiary`） | 不做解锁判定（属 `domain/reward/`） |
| `mistakeBook/` | 错题列表与按题型/掌握状态筛选（`filterMistakes` 为纯函数），进入重练携带相似题 | 不做判等与掌握度迁移（属 `domain/`） |
| `parentPanel/` | 题量/时长设置、学习报告、PIN 重置、删除档案（`createParentStore` 适配存储门面） | 不做投影重放算法本身（属 `domain/eventLog/replay`） |
| `unlock/` | 整组完成后的解锁浮层反馈（`useUnlockFeedback`） | 不做奖励计算（属 `domain/reward/`） |
| `theme/` | 全局深海主题的纯展示组件（`FishBackdrop`）与对比度工具 | 不含任何业务规则（非功能域，仅展示性子目录） |

`fixtures.ts`（`home/`）与 `demoSimilarQuestions.ts`（`quizStage/`）是**演示题池**：只在 composable 未注入题库时兜底，正式路径由 `app/productionStores.ts` 装配真实题库（见文件头注释）。

分层总览与依赖方向见 [`../README.md`](../README.md)。
