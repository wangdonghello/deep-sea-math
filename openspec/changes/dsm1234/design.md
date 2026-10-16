# 深海数学探险 · 阶段一 核心学习循环 — 设计

**change-id**: DSM1234 ｜ **输入**: `proposal.md` + `specs/*.md`（均为 input，禁止修改）

## Constitution Check
*GATE: Must pass before design phase. Re-check after design complete.*

**Triggered HARD_RULEs**:
- 安全与合规底线 §1 密钥与凭据 (AGENTS.md:18)：PIN 属于验证凭据，禁止明文存储/输出；无任何 AK/SK/token 落入客户端或日志
- 安全与合规底线 §5 越权命令 (AGENTS.md:22)：不得产生 `rm -rf /`、强制推送到 main、`drop database` 等操作
- 提交规范 (AGENTS.md:24)：所有 commit 必须 `[DSM1234] <type>: <subject>` 格式
- PreToolUse 强制 (AGENTS.md:28)：写文件前已自查硬编码凭据 / `.env` 直编 / 破坏性命令

**Triggered SOFT_RULEs**:
- 工具使用规范 (AGENTS.md:31)：走 `/sdd-spec` → `/sdd-plan` → `/sdd-apply` → `/sdd-review` 阶段链，单次回复不跑两个阶段命令
- 推荐架构实践·公共 API 文档注释 (AGENTS.md:40)：`domain/` 每个模块与公共函数必须含 JSDoc
- 推荐架构实践·README 含快速开始 (AGENTS.md:44)：项目 README 必须重写为可运行的快速开始
- 推荐架构实践·异步非阻塞 (AGENTS.md:38)：IndexedDB 访问全部异步，不得阻塞渲染
- 推荐架构实践·避免循环内 I/O (AGENTS.md:42)：题库加载、事件重放均批量处理，不得逐条 await

**Compliance Plan**:
- PIN 安全：`crypto.subtle.digest('SHA-256', pin + per-profile salt)` 存储哈希，只比对哈希；日志经 `redact()` 脱敏工具统一处理，单测断言日志不含 PIN
- 越权命令：任务清单中不包含任何删除数据库/强制推送类操作；对受保护分支的强制推送由 pre-push hook 阻断
- 提交规范：tasks.md 中每个 task 的 commit message 已预填 `[DSM1234] <type>: T<n> - <subject>` 格式
- 阶段链：本次已完成 `/sdd-spec`（commit `[DSM1234] spec: ring 1 freeze`），当前处于 `/sdd-plan`
- 公共 API 文档注释：`domain/*.ts` 一律 JSDoc + `@throws` 标注；`src/README.md` 说明各层职责
- 异步非阻塞：仓储层全部 Promise；UI 仅在 await 返回后更新
- 避免循环内 I/O：事件重放使用 `getAll` 一次取全量后在内存 reduce，不使用逐条查询

## 1. 架构分层

四层，依赖方向单向向下：`views → features → domain ← data`。`domain` 不依赖 Vue、不依赖浏览器 API，因此可在 Node 下被纯单测覆盖。

```
src/
  domain/                纯 TypeScript 业务规则（无 Vue / 无 DOM）
    model/               值对象与类型：Question, Profile, AnswerEvent, MasteryState, BestiaryEntry, Session...
    quiz/                buildDailyQuest / difficulty / answerJudgement / fiveStepMachine
    mastery/             masteryStateMachine（未掌握→提示后→独立→稳定）
    reward/              unlockRules / rewardGrant
    hint/                hintChainSelector
    eventLog/            eventId / replayProjections
    crypto/              hashPin / verifyPin（Web Crypto 抽象，注入以便 Node 测试）
  data/
    db.ts                IndexedDB schema + version migration
    repositories/        profileRepo, eventRepo, settingsRepo, bestiaryRepo（接口 + 实现分离）
    memoryFallback.ts    存储降级：IndexedDB 不可用时切换内存态
    content/             题库 JSON（60–80 题）、4 条生物条目、初始内容
  features/              按功能域的 Vue 组合式逻辑与组件
    profileSelect/ quest/ quizStage/ hint/ bestiary/ mapPanel/ parentPanel/ mistakeBook/
  views/                 路由级页面
  router/ styles/ App.vue main.ts
```

**依赖注入点**：`crypto`、`storage`、`clock`、`idGenerator` 四个可注入单例。这是让 domain 层可在 Vitest 中被确定性测试的关键——否则时间与随机数会让组题判定不可复现。

**状态管理**：Pinia，但 store 只持有"当前会话"这类易失态；权威状态始终来自 `domain` 投影，刷新后从 IndexedDB 重放恢复。

## 2. 数据模型与事件

**事件为唯一事实来源**（event sourcing，阶段二同步直接复用）：

| 事件 | 触发时机 | 关键载荷 |
|---|---|---|
| `profile-created` | 建档案 | profileId, pinHash, salt, nickname, avatarId |
| `session-started` | 开始当日题组 | sessionId, questionIds[], difficultyTrace[] |
| `answer-submitted` | 每次提交 | eventId, questionId, submitted, correct, usedHintLevel, retryCount, ms |
| `hint-used` | 展开提示层 | questionId, level(1–5) |
| `answer-revealed` | 直接看答案 | questionId |
| `correction-done` | 订正答对 | questionId, similarQuestionId |
| `session-completed` | 整组完成 | sessionId, rewards[], unlockedZone, unlockedCreature |
| `unlock-granted` | 解锁发放 | targetId, kind(creature|zone), reason(sessionId) |
| `settings-updated` | 家长改设置 | basicCount, appliedCount, probeCount, maxMinutes |

**投影表**（可由上述事件完整重建）：`questProgress`、`masteryByQuestion`、`masteryByTopic`、`mistakeBook`、`bestiaryUnlock`、`dailyQuestIndex`。

**事件 ID**：`crypto.randomUUID()`，写入前去重（同 sessionId+questionId+retryCount+level 组合视为同一逻辑操作）。

**题目模型**（`Question`）关键字段：
```ts
type Question = {
  id: string; type: QuizType; difficulty: 1|2|3;
  story: { title: string; body: string };          // 深海宠物任务包装
  requiresFiveStep: boolean;                        // 应用题/探测题 true
  steps?: FiveStep[];                               // 五步模板（requiresFiveStep 时必有）
  hints: string[];                                  // 固定 5 层，顺序即规格
  answer: { value: number; unit?: string; expression?: string };
  similarQuestionIds: string[];
  tags: string[]; creatureRef?: string;
  sources: string[];                                // 内容核验来源
}
```

**判等规则**：数值型取整后比对；带单位型归一化单位后比对数值；算式型按 token 序列比对。

## 3. 核心规则

### 组题 `buildDailyQuest({ profileId, settings, history, pool })`
1. 读取该档案近 7 天事件 → 计算当前难度档（`currentDifficulty`）
2. 按 settings 的三类数量取题：基础题从 `requiresFiveStep=false` 池取，应用题从两步应用题池取，探测题从 `type='probe'` 池取
3. **不重复已答对的题**：排除 `masteryByQuestion` 中状态为 独立/稳定掌握 的题；池不足时允许重复并记录 `repeatCount`
4. 同日内生成的 `sessionId` 与题序固定，落 `dailyQuestIndex`，刷新不再重抽

### 难度自适应
`currentDifficulty = clamp(baseDifficulty + correctStreakBonus - wrongStreakPenalty, 1, 3)`，其中 `correctStreakBonus` 连续首次独立答对 +1（上限 +1），`wrongStreakPenalty` 连续提示后才答对 −1（下限 −1）。档位回落时写 `difficultyFallback` 事件。

### 五步状态机（仅 `requiresFiveStep` 题）
`KNOWN → UNKNOWN → RELATION → EXPRESSION → ANSWER`。每步绑定一个最小动作：KNOWN/UNKNOWN 为点选、RELATION 为单选关系式、EXPRESSION 为输入算式、ANSWER 为输入结果。步内答错不判负，只给该步提示，不扣进度——防止"五步变成新考场"。

### 掌握状态机
```
未掌握 ──首次独立答对──▶ 独立掌握
   │                        │
   └──提示后答对──▶ 提示后掌握 ──连续3次同题型独立答对──▶（题型级）稳定掌握
   └──看答案──────▶ 提示后掌握（不得计独立掌握）
```
注意"稳定掌握"是**题型级**而非题目级，避免同一题反复刷分。

### 解锁规则
`session-completed` → 发放：整组完成必得图鉴卡 + 徽章；首次独立答对数 ≥ 总题数的 60% 额外得"独立掌握徽章"。答错绝不回退：所有解锁事件为追加型（append-only），无 `unlock-revoked` 事件类型。

## 4. 页面与组件边界

| 视图 | 职责 | 关键组件 |
|---|---|---|
| `ProfileSelectView` | 选档案 + PIN 校验 | `ProfileCard`, `PinPad` |
| `HomeView` | 地图主体 + 任务卡浮层（已定方案 A） | `MapPanel`, `QuestCard`, `DepthScale`, `FishBackdrop`, `TabBar` |
| `QuestView` | 答题 + 五步 + 提示 | `StageHeader`, `QuizStage`, `FiveStepBar`, `StepBody`, `HintStack`, `Numpad` |
| `ObservationView` | 观察舱：真实影像 + 授权 3D 模型（按需切换）+ 知识卡 | `CreatureCanvas`, `KnowledgeCardList`, `SourceNote` |
| `BestiaryView` | 图鉴列表 + 四区筛选 | `BestiaryList`, `CreatureRow` |
| `MapView` | 四区地图 + 深度进度 | `ZoneMap`, `DepthMarker` |
| `MistakeBookView` | 按题型/掌握状态查错题 + 重练 | `MistakeList`, `MistakeFilter` |
| `ParentView` | 设置 + 报告 + PIN 重置 + 删档案 | `SettingsForm`, `ReportPanel`, `DangerZone` |
| `UnlockOverlay` | 解锁反馈动画 | `UnlockOverlay` |

**组件边界**：组件不包含业务规则判断（如"是否该解锁"），只调 `features/*` 的 composable；composable 调 `domain` 纯函数。`FishBackdrop` 与 `MapPanel` 用 SVG/CSS 动画实现，不引动画库（阶段一零额外依赖）。

## 5. 异常处理与降级

| 异常 | 处理 | 规格依据 |
|---|---|---|
| IndexedDB 不可用 | 切 `memoryFallback`，家长区常驻警示条 | offline-event-log §存储降级 |
| 影像加载失败 | 文字占位 + 知识卡照常，不阻塞解锁 | creature-bestiary §观察舱 |
| 高清题目池不足 | 相邻档位补齐 + `difficultyFallback` 事件 | daily-math-quest §难度覆盖 |
| PIN 连续错 5 次 | 锁定 60s，倒计时提示，不报具体错因 | child-profiles §PIN 切换 |
| 事件重放冲突 | 只追加不修改，重复写入按 eventId 去重 | offline-event-log §ID 幂等 |
| 删除档案 | 二次确认 + 输入档案昵称确认，删除该档案全部数据 | child-profiles §删除档案 |

## 6. 测试策略

TDD 三阶段贯穿每个 task（RED → GREEN → REFACTOR），domain 先行：

- **domain 单测（Vitest，Node 环境）**：`buildDailyQuest` 抽题确定性、难度 clamp、五步状态机迁移、掌握状态机迁移、事件去重、投影重建（重放 == 增量）、PIN 哈希与校验、解锁奖励计算、答案判等（数值/单位/算式）。**目标行覆盖 ≥ 80%，domain 层 ≥ 90%。**
- **组件测试（@vue/test-utils + jsdom）**：`FiveStepBar` 步进、`HintStack` 逐层展开、`Numpad` 输入与退格、`PinPad` 错误锁定、`QuestCard` 进度展示。
- **仓储测试**：IndexedDB 用 `fake-indexeddb` 模拟，覆盖写入、去重、版本迁移、降级切换。
- **内容测试**：题库 JSON schema 校验（必填字段、答案合法性、`similarQuestionIds` 存在性、提示固定 5 层、学名/深度/来源非空）。
- **验收**：阶段一手动验收清单（iOS Safari / Android Chrome 真机）+ 规格中每条 Scenario 对应至少一个自动化测试。


---

## Plan-time Gates

- TDD gate: PASS (18 tasks all contain RED/GREEN/REFACTOR)
- Commit format gate: PASS (18/18 use `[DSM1234] <type>: T<n> - <subject>`)
- Re-check at design complete: no new rules triggered (design 仅新增 test/README 相关 SOFT_RULE 合规策略，已于 Constitution Check 列出)

---

## 设计修订（上线后）

本节记录真机验收后对上述设计的**增量修订**，不改写前文的历史设计，只标注生效变更与依据。

1. **移除五步界面**（RETRO R27）：`QuestView` 只保留「题干 + 算式/答案输入 + 数字键盘」一条路径，删除 `FiveStepBar.vue` 与 `StepBody.vue`；`useQuizSession` 去掉 `fiveStepTemplates` / `fiveStepState(s)` / `stepFeedback` / `completeFiveStep` / `revisitFiveStep` / `resumeFiveStepProgress`。`submitAnswer` 判定统一走 `isCorrect`（数值 / 带单位 / 算式三路等价）。§4 组件边界表中的 `FiveStepBar` / `StepBody` 两项不再渲染。
2. **`fiveStepMachine` 保留、不再被界面使用**：它是已交付并有单测的纯领域能力（§3 状态机），文件头 JSDoc 已注明当前界面不使用（RETRO R27），供将来复用。
3. **难度数字上调**：题库规模由 60–80 调为 **200–400**，并把「每个 `QuizType × Difficulty` 组合至少 8 题」写成运行时约束（`data/content/schema.ts` 的 `QUESTION_BANK_LIMITS`）。C1 期间题库仍 72 题，故以 `ALLOW_LEGACY_QUESTION_CONTENT` 过渡豁免，C2 扩容后删除。
4. **相似题改为可选**：`similarQuestionIds` 空数组合法（订正流程遇到空相似题自动跳过）；一旦声明仍要求同题型、共享技能、答案表示一致（RETRO R27）。
5. **内容模型约束**：`Question.requiresFiveStep` / `steps` 保留字段但当前版本 MUST NOT 使用；严格口径下内容校验直接拒绝声明的五步字段（RETRO R27）。

> 与已冻结规格的冲突以 `specs/daily-math-quest/spec.md` 的 `## MODIFIED Requirements`（解题思路经分层提示提供）为准。
