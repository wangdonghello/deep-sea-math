# 深海数学探险

面向小学三年级孩子的手机网页数学游戏。孩子每天领一组题，先用「已知—未知—关系—算式—答案」五步把数学想清楚，整组完成后就能继续下潜，在图鉴里解锁并观察一条真实的深海生物。当前阶段（阶段一）已实现完整可玩的每日学习循环：全部进度只存在本机浏览器（IndexedDB 事件日志），没有账号、没有网络请求、没有第三方分析 SDK。

## 项目简介

- **产品主张**：认真完成数学任务，就能继续下潜，发现并观察真实的深海生物。奖励与进度绑定在"完成整组 + 独立答对率"上，答错不回退已解锁内容。
- **需求规格**：`openspec/changes/dsm1234/proposal.md`（Why / What Changes）与 `specs/*/spec.md`（5 个 capability 的需求项与场景），是验收依据。
- **设计决策记录**：`openspec/changes/dsm1234/design.md`（分层、事件表、解锁规则）与 `openspec/changes/dsm1234/RETRO.md`（实施过程中每条改道决策的留痕）。
- **任务进度**：`openspec/changes/dsm1234/tasks.md`（18 个 task 的 RED→GREEN→REFACTOR 记录）。

## 快速开始

```bash
npm install
npm run dev
```

`npm run dev` 启动后按终端提示打开地址（默认 `http://localhost:5173`）。建议用浏览器的设备模拟器切到手机视口（本项目是手机网页形态，竖屏优先）。

首次打开会直接进入**档案选择页**（`/` 无条件重定向到 `/profiles`）：

1. 没有档案时，点底部「家长区」进入 `/parent` 建档——昵称、头像与 4 位短 PIN（PIN 只以加盐哈希存储，不保存明文）；
2. 回到档案选择页点选孩子头像，输入 PIN 即进入首页；
3. 后续每次打开都落在档案选择页，切换孩子即切换整套隔离的进度、错题与图鉴。

常用命令：

```bash
npm run build          # 类型检查 + 生产构建，产物在 dist/
npm run preview        # 本地预览生产产物（默认 base 为 /deep-sea-math/）
npm run test           # 跑全套 Vitest 用例
npm run test:watch     # 监听模式
npm run type-check     # vue-tsc 类型检查
npm run test:coverage  # 带覆盖率报告
```

## 目录分层

六层结构，**依赖方向单向**：`views → router/routes → features → domain`；
`data` 与 `domain` 平级（`features` 可依赖两者，`domain` 不依赖任何层）。

| 层 | 目录 | 职责 |
|---|---|---|
| 领域 | `src/domain/` | 纯 TS 业务规则：题型/事件/model 常量、答案判等、五步状态机、组题与难度、掌握度、提示链、解锁奖励、事件日志与投影重放 |
| 数据 | `src/data/` | IndexedDB schema 与迁移、四仓储、内存降级、题库（216 题）与生物（4 条）内容种子及运行时校验 |
| 功能域 | `src/features/` | 按功能域的 composable + 组件（档案选择 / 首页 / 答题 / 图鉴 / 错题本 / 家长区 / 主题 / 解锁反馈） |
| 视图 | `src/views/` | 8 个路由级页面，只做装配，不承载业务规则 |
| 路由 | `src/router/` | 路由表、导航守卫（纯函数 `nextRoute`）、把生产 store 装进各视图的薄封装 |
| 装配 | `src/app/` + `src/shared/` | `productionStores`（存储门面 → 各视图窄接口）、题组/目标/解锁装配、日志脱敏 `redact` |

```text
        ┌──────────── views（页面，只做装配） ────────────┐
        │ router/routes（薄封装：接生产 store 与 emit）  │
        └──────────────────────┬────────────────────────┘
                               ↓
              features（composable + 组件）
               ↙                        ↘
    domain（零依赖纯 TS）  ←──  data（IndexedDB / 内容种子）
                               ↑
        app（装配）+ shared（脱敏）可依赖以上各层
```

更细的"每层能依赖什么、不能依赖什么"见 [`src/README.md`](src/README.md)。

## 配置说明

### `VITE_BASE` 部署子路径

`vite.config.ts` 的 `base` 取 `process.env.VITE_BASE ?? '/deep-sea-math/'`：站点部署在 GitHub Pages 的项目子路径下，默认值让 JS/CSS 走相对子路径而不是根路径（否则 404）。

```bash
VITE_BASE=/ npm run build     # 本地预览生产产物：按根路径构建
npm run preview               # 预览 dist/，先用上面的命令构建
```

### GitHub Pages 部署

推送（或手动触发）即自动发布：

1. push 到 `main` 触发 `.github/workflows/deploy-pages.yml`：`npm ci` → `npm run test` → `npm run build` → 上传 `dist/` 并部署 Pages；
2. 首次使用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**（不选则工作流跑完也不发布）；
3. 部署地址形如 `https://<user>.github.io/deep-sea-math/`。

### 微信内置浏览器

微信内置浏览器可能拦截 `github.io` 域名导致打不开。若被拦，页面顶部会出现「在浏览器中打开」入口，点它用系统浏览器打开即可正常访问。

### 隐私模式与存储降级

隐私模式下 IndexedDB 不可用。应用不会白屏：`src/data/db.ts` 的 `resolveStorage()` 探测失败时自动切换内存态仓储，家长区会常驻一条警示条（数据不保存，关闭页面即丢失）。内存态下建档、答题、图鉴解锁全部可用，只是刷新后归零。

## 使用示例：一次完整的每日学习循环

从零建档到观察舱的完整一次循环（各页面入口见括号）：

1. **建档**（家长区入口，档案选择页底部）：填昵称、选头像、设 4 位 PIN。多孩子各建一个档案，进度互不可见。
2. **领今日任务**（首页「图鉴与任务」卡）：首次进入首页点「领取今日任务」生成当日题组，默认 5 基础 + 3 应用 + 1 探测；已有未完成题组时显示「N / 9」进度与「继续下潜」。
3. **答题**（首页「开始下潜」→ 答题页）：基础题直答；应用题与探测题展开五步引导——点选「已知」「未知」、单选「关系」、输入「算式」与「答案」，五步顺序固定、不可跳。
4. **提示**（答题页提示按钮）：同一题第 n 次点提示得第 n 层，共 5 层（审题 → 已知/未知 → 数量关系 → 算式 → 讲解示例），第 5 层不再前进；用过提示的题不计「独立掌握」。
5. **订正**（答错后，无红色失败弹窗）：答错不撤销已解锁内容，按提示重试；点「看答案」后该题标记为提示后掌握，并需答对一道相似题才继续。
6. **整组完成解锁**（答题页最后一题提交后）：跑 `unlockRules` 结算奖励，弹出解锁浮层；整组完成必得图鉴卡，独立答对率 ≥ 60% 额外得独立掌握徽章，同时推进下潜深度。
7. **观察舱**（图鉴页 → 已解锁条目）：看原创示意插画、学名、活动深度区间、知识卡与来源；未解锁条目只显示剪影与「继续下潜解锁」。
8. **错题本**（底部导航「错题本」）：按题型与掌握状态筛选，点错题进入相似题重练（`/quest?practice=<题号>`）。

地图页（`/map`）展示四区下潜进度，是首页的地图主体放大版；底部导航共图鉴 / 地图 / 错题本 / 首页四项目录，家长区不从孩子导航进入。

## 阶段一范围与后续阶段

**阶段一已交付（DSM1234，18 个 task）**

- 每日题组生成与难度三档自适应（题库不足时回落并留痕 `difficulty-fallback` 事件）；
- 题库扩容到 **216 题**（6 题型 × 3 难度 × 12 题，数字量级对齐三年级，每格覆盖三个槽位类别），由 `scripts/generate-question-bank.mjs` 用固定种子生成；
- 五步思考引导、5 层提示链、答错订正 + 相似题重练；
- 多孩子本地档案、4 位 PIN、档案间数据完全隔离；本地家长区（题量与时长设置、学习报告、PIN 重置、删除档案）；
- 4 个真实图鉴条目 + 四区地图 + 观察舱（原创示意插画、知识卡、来源标注）；
- 事件日志持久化（IndexedDB）+ 投影重建 + 存储降级内存态；
- 643 条 Vitest 用例，总体覆盖率门槛 80%。

**阶段一未交付（走后续 change）**

- 3D 模型与真实影像：当前观察舱只有原创 2D 示意插画，需授权素材后另立需求；
- 账号登录与云端同步：事件结构已为阶段二幂等同步预留字段（`questionVersion`），但同步本身未实现；
- 排行榜：积分须服务端重算，客户端不得自行决定；
- 12 个图鉴条目中的其余 8 个（当前 4 个）。

决策与取舍的完整记录见 `openspec/changes/dsm1234/` 下的 `proposal.md`（为什么做）、`specs/`（需求项与场景）、`design.md`（怎么设计）、`tasks.md`（怎么执行）、`RETRO.md`（实施中发现的问题与改道）。

## 测试

```bash
npm run test           # 全套 Vitest（51 个文件，643 条用例）
npm run test:coverage  # 覆盖率报告（text + html + lcov，产物 coverage/）
```

- 门槛：总体行/函数/分支/语句覆盖率 **≥ 80%**（`vitest.config.ts` 配阈值，未达标即非零退出）；
- 目标：`src/domain/` 分支 **≥ 90%**——它是零依赖纯 TS 层，没有借口不覆盖；
- 分层对应：`tests/domain/**` 覆盖纯规则，`tests/features/**` 与 `tests/router/` 用内存态 fake 覆盖视图行为，`tests/data/**` 用 `fake-indexeddb` 覆盖真实存储路径，`tests/readme.test.ts` 文档契约。

`npm run type-check` 单独跑 `vue-tsc -b --noEmit`；CI（`.github/workflows/deploy-pages.yml`）在构建前会先跑 `npm run test`，测试红则不发版。
