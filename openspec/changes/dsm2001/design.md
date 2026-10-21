# DSM2001 设计：年级与兴趣个性化

> 状态：plan-in-progress ｜ 基线：第一版 `dsm1234` ｜ 规格：[proposal.md](proposal.md)、[specs/](specs/)

## Constitution Check

*GATE: Must pass before design phase. Re-check after design complete.*

**Triggered HARD_RULEs**:

- 无。仓库内没有 `content/enterprise-baseline.md`，无法加载企业 baseline；本设计不引入凭据、外部服务、数据库迁移或破坏性命令。
- 项目既有硬约束继续适用：PIN 只存哈希；日志与打印件不得输出 PIN/敏感信息；只允许原创或明确可商用的主题素材。

**Triggered SOFT_RULEs**:

- 无。提交信息按项目既有约定使用 `[DSM2001] <type>: ...`。

**Compliance Plan**:

- 新增数据全部留在本机 IndexedDB，不新增网络请求或账号体系。
- 打印件只包含虚拟昵称、年级、题目与答案，不包含 PIN、哈希、事件 ID。
- 主题素材必须带 `source`/`license`；未授权 IP 在内容校验阶段拒绝。
- 设计完成后重新扫描一次；无新增规则则在末尾标注。

## 1. 已冻结的产品决策

| 决策 | 结论 |
|---|---|
| 年级 | 1、2、3 年级；每个年级独立题库 |
| 主题 | 一个主主题；首发深海、恐龙、太空 |
| 主题作用 | 题目情境 + 图鉴收藏；地图抽象为通用四阶段 |
| 升级 | 完成 1 组每日任务推进 1 阶段；阶段跨主题保留，不倒退 |
| 题量 | 每年级 216 题，共 648 题；选择题约 1/3；应用题不少于 72 题/年级 |
| 默认题组 | 4 基础 + 4 应用 + 1 探测 |
| 素材 | 2D 为主；3D 仅作为已有素材增强 |
| 打印 | 当前筛选结果 + 原答案 + 正确答案 + 解析；答案单独成页 |
| 明确不做 | 4–6 年级、未授权 IP、全主题 3D、运行时 AI、云同步、整套主题换肤、判断题/填空题 |

## 2. 架构总览

继续沿用第一版分层：`views → router/routes → features → domain`，`data` 与 `domain` 平行；事件日志仍是唯一事实来源。

```text
家长区
  └─ Profile(grade, themeId) ──> 每日任务生成
                                  ├─ 按 grade 硬过滤题库
                                  ├─ 选择主题情境题（不足则同年级中性题）
                                  └─ session-started 记录 grade/theme 快照

孩子端
  ├─ 答题页：开放题 / 四选一
  ├─ 首页：今日任务 + 当前探索阶段
  ├─ 图鉴：当前主题的 8 个条目（按阶段解锁）
  └─ 错题本：筛选 + 打印路由

事件日志
  ├─ profile-created / profile-preferences-updated
  ├─ session-started（带 grade/theme 快照）
  ├─ answer-submitted（选择题存选项 ID）
  └─ session-completed（推进探索阶段）
```

设计立场：

1. **年级是硬边界**，主题是软偏好。主题题不足时只能回退到同年级中性题，不能回退到其他年级。
2. **主题不复制数学题**。题目保留一套数学结构，主题通过 `themeStories` 覆盖题干；避免 648 题 ×3 的维护量。
3. **阶段由完成事件推导**，不新增“经验值”事件；换主题不重置。
4. **旧数据可读**。第一版档案、事件、题库和深海图鉴在升级后可继续使用；新字段通过规范化函数补默认值。

## 3. 数据模型

### 3.1 档案与事件

```ts
export type Grade = 1 | 2 | 3
export type ThemeId = 'deep-sea' | 'dinosaur' | 'space'

export interface Profile {
  id: string
  nickname: string
  avatarId: string
  pinHash: string
  salt: string
  createdAt: number
  grade: Grade
  themeId: ThemeId
}
```

- 旧档案在读取时由 `normalizeProfile()` 补 `grade: 3, themeId: 'deep-sea'`；
- 新建/修改档案必须显式传值；
- `profile-created` 增加 `grade`/`themeId`（旧事件缺省为 3 年级/深海）；
- 新增 `profile-preferences-updated` 事件，载荷 `{ grade, themeId }`，用于审计和将来重建；档案表仍是读取入口，事件不替代档案表；
- `session-started` 增加 `grade`、`themeId`；旧事件缺失时由 `normalizeSessionSnapshot()` 补默认值；
- 历史题组、报告、错题一律读快照，不读档案最新值。

### 3.2 题目与答案

```ts
export type QuestionFormat = 'open' | 'choice'
export type ChoiceId = 'A' | 'B' | 'C' | 'D'

export interface ChoiceOption {
  id: ChoiceId
  label: string
}

export interface Answer {
  /** 数值答案；选择题为占位 0，判题时由 optionId 分支接管。 */
  value: number
  unit?: string
  expression?: string
  /** 选择题的正确选项；开放题不得声明。 */
  optionId?: ChoiceId
}

export interface Question {
  // ...第一版字段
  grade: Grade
  format: QuestionFormat
  options?: ChoiceOption[]
  themeStories?: Partial<Record<ThemeId, { title: string; body: string }>>
  
}
```

- 保留第一版 `Answer` 形状，新增可选 `optionId`，避免一次性重写所有判题调用；选择题的 `value` 固定为 0，判题只看 `optionId`；
- `format: 'choice'` 必须有恰好 4 个选项、唯一正确选项；开放题的 `optionId` 必须为空；`themeStories` 只能出现三个合法主题；
- `QuizType` 增加 `number-sense`（“数的认识”），仅供 1 年级题库使用；2、3 年级不生成该类型；
- 题目的 `story` 保留为中性题干；展示时用 `resolveStory(question, themeId)`，有主题故事则覆盖标题与题干，否则用中性题干。

题库文件按年级拆分：`src/data/content/questionBank.grade1.json`、`grade2.json`、`grade3.json`，由 `index.ts` 合并并分别校验；这样每个年级可以独立生成、独立验收，不会因为另一个年级未完成而阻塞。

### 3.3 主题包

新增 `src/data/content/themePacks.json`：

```ts
interface ThemeEntry {
  id: string
  stage: 1 | 2 | 3 | 4
  name: string
  summary: string
  image: { ref: string; alt: string; creditSummary: string; license: string; sourceUrl: string }
  knowledgeCards: string[]
  sources: string[]
  modelRef?: string
}

interface ThemePack {
  id: ThemeId
  name: string
  stageNames: [string, string, string, string]
  entries: ThemeEntry[]
}
```

- 每个主题 8 个条目，`stage` 各 2 个；
- 深海主题可由 `CREATURE_BANK` 适配生成，避免复制第一版的学名、深度、模型与许可；适配器输出同一 `ThemeEntry` 形状；
- 恐龙/太空使用内嵌条目与 2D 图片；
- 深海的 4 个旧条目保留原 `creatureRef`，新增 4 个条目使用 2D 素材；
- 主题素材目录：`public/themes/<theme>/<ref>.webp`；许可文件与来源写在 JSON。

### 3.4 错题投影

`MistakeEntry` 增加：

```ts
readonly lastWrongAnswer?: string
readonly lastWrongAt?: number | null
```

- 从最近的 `answer-submitted(correct: false)` 取 `submitted`；
- 若只有 `answer-revealed`，`lastWrongAnswer` 为 `undefined`，打印显示“未作答（看过答案）”；
- 选择题的 `submitted` 存 `A/B/C/D`，打印时映射选项文本。

## 4. 关键流程

### 4.1 建档与迁移

- `ProfileManageSection` 表单新增年级下拉（1/2/3）与主题下拉（深海/恐龙/太空）；
- `useParentPanel.createProfile` 校验并写入；
- `profileRepo.list/get` 统一走 `normalizeProfile`；第一版记录补默认值，不重写存储，读取即兼容；
- 家长区新增“学习设置”中的年级/主题编辑，保存时更新档案并追加 `profile-preferences-updated`；
- 旧档案第一次写设置时自然升级为显式字段。

### 4.2 每日任务

`buildDailyQuest` 新入参：

```ts
interface DailyQuestInput {
  // ...第一版
  grade: Grade
  themeId: ThemeId
}
```

顺序：

1. 从题库按 `grade` 过滤（硬边界）；
2. 按 `category` 切池；
3. 应用题/探测题优先选 `themeStories[themeId]` 存在的题，保证默认题组至少 2 道主题题；
4. 主题题不足时用同年级中性题补齐；
5. 按 4/4/1 默认配比生成；家长设置仍可覆盖；
6. `session-started` 写入 `grade`、`themeId`；
7. 同年级内降档/重复，绝不跨年级。

### 4.3 选择题

- `QuizStage` 根据 `question.format` 分支：`open` 保留数字键盘；`choice` 渲染 4 个按钮；
- 选择项直接写入 `draft` 为 `A/B/C/D`，提交按钮在选中后才可用；
- `isCorrect` 增加 `answer.kind === 'choice'` 分支，比较 `optionId`；
- 事件仍写 `submitted: 'A'`；错题本/打印映射选项文本；
- 提示、看答案、掌握状态、奖励逻辑不变。

### 4.4 主题收藏与阶段

- `useCollection` 从 `themePacks` 读取当前主题的 8 个条目；
- 阶段 = `min(已完成题组数, 4)`，初始 0；完成 1 组 → 1，依次到 4；
- 阶段 0 时全部条目为剪影；阶段 N 解锁 `stage <= N` 的条目；
- 切换主题只换条目，不重置阶段；
- 深海旧解锁数据迁移：旧 `bestiaryUnlock` 中的生物映射到条目 ID，阶段按已完成题组数计算；旧条目保留解锁；
- 首页/地图的“深海四区”改为“探索四阶段”，阶段名来自主题包；深海阶段名保持“暮光区/深海区/深渊区/海沟区”，其他主题使用自己的阶段名。

### 4.5 错题打印

- 错题本增加“打印错题”按钮，跳转 `/mistakes/print?type=<type>&mastery=<level>`；
- 打印页复用 `useMistakeBook`，读取同一筛选；
- 题目区按题排列，答案区从新页开始；
- 无网络依赖，调用 `window.print()`；
- 题目在题库中不存在时跳过并显示跳过数量；
- 打印样式使用 `@media print`，白底黑字，隐藏导航/按钮，避免题目块跨页。

## 5. 兼容与迁移

| 对象 | 旧数据 | 处理 |
|---|---|---|
| Profile | 无 grade/theme | `normalizeProfile` 补 `3` / `deep-sea` |
| Question | 无 grade/format，answer 无 kind | `normalizeQuestion` 补 `3` / `open` / numeric/expression |
| SessionStartedEvent | 无 grade/theme | `normalizeSessionSnapshot` 补 `3` / `deep-sea` |
| 深海图鉴 | 4 个 creature unlock | 映射到主题条目，保留解锁；阶段由完成组数推导 |
| 错题 | 无 lastWrongAnswer | 重放时从 answer 事件补；没有则显示未作答 |
| 题库 | 216 道三年级题 | 保留并补 grade；新增 1/2 年级与选择题 |

不新增 IndexedDB 对象库；沿用现有 stores。只改记录形状，读取时规范化，写入新记录时带新字段。

## 6. 测试与验收

- **domain 单测**：年级过滤、主题题选择与回退、选择题判等、阶段推进、旧数据规范化、错题最后答案投影。
- **content 校验**：每年级 216 题；1 年级无乘除；选择题 4 选项唯一正确；应用题 ≥72；跨年级相似题拒绝；主题条目 3×8、许可齐全。
- **组件测试**：建档表单、选择题 UI、图鉴阶段、打印页内容与分页标记。
- **回归**：第一版 768 用例全部通过；新增用例覆盖 v2；覆盖率不低于 80%。
- **浏览器验收**：1 年级/恐龙主题建档 → 领题 → 选择题 → 完成 → 解锁第 1 阶段 → 切换太空主题阶段保留 → 错题筛选打印预览。

## 7. 交付切片

1. **切片 A（基础）**：题目/档案数据模型 + 1–3 年级题库 + 选择题 + 按年级组题。完成后即使不做主题，也能保证年级匹配。
2. **切片 B（个性化）**：档案年级/主题 UI + 主题包 + 通用阶段 + 图鉴改造。
3. **切片 C（打印）**：错题原答案投影 + 打印路由/样式（可与 B 并行）。
4. **切片 D（收尾）**：旧数据迁移、全量回归、家长手册 v2、浏览器验收。

## 8. 风险与待验证点

- **内容量是主风险**：648 题 + 24 个收藏条目 + 2D 素材，生成器只能解决结构，不能替代逐题审校；1 年级题库尤其要人工检查超纲。
- **1 年级新增 `number-sense`**：会进入题型标签、报告和筛选；需要同步所有 `QuizType` 穷举处，遗漏会在编译或测试暴露。
- **阶段速度**：1 组/阶段意味着 4 组到顶；如果家长觉得太快，可在设计评审时改为 2 组/阶段，只改一个常量。
- **打印分页**：不同浏览器对 `@media print` 的分页支持有差异；以 Chromium/Safari 截图验收，题目块使用 `break-inside: avoid`。
- **2D 素材许可**：恐龙/太空图片必须逐张登记来源与许可；不得用“网上找的图”。

## 9. Constitution Check 复核

设计完成后复核：未新增外部服务、凭据或破坏性操作；打印不输出 PIN；主题素材要求许可字段。无新增 HARD/SOFT 规则触发。

Re-check at design complete: no new rules triggered.

TDD gate: PASS (12 tasks all contain RED/GREEN/REFACTOR)
