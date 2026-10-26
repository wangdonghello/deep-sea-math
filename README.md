# 深海数学探险

面向小学 **1–3 年级**孩子的手机网页数学游戏。孩子每天完成一组按年级生成的数学题，推进深海/恐龙/太空主题图鉴，观察真实生物或模型；错题会自动进入错题本，也可以由家长导入平时作业里的错题再练。

**第二版稳定地址：** <https://wangdonghello.github.io/deep-sea-math/v2/>

**第三版预览（开发中，10 关深海）：** <https://wangdonghello.github.io/deep-sea-math/v3/>

第一版保留在站点根路径（<https://wangdonghello.github.io/deep-sea-math/>），从 tag `v1.0.0` 构建，不会被第二版覆盖。

> 本仓库现在以 **`v2` 分支为默认主分支**。第一版只保留 tag 与根路径部署，不再作为开发主线。

## 项目简介

- **三个年级**：1、2、3 年级各自 216 道题，共 648 道，按年级隔离，不跨年级出题；
- **三种兴趣主题**：深海、恐龙、太空；主题影响首页地图、图鉴与收集进度；
- **每日题组**：按年级与难度生成，题型轮换覆盖加减、乘除、两步应用、未知数、时间/长度/路线、规律与排序；
- **真实图鉴**：v3 深海 10 关共 30 条图鉴（含海沟鱼），14 个深海物种有授权 3D 模型（含 10 个 v3 明星物种），恐龙图鉴有 8 个 CC0 模型与真实馆藏照片；
- **区域推进**：暮光区 → 深海区 → 深渊区 → 海沟区，区域解锁后只显示该区域的鱼；
- **错题本**：自动收集错题，支持筛选、打印、错题重练；
- **错题导入（家长）**：粘贴文本、CSV/Excel 模板、拍照 OCR，校对后写入孩子档案；
- **错题练习奖励**：错题星、修复徽章、图鉴装饰；同一道题累计 2 次独立答对后移出错题本；
- **家长区**：PIN 保护、题量/时长设置、学习报告、成长概览、档案管理；
- **本地优先**：学习进度保存在本机 IndexedDB 事件日志；匿名使用统计默认开启，可在家长区关闭。

## 快速开始

```bash
npm install
npm run dev
```

按终端提示打开地址（默认 `http://localhost:5173`），建议用手机视口。

首次打开进入档案选择页：

1. 没有档案时，进入家长区建档：昵称、头像、4 位 PIN；
2. 回到档案选择页，点孩子头像并输入 PIN；
3. 之后切换孩子即切换整套隔离的进度、错题与图鉴。

常用命令：

```bash
npm run build          # 类型检查 + 生产构建（dist/）
npm run preview        # 本地预览生产产物
npm run test           # 全套 Vitest
npm run type-check     # vue-tsc
npm run test:coverage  # 覆盖率报告
```

## 使用示例

一次典型的每日循环：

1. 档案选择页选孩子、输 PIN；
2. 首页领取今日题组（默认 4 基础 + 4 应用 + 1 探测，家长可改）；
3. 答题页逐题作答，答错可看提示或答案，答对后继续；
4. 完成整组后解锁图鉴卡与下一海域；
5. 错题进入错题本；家长可在家长区导入平时的错题，孩子再练；
6. 错题练习独立答对累计 2 次后移出错题本，并获得错题星、修复徽章与图鉴装饰。

## 目录分层

依赖方向单向：`views → router/routes → features → domain`；`data` 与 `domain` 平级，`app`/`shared` 负责装配与横切。

| 层 | 目录 | 职责 |
|---|---|---|
| 领域 | `src/domain/` | 事件模型、判分、组题、难度、掌握度、提示链、奖励、事件日志与投影重放 |
| 数据 | `src/data/` | IndexedDB schema/迁移（v5）、仓储、内存降级、题库与图鉴内容 |
| 功能域 | `src/features/` | 档案、首页、答题、图鉴、错题本、错题导入、家长区、主题、解锁反馈 |
| 视图 | `src/views/` | 路由级页面，只做装配 |
| 路由 | `src/router/` | 路由表、守卫、把生产 store 注入页面 |
| 装配 | `src/app/` + `src/shared/` | `productionStores`、题组上下文、奖励目标、匿名统计 |

更细的分层约束见 [`src/README.md`](src/README.md)。

## 内容与脚本

- 题库生成脚本：`scripts/generate-grade1-bank.mjs`、`generate-grade2-bank.mjs`、`generate-question-bank.mjs`（三年级）；
- 题库文件：`src/data/content/questionBank.grade{1,2,3}.json`，每年级 216 题；
- 深海图鉴：`src/data/content/creatures.json`（30 条，按 10 关分组）；
- 主题图鉴：`src/data/content/themePacks.json`（深海 / 恐龙 / 太空，各 4 阶段 × 2 条目）；
- 影像与模型接入规范：`docs/photo-assets.md`、`docs/3d-model-assets.md`；
- 错题导入格式：见家长区“导入错题”说明，支持 `题目 | 答案 | 单位`、分块文本与 CSV 表头。

## 配置说明

### `VITE_BASE` 与本地预览

`vite.config.ts` 的 `base` 取 `process.env.VITE_BASE ?? '/deep-sea-math/'`。本地按根路径预览生产产物时：

```bash
VITE_BASE=/ npm run build
npm run preview
```

### GitHub Pages 部署

`.github/workflows/deploy-pages.yml` 同时构建两个版本：

1. 从 tag `v1.0.0` 构建第一版，发布到站点根路径；
2. 从 `v2` 分支构建第二版，发布到 `/v2/`，使用独立 IndexedDB 库 `deep-sea-math-v2`。

推送 `v2` 分支（或手动触发工作流）即更新第二版。首次使用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

## 数据与隐私

- 学习进度、错题、家长设置、家长 PIN 都只存在本机 IndexedDB；事件日志是唯一事实来源，投影可重建；
- 匿名使用统计只上报累计计数（页面访问、建档年级×主题、完成题组年级×主题），不含姓名、PIN、答案或档案编号；默认开启，家长区可关闭，`Do Not Track` 会被尊重；
- 隐私模式导致 IndexedDB 不可用时自动切内存态，家长区会显示警示条。

## 版本说明

- 第二版（`v2` 分支，默认主分支）：1–3 年级、三主题、错题导入与练习奖励；
- 第一版（tag `v1.0.0`）：只保留站点根路径部署，不再作为开发分支；
- 家长操作手册尚未更新到第二版，属于已知文档缺口。

## 测试

```bash
npm run test
```

当前基线：**89 个测试文件 / 976 条用例**。覆盖率门槛见 `vitest.config.ts`（总体 ≥ 80%，`src/domain/` 分支 ≥ 90%）。

## 文档

- 影像素材：[`docs/photo-assets.md`](docs/photo-assets.md)
- 3D 模型素材：[`docs/3d-model-assets.md`](docs/3d-model-assets.md)
- 家长操作手册（`docs/parent-guide.md`）仍为第一版内容，尚未更新到第二版；第二版家长入口与导入功能请以应用内说明为准。
