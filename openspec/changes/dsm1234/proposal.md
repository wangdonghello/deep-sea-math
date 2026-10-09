## Why

《深海数学探险》已有家长确认的设计规格（`docs/superpowers/specs/2026-10-09-deep-sea-math-explorer-design.md`），但仓库中没有任何应用代码，产品核心承诺——"认真完成数学任务，就能继续下潜，发现并观察真实的深海生物"——尚不可运行、不可验证。本变更新建可运行的手机网页应用骨架，并把"接任务 → 答题 → 提示 → 订正 → 解锁 → 观察"这一每日学习循环做成可玩的闭环，让设计规格中的教学主张与奖励规则第一次获得真实反馈。

## What Changes

**业务变更**

- **新增 capability `daily-math-quest`**：每日题组（5 基础 + 3 应用 + 1 探测，题量家长可调）、难度三档自适应、题目任务页与"已知—未知—关系—算式—答案"五步引导（仅应用题与探测题展开五步，基础题直答）。
- **新增 capability `hint-and-correction`**：分层提示链（审题 → 已知/未知识别 → 数量关系 → 算式提示 → 讲解示例）、答错不撤销已解锁进度、订正后需答对一道相似题方继续。
- **新增 capability `creature-bestiary`**：深海地图四区（暮光 / 深海 / 深渊 / 海沟）与首版 4 个真实图鉴条目（含约翰逊鮟鱇鱼），每条含学名、活动深度范围、3–5 条知识卡与来源标注；观察舱展示原创 2D 插画（**本阶段不做 3D 模型与真实影像**）。
- **新增 capability `child-profiles`**：本地多个孩子档案、4 位短 PIN 切换、档案间进度/错题/图鉴完全隔离；本地家长区提供题量与时长设置及基础学习报告（**本阶段不做账号登录与云端同步**）。
- **新增 capability `offline-event-log`**：答题事件带唯一事件 ID 写入本地事件日志，档案/错题/掌握状态/图鉴解锁均作为投影并可由事件重建，为阶段二幂等云端同步预留结构（**本阶段不实现同步**）。

**脚手架**

- Vue 3 + TypeScript + Vite 项目骨架、Vitest 测试配置、IndexedDB 存储适配、路由与全局深海主题样式、Git Hooks（`oms-git-hooks install`）。

**本阶段明确不含**

- 3D 模型（Three.js）、真实影像、12 个生物中的其余 8 条、排行榜（积分须服务端重算，客户端不得自行决定）、账号登录与跨设备同步、完整家长报告。

## Capabilities

### New Capabilities

- `daily-math-quest`: 每日题组生成、难度自适应、题型覆盖（加减/乘除/两步应用/未知数关系/单位时间路线/规律数据）、答题流程与答对判定、整组完成解锁。
- `hint-and-correction`: 分层提示链、提示后掌握标记、订正与相似题机制、正向反馈（无红色失败弹窗）。
- `creature-bestiary`: 四区深海地图与深度进度、图鉴条目内容结构、观察舱（2D 插画 + 知识卡 + 动作标注）、解锁与奖励发放。
- `child-profiles`: 档案创建与 PIN 切换、档案间数据隔离、本地设置（题量/时长）、本地学习报告。
- `offline-event-log`: 事件 ID 生成与幂等落库、投影重建、存储降级（内存态）与家长提示。

### Modified Capabilities

（无。本阶段为全新实现，无既有 openspec 规格被修改。）

## Impact

- **新增代码**：全新 `src/` 应用（domain / data / features / views 四层）、题库与生物内容种子数据。
- **新增依赖**：vue、vue-router、pinia、idb、typescript、vite、vitest、@vue/test-utils、jsdom。
- **配置**：`openspec/config.yaml`（由 `openspec init` 生成）、`.opencode/` 技能与命令目录、`.gitignore` 增加 `.superpowers/`。
- **数据**：全部进度仅存浏览器本地 IndexedDB，无任何服务端接口、无网络请求、无第三方分析 SDK。
- **合规**：默认虚拟昵称与头像，不采集真实姓名/学校/联系方式/精确位置；日志与错误信息不得输出 PIN 等敏感信息（PIN 仅以哈希形式存储）。
