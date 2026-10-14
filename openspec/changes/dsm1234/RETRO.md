# RETRO — 执行期偏离与决策记录

本文记录 `/sdd-apply` 执行过程中发现的 spec/design 矛盾、范围调整与需要用户决策的事项。

---

## R1. GitHub Pages 部署 + 最小可玩闭环（范围调整）

**发现时间**：T8 待实现时，用户提出验收要求「手机微信上点击链接或者手机浏览器打开链接就可以玩」。

**原计划**：按 tasks.md 顺序 T1→T18 全做完再一次部署。

**调整后**：
1. 部署目标选 **GitHub Pages**（仓库已是 GitHub: `wangdonghello/deep-sea-math`）。已知限制：github.io 域名在国内网络访问不稳、微信内可能被拦截；若要在微信内直接打开，需国内云主机 + 已备案域名。
2. 界面部分改为**最小可玩闭环优先**：建档/PIN → 首页(地图+任务卡) → 答题(五步+提示) → 解锁 → 观察舱，共 5 个页面。错题本 / 家长区 / 图鉴列表后续补。
3. 为支撑闭环，执行顺序调整为 **T9（仓储）→ T10（主题）→ T11（档案）→ T12（首页）→ T13（答题）→ T14（图鉴+观察舱）**，T15/T16/T17/T18 随后。

**影响的能力域**：不改变任何 spec/design 文本，只改变 tasks.md 的执行顺序与首版交付边界。

**决策人**：用户（通过 AskUserQuestion 确认部署目标为 GitHub Pages、页面策略为最小可玩闭环）。

**待办**：
- [ ] 闭环可玩后配置 GitHub Pages（`vite.config.ts` 的 `base` 需设为 `/<repo>/`，并加 GitHub Actions workflow 或 `gh-pages` 分支部署）
- [ ] T8（题库与生物内容）重新派发——它比 UI task 更早，但首次派发未产出任何文件（worktree 干净、无 commit），需拆分为「生物条目 + schema」与「题库」两个工作流后 squash 成一个 commit

---

## R2. T5「掌握等级只升不降」的规格歧义（已裁决：可接受）

**矛盾点**：`specs/daily-math-quest/spec.md` §掌握状态判定 写「使用提示后答对置为提示后掌握」，字面可解读为**无条件置位**（即已独立掌握的题，重复练习用提示后答对应降级为提示后掌握）。但 `design.md` §3 的掌握状态机图**只有三条向上箭头，无任何下行箭头**。

**裁决**：按 design（冻结产物、规格的细化、且明令不可修改）实现为**只升不降**。理由：
1. design §3 图无下行箭头，且 spec 同节规定「重复练习同一已掌握题不重复计入新题正确率」，即已掌握题的重复练习本就不应改变状态
2. 与 spec §通关、订正与奖励「答错绝不回退」的追加型语义一致
3. 若产品方希望降级，须走 design 修订流程（Constitution Amendment Procedure），不是实现单向偏离

**遗留**：若产品方后续确认要降级，需修改 design.md §3 并相应改 `masteryStateMachine.ts` 的等级收敛逻辑。

---

## R3. T5 Finding 1：`correction-done` 归零连击的口径漂移（已修复）

**矛盾点**：`masteryStateMachine.ts` 中 `correction-done` 归零 `independentStreak`，而 T4 `difficulty.ts` 中 `correction-done` 被跳过（不参与连击）。两侧注释互相宣称"刻意一致"，实际不一致。Task 6 的 `replayProjections` 会同时消费这两套"连续独立答对"定义，正面相撞。

**修复**：采用方案 A——新建 `src/domain/quiz/streakSignal.ts` 的 `classifyStreakSignal(event): 'independent'|'hinted'|'breaker'|'ignored'` 作为唯一真源，`masteryStateMachine` 与 `difficulty` 都委托它；`correction-done` 统一为 `breaker`。加 `tests/domain/quiz/streakConsistency.test.ts` 对拍。

**说明**：breaker 与 ignored 在规整事件流中等价（同题答错已先归零），breaker 只在乱序/单条重放时更稳。若 Task 13 的真实事件顺序不同（订正流程不产生先行答错事件），以对拍测试为准绳复核。

---

## R4. T7 自行裁量：`answer-revealed` 未豁免完成判定（待产品确认）

**矛盾点**：spec §直接看答案 只规定「该题 MUST NOT 计为独立掌握、不生成完整掌握奖励」，未说明看答案能否替代「完成整组」的作答要求。T7 实现裁量为：**看答案不算完成该题**（完成判定要求每题都有 `answer-submitted`）。

**影响**：若产品希望「看答案即可视为已学完该题」，需把 T7 `rewardGrant.ts` 的完成条件放宽为 `answer-submitted || answer-revealed`。

**状态**：已在 T7 报告中披露，待产品方确认。

---

## R5. T6 遗留：`dailyQuestIndex` 用 UTC 日界（已知取舍）

**问题**：跨时区或孩子恰在 UTC 零点前后答题时，「当日」会与设备本地日期差一天。

**取舍理由**（已写入 JSDoc）：换设备/换时区必须仍重放出同一结果，否则幂等同步会错。

**待办**：若产品要求按本地时区，需重新设计（注意与阶段二幂等同步的冲突）。

---

## R6. T6 遗留：`masteryByTopic` 依赖注入的题型表（接入时需确认）

**问题**：`DomainEvent` 不带 `Question.type`，题型级轨道必须由调用方传 `questionTypeById` 给 `replayProjections`。若 T9/T16 调用方忘传，题型级投影会静默为空（单向失败，不污染题目轨，但无告警）。

**待办**：T12/T16 接线时确认题库侧能提供该表（T8 的 `questionBank.json` 可派生）。

---

## R7. T10 质量审查的次要项（不阻塞，待后续 task 处理）

| 位置 | 问题 | 处理时点 |
|---|---|---|
| `FishBackdrop.vue:43` | `count` 无上限（传入 10000 会掉帧，影响"孩子用家长旧手机"场景） | T12 装配首页时 clamp 上限 |
| `tests/features/theme/contrast.test.ts:121` | `--ds-accent-text` 是文字前景色，却放在"按钮底色"列表断言，语义误导（实测 9.84/7.47/11.41 均达标，无漏测） | T12 消费 token 时拆成独立用例 |
| `contrast.test.ts:130-145` | 玻璃卡片场景只合成到 `--ds-bg-shallow`，未覆盖半透明卡片叠深色背景 × accent-text 组合 | T12/T13 用玻璃卡片时补 |
| `contrastRatio.ts:39` | 拒绝 `color-mix()`/`oklch()` 是隐性陷阱，合法新语法接入会 TypeError | T18 收尾时补 JSDoc 显式声明写法约束 |
| `theme.css` | 约 25 个 token（`--ds-font-size-*` / `--ds-space-*` / `--ds-radius-*` / `--ds-motion-*` / `--ds-glass-*`）暂无消费者 | T12/T13 消费时标注"Task 12/13 预留" |

---

## R8. T11 实现者披露的裁决结果

| # | 披露 | 裁决 |
|---|---|---|
| 1 | `ProfileStore` 窄接口（因 T9 并行开发、本 worktree 无 profileRepo，故自定义最小接口 + 内存 fake） | **可接受**；`list()`/`verify()` 与 T9 `data/README.md` 约束兼容。已由 R9 的适配器方案收口 |
| 2 | 未引 T10 主题/FishBackdrop，用语义化 class | **可接受**，T10 合并后自然生效，零返工 |
| 3 | `pushDigit` 不强校验数字字符 | **构成偏离（API 契约完整性）**，已修：`useProfileSelect.ts` 加 `if (!/^[0-9]$/.test(digit)) return` 并补测试（含全角数字） |
| 4 | 60 秒锁定仅内存态，刷新归零 | **可接受，不属本 task 范畴**。规格原文只要求"连续 5 次错误后锁定 60 秒"，未要求跨刷新持久化；且本地哈希+盐的威胁模型下持久化收益有限。已在 `usePinLock.ts` JSDoc 记录局限（时间前跳会尽早解锁、后跳经 `Math.max(0,…)` 收敛，两方向均不拒绝服务），T17 跟进持久化 |
| 5 | `redact()` 放新建 `src/shared/` 层 | **可接受**。`shared` 定位是"不属于任何功能域、不得含业务规则"的横切层，T16 家长区确定复用；单一职责已核实，无全局单例 |

**同类遗留（已记入 R9）**：`load()` 失败在 UI 中不可见 → 已补"列表为空且出错"的全局错误段；"真没档案"vs"读失败"的语义区分需新状态位，留 T17。

---

## R9. T11 与 T9 并行开发：tasks.md Step GREEN 的"接入 profileRepo"在 T11 完成时不成立

**发现时间**：T11 代码质量审查（合并前）。

**矛盾点**：tasks.md Task 11 Step GREEN 勾选的是「接入 Task 2 的 hashPin/verifyPin
与 Task 9 的 profileRepo」。但 T11 与 T9 是**并行开发**的两个 worktree —— T11 完成并
勾选时，`src/data/repositories/profileRepo.ts` 尚不存在， T11 侧无从"接入"。该勾选
描述的是**合并后**的状态，不是 T11 交付时的状态。

需要说明的是：这不是"把没做的勾成做了"，而是**任务描述本身**对并行开发时序的误判
（T9 完成时 T11 已勾选；T11 完成时 T9 未合并）。Task 2 的接入是真实完成的（适配器
内调 `verifyPin`，有单测对拍）；Task 9 的接入按设计推迟到装配期。

**修复（适配器方案，已把承诺变成事实）**：新增
`src/features/profileSelect/createProfileSelectStore.ts`，以**结构式**最小面
（`get` / `list`，不 import T9 文件）接收 T9 的 `ProfileRepo`，组合出
`ProfileStore`：

- `list()` 就地投影为 `ProfileSummary`，`pinHash` / `salt` 不外泄
- `verify()` 走 `repo.get(id)` + Task 2 的 `verifyPin`（一条读，不把全部档案的
  盐与哈希拉进内存）
- 档案不存在（T9 的 `get` 返回 `undefined`）与 PIN 错误合并为同一个 `false`

之所以不在 T9 侧加 `verify()`：PIN 比对属 `domain/crypto` 职责，仓储只该存取。
适配器有 5 条单测（含 `get` 返回 `undefined` 的约定、与 `hashPin`/`verifyPin`
对拍、不注入 digest 的默认分支）。

**待办（T17 装配时一行接线）**：
```ts
useProfileSelect({ store: createProfileSelectStore(profileRepo) })
```

**同类遗留（审查提出，本 task 按裁定未做）**：`useProfileSelect` 的 `load()` 失败在
UI 中不可见——错误经 `PinPad` 渲染，而 `PinPad` 的前提 `selectedProfile !== null` 在
列表为空时不成立，用户只会看到"还没有档案，请家长去新建"，把存储故障误导成建档引导。
本 task 只补了"列表为空且出错"时的全局错误段（复用 `RETRY_MESSAGE`，未引入新状态位，
因规格未定义该场景文案）；若要区分"真没档案"与"读失败"两种语义，需新增状态位，
建议 T17 或后续 task 处理。

---

## R10. T9 事项：同毫秒事件排序语义断层（已修）与接缝对拍

**矛盾点**：T6 的 `replayProjections` 刻意不按 `occurredAt` 重排，其契约是"调用方传入顺序即写入顺序"。而 T9 仓储层按 `occurredAt` 排序交出去。同毫秒事件下，`append()` 返回到达序与 `listByProfile` 返回的 eventId 字典序**不同序** → 重放与增量结果会分叉。若不修，T11–T16 接入重放路径时会把「增量 vs 重建」的口径分叉固化进代码。

**修复（方案 A，不动规格、不改 `src/domain/**`）**：新增 `eventOrder` 台账库（`autoIncrement` 主键），把"第几条写入"显式落库。

- `listByProfile` 改为显式双键：`occurredAt` 升序 → 同刻按台账 `rank` 升序
- `append()` 在同一事务里写 `events` + 台账，台账条目按本批次 `incoming` 先后追加
- `append` 的 `@returns` 契约修正为「与 `listByProfile` **逐条一致**」（原承诺"顺序一致"属实但不精确），并补"返回值可能少于 `incoming` 长度（先到者胜去重）"

**测试证据**：同毫秒多条事件按写入序返回（事件 ID 取字典序与写入序相反的 `z3/z2/z1`）、`append` 返回值与 `listByProfile` 逐条一致、跨批次后到事件排在同刻先到事件之后、关连接重开后台账次序不回退；**接缝对拍**「仓储返回顺序喂给重放 == 写入序列喂给重放」（T9 worktree 可同时 import T6 与 T9，故在本地完成）。

**变异验证**：把 `orderEvents` 的同刻比较退化为 `eventId.localeCompare` 后 5 条测试立刻红。

**附带修复**：
- `openDb` 加 `blocked` 处理（`OPEN_BLOCKED_TIMEOUT_MS = 3000`）：另一标签页持有旧版本连接不关时超时 reject 明确错误，由 `resolveStorage` 捕获降级，不再无限挂起；放弃时关掉迟到连接
- `tests/data/db.test.ts` 的失实注释重写（原声称"`idb` 代理把方法 `this` 指向代理对象"属未验证归因）
- `DB_VERSION` 现为 **3**（1→2 引入四库、2→3 引入台账）；JSDoc 已说明"数字版本号 ≠ 表意版本 v1"及新增库必须跳版本的原因
- `src/data` 分支覆盖 86.66% → 97.14%

**已知取舍**：台账随事件数线性增长（已用 `removeByProfile` 同步清理）；台账与事件分两次 `getAll`（`Promise.all` 并发），无循环内查询。

---

## R11. T13 类型遗漏 `revealedAnswer`（已补正）

**问题**：此前模型类型 `AnswerRevealedEvent` 漏记 `hint-and-correction` spec §直接看答案要求的 `revealedAnswer: true` 字段。

**修复**：将字段补为必填字面量类型，并在 T13 事件和全仓测试夹具中写入 `true`；同步修正曾断言该字段不存在的测试。

---

## R12. T4/T7 生产事件 ID 不符合 UUID 约束（已修）

**问题**：T4 `difficulty-fallback` 与 T7 `unlock-granted` 曾以业务字段拼接 `eventId`，不满足 `offline-event-log` 对所有事件 ID 为全局唯一 UUID 的要求。

**修复**：两类事件现在都通过注入的 ID 发生器生成；未注入时使用 Web Crypto UUID。T4 组题会检测 session ID、`session-started` 与回落事件 ID 的重复并明确报错；T13 将 `unlockEventIdFactory` 接到会话共用的 `idGenerator`。

**确定性边界**：纯奖励规则与奖励选择仍对相同输入确定；只有事件 ID 是随机源，测试/重放需要稳定输出时可注入确定性 UUID。

**审计备注**：现有 `logicalEventKey` 的 `unlock-granted` 去重键是 `kind + targetId`，未包含 `profileId`。本次按规格衍生逻辑保持不变；该键语义留待独立审查，不扩入本修复。

## R13. T8 首次规格审查：来源、相似题与运行时覆盖（已修复）

**发现**：数学题来源使用宽泛课程首页或不相关物种页，无法佐证具体技能；深海蜥鱼和宝石鱿鱼引用的 Smithsonian slideshow 宽泛且返回 403，无法核验物种水深；Johnson 鮟鱇鱼也需区分 FishBase 物种级范围与 MBARI 观察；部分相似题跨越了运算技能；运行时题库校验只要求非空。

**修复**：按题型/运算替换为对应 Common Core 三年级具体标准页；生物引用改用 FishBase、MBARI 与 OBIS 物种分类/出现记录，并区分数据库观测范围与完整分布、区分 Johnson 的物种记录范围与 MBARI 约 580 米观察；为题目补精确 `skill-*` 标签，仅保留同题型、同技能相似链接，不适合的题目使用空链接数组。

**校验**：运行时强制 60–80 题及所有题型×难度组合覆盖，并拒绝跨题型/无共享技能标签的相似链接；测试逐桶对拍索引及来源映射。事实真实性仍由引用来源支撑，schema 不声称自动核实生物事实。

---

## R14. T8 第二轮内容复核：标准映射、观测范围与相似题表示（已修复）

**发现**：部分 Core Standards 具体小节 URL 重定向 404，且有技能映射错误（加减 missing-part 误引 OA.4、长度/距离误引 MD.2）；OBIS occurrence 水深计数和范围把无效/零深度或不同数据集口径混入；相似题测试核对了答案表示，但运行时 validator 未约束答案单位与表达式形状。MBARI 深海鮟鱇页是 Lophiiformes 类群页，当前可见内容不能确认约 580 米为 Johnson 鮟鱇鱼单种观测。

**修复**：标准来源改为可访问 NBT/OA/MD domain pages，并用 `standard:*` 与 `skill-*` 标签按技能映射；相似题仅保留同题型、共享精确技能且答案单位和表达式 presence 一致的链接，不适配者置空。来源 validator 检查 HTTP(S)、技能对应的课程域页及物种级来源标识，但不声称自动证明事实真实性。

**证据范围**：保留 FishBase 的 *Melanocetus johnsonii* 物种范围 100–4,500 米（通常 100–1,500 米），仅将 MBARI 的 300–4,000 米标作类群概述并移除未能由当前页确认的 580 米单种观察；Bathysaurus OBIS 共 795 条，剔除 2 条 depth=0 后 587 条正水深记录，222.5–3,516 米；Histioteuthis 共 341 条，277 条正水深记录，15.5–4,276 米。数据库记录范围不等于物种完整分布。

---

## R15. T8 第三轮复核：可访问标准域页、物种体型与观测口径（已修复）

**发现**：Core Standards 小节 URL（如 `/3/OA/4/`、`/3/MD/2/`）返回 404，只有 NBT/OA/MD 领域页实测为 200；加减法缺项误标 OA.4、长度/距离误配质量或液体体积标准。OBIS 观测条目计数和范围须按正水深记录口径；T14 观察舱缺少带来源的体型字段。

**修复**：题目保留精确 `standard:*` 语义标签，来源只链接可访问的领域页，并按加减、多位数运算、两步应用、未知关系、时间/质量/长度距离及数列/数据分别校验映射。相似题链接清除重复项，测试与运行时校验均拒绝重复 ID。

**物种与体型口径**：Johnson 范围采用 FishBase 单种页 100–4,500 米（通常 100–1,500 米）；MBARI 的 300–4,000 米仅作为鮟鱇鱼类群概述，移除所有 580 米说法。Bathysaurus 记录为 587 条正水深 occurrence、约 223–3,516 米；Histioteuthis 为 277 条、15.5–4,276 米。OBIS 范围仅是当前数据库已记录 occurrence，不代表完整分布或生理极限。4 个条目新增直接引用的体型数据，并区分总长 TL、标准体长 SL 与外套膜长 ML。

---

## R16. 家长区补齐首次建档闭环（授权范围扩展）

**发现时间**：T16 实现时复核 T11 首次打开路径。

**问题**：T11 的空档案页只能提示“去家长区新建”，但 T16 原任务只覆盖设置、报告、重置 PIN 与删除，没有建档表单。全新部署没有任何档案，孩子无法从首次打开进入游戏；这也与 `specs/child-profiles/spec.md` §档案创建与 PIN 切换的“系统 SHALL 支持在本地创建多个孩子档案”不一致。

**调整**：在 `ParentView` 增加最小建档表单（虚拟昵称、头像、4 位 PIN 与确认）。PIN 仅短暂存在于输入态，保存前使用每档随机 salt 与 `hashPin`；先保存 Profile，再追加 `profile-created` 事件。成功后提示返回档案选择页。表单只收集昵称与头像，不收集真实姓名、学校、电话或位置；家长区文案明确其仅在本机管理、不承诺家长身份验证。未改 T11 页面或路由，返回导航由页面事件交给 T17 装配。

**Task/API 接缝**：本 worktree HEAD `1d570ba` 的 `SettingsRepo` 暂无 `remove(profileId)`，`BestiaryRepo` 暴露 `load/save/clear`，与本任务说明所列 `settings.remove` / `bestiary.remove` 不同。按范围约束未改 `src/data/**`；`ParentStore` 按指定的删除能力建模，T17/合并接线时必须确认仓储 API 已补齐或提供等价适配，不能把覆盖默认设置冒充为删除。当前组件测试以完整窄接口 fake 验证跨库顺序及部分失败态。

---

## R17. T15 错题本稳定掌握筛选与失败日志契约（已修）

**发现**：规格审查发现 View 越过 feature 边界直接执行事件重放/筛选，且将完整 `Error` 交给通用 `redact()`；其保留 `message`/`stack`，message 中的凭据可能进入日志。另，`stable` 只存在 `masteryByTopic`，按题目级状态筛选会漏掉所有稳定掌握项。

**裁决与修复**：把加载、档案隔离、投影、筛选、重练元数据及错误状态移入 `useMistakeBook`。错题模型分别保留 `questionMasteryLevel` 与 `topicMasteryLevel`；`stable` 按题型轨匹配，其余状态按单题轨匹配，列表和筛选标签明确标示来源。失败日志只输出固定事件及 `errorType: 'read-failed'`，不读取或记录异常文本。

**验证**：以三道同题型不同题独立答对后、其中一题成为错题的真实事件验证 topic=`stable`、question=`independent`；另覆盖混档事件隔离及 `Error('token=secret-123')` 不泄漏。

---

---

## R18. T16 审查发现 `SettingsRepo` 缺删除能力（已补齐）

**问题**：T16 规格审查发现 `ParentStore` 需要的删除能力在 T9 仓储中不完整：
- `SettingsRepo` 只有 `get`/`save`，没有 `remove`。不能用「写回默认值」冒充删除
  ——那会在库里留下属于已删档案的孤立行，而 `get()` 无记录即回落默认值会让
  删档操作看起来成功，实际没清干净关联数据（spec `child-profiles` §删除档案）。
- `BestiaryRepo` 的删除方法叫 `clear` 而非 `remove`，语义等价（投影缓存可重建），
  仅命名差异，由装配层适配。

**修复**：为 `SettingsRepo` 接口、IndexedDB 实现与内存态实现补齐
`remove(profileId)`，并补测试锁三件事：remove 后读回落默认值、库里真无该行
（非"被改回默认值的孤儿记录"）、不影响其他档案；remove 未写过的档案幂等不抛错。

**后续**：T16 侧 `createParentStore(storage)` 负责把 `clear` 适配为 `remove`，
`settings.remove` 现在可直接使用。原计划中"适配器暴露 settings 删除缺失"的
降级路径不再需要。

---

## R19. T16 装配适配器：门面→`ParentStore` 接线与两处半合规占位

**适配器接线**：新增 `src/features/parentPanel/createParentStore.ts`，把 T9 的
`StorageFacade` 适配成家长区窄接口 `ParentStore`（T17 装配一行接上）：

| ParentStore         | StorageFacade               | 说明                                      |
|---------------------|-----------------------------|-------------------------------------------|
| `profiles.*`        | `profiles.*`                | 直通                                      |
| `events.*`          | `events.*`                  | 直通                                      |
| `settings.*`        | `settings.*`                | 直通（R18 已补 `settings.remove`）        |
| `bestiary.remove`   | `bestiary.clear`            | 语义等价：图鉴投影是可重建缓存，清缓存即删该行，解锁事实在事件日志不受影响 |
| `degraded(_Reason)` | `degraded(_Reason)`         | 透传，驱动警示条                           |

`tests/features/parentPanel/createParentStore.test.ts` 用 fake-indexeddb 驱动
真实 `resolveStorage` 门面锁接线：四仓储写后读回、remove 后消失；
`settings.remove` 后**重开门面**仍回落默认值（排除"写回默认值冒充删除"的
孤立行路径）；降级内存态下 `degraded/degradedReason` 透传且同样可用。

**两处 T16 审查的半合规项（本 task 只做诚实占位，不冒充已生效）**：

1. `maxMinutes` 无消费方：`SettingsForm` 增加说明"时长上限将用于首页预估用时
   与后续答题计时；当前阶段先保存设置。"——修改与保存照常可用，但不宣称已
   参与首页估算或答题计时。
2. 题型掌握分布在缺 `questionTypeById` 时静默为 0：`ParentReport` 增加
   `topicMasteryAvailable`（`useParentPanel` 依据注入的题型表是否非空置位并
   暴露），`ReportPanel` 在该 flag 为假时显示"题型掌握分布暂不可用"占位而
   不是一排假 0；flag 缺省视为可用，保持旧夹具/旧装配行为。

**T17 待办（不在本 task 范围）**：
- 真实 `questionTypeById` 注入：从 Task 8 题库索引按 `questionId → QuizType`
  建表，装配进 `useParentPanel` 选项与 `ParentView` props（T17 路由装配时）。
- `maxMinutes` 消费：Task 12/13 的首页预估用时与答题计时接入该设置；当前
  仅持久化。

---

## R20. T8 内容质量审查：提示链第五层、相似题答案重复与分层递进（已修）

**发现（第三轮·内容质量，规格审查查不到的那一类）**：
- **C1（高）**：72/72 题的 `hints[4]` 都不是 spec 规定的「讲解示例」层；其中 7 道（q014/q020/q022/q025/q035/q036/q070）在提示链内直接写出最终答案，把"用提示"与"直接看答案"的降级分界抹平。另有 4 道只剩单位提醒、32 道是纯校验指令（零信息量）。
- **C2**：两对相似题答案完全相同（q052↔q054 都 45、q065↔q066 都 30），订正后"再练一道差不多的"变成重做同一道；另有 q063/q067 同序列未互链。
- **C3**：13 题 `hints[0]` 已含题干数字（第 1 层本该是审题提醒）；98 个薄层含 10 组逐字重复。
- **G1**：`q034` 是全库唯一"基础题带 steps"的题，而 schema 对此无约束。
- **G2**：`assertValidQuestionBank` 只查 `hints.length === 5` 与非空，字符串语义完全无约束，因此 C1 不可能被测试发现。

**修复**：
- `schema.ts` 新增两道运行时约束：`hints[4]` 不得复用答案值或答案算式的任一**完整数字**（按数字边界比对，`13` 不会误撞 `130`）、`hints[4]` 至少 6 字符；以及 `steps` 只有 `requiresFiveStep` 题可声明（否则抛错）。三条各有负测。
- `hints[4]` 全部改写为"另给一组同技能数字走一遍完整过程"的讲解示例句式；`hints[0]` 清空题干数字；逐字重复的 10 组薄层改写措辞。
- 相似题答案去重：q054→39、q066→38、q067→20；schema 增加"双向互指的相似题答案值 MUST 不同"约束及负测。
- q034 保留 `basic` 槽位但关掉五步引导（不转 applied，避免 basic 槽位需补题），`two-step-app/3/basic` 仍有 q033 兜底。

**未做（独立内容需求，走后续 change）**：21/23 技能是单形状模板、d1/d2 有 5 个空槽技能、q001 是全库唯一算式型答案。扩充题库多样性属内容增量，不阻塞收口。

---

## R21. T18 收尾：README 重写与四处过期占位文档的纠正

**RED→GREEN**：`tests/readme.test.ts` 把"新人照着 README 能不能把项目跑起来"变成
断言——章节结构（七个必备 `##`）、围栏命令块可解析且含 `npm install` / `npm run dev`、
配置说明覆盖 `VITE_BASE` 与 GitHub Pages、以及 `src/README.md` 列出六层与依赖方向。
**只锁结构不锁措辞**：README 内容会持续演进，锁文案只会逼人每次改文档都改测试。

**根 README 从 23 行"设计规格目录说明"重写为七节**：项目简介 / 快速开始 / 目录分层 /
配置说明 / 使用示例 / 阶段一范围与后续阶段 / 测试。三处此前文档里没有的事实被写实：

1. **依赖方向不是四层而是六层**：真实结构是
   `views → router/routes → features → domain`，`data` 与 `domain` 平级，
   外加 `app/`（`productionStores` 装配）与 `shared/`（`redact`）。旧
   `src/README.md` 的 `views → features → domain ← data` 四层说法漏了
   Task 17 才落地的路由封装层，照它读代码会找不到 store 从哪来。
2. **演示题池不是"待删除的过渡产物"**：`features/home/fixtures.ts` 与
   `quizStage/demoSimilarQuestions.ts` 的注释原写"Task 8 落地后整体删除"，
   但 T8 之后它们仍是 composable 未注入 `pool` 时的缺省值（`useHomeQuest`
   line 278、`useQuizSession` line 50）。已改为准确的定位说明：正式路径由
   `app/productionStores.ts` 装配真实题库，演示池保留作兜底，并说明它的小池
   尺寸是**刻意**的（让 `repeatCount` 真实分支在首页演示里被执行）。
3. **四个层 README 的"本目录在 Task 1 阶段仅为占位，尚无代码"全是假话**：18 个
   task 之后四层都有真实代码，这些句子会主动误导读者。已逐层重写为真实清单
   （domain 七个子目录、data 四文件、views 八页面对应路由、features 八个功能域），
   并把 features 表中两个从未落地的规划条目（`quest/`、`mapPanel/`）与真实落地
   的 `home/`、`unlock/` 对齐。

**统一 JSDoc**：`data/content/index.ts`、`schema.ts`、`quizStage/useQuizSession.ts`、
`demoSimilarQuestions.ts` 里残留的英文注释改为中文，与仓库其余注释一致。

**验收**：`npm run test` 51 文件 643 用例全绿；`npm run type-check` 通过；
`npm run build` 成功（产物 `dist/`）；覆盖率总体 statements 94.16% / branches
91.67% / lines 95.77%，`src/domain/` statements 100% / branches 99.65%；
`openspec validate dsm1234 --strict` 通过。


---

## R21. 上线后验收发现的三个接线缺陷（已修）

**A. 输完 PIN 点「确定」页面不跳转。** `src/router/routes/ProfilesRoute.vue` 用
`@navigate="onNavigate"`（事件监听）传导航回调，而 `ProfileSelectView` 把
`navigate` 声明为**可选 prop**、并未 `defineEmits` 该事件——于是
`props.navigate` 恒为 `undefined`，`useProfileSelect` 回落到 no-op，PIN 验证
成功、输入被清空，页面却不动。改为 `:navigate="onNavigate"`。

**B. 刷新或直接访问 `/profiles` 返回 GitHub Pages 404。** 纯静态托管无法配置
「任意路径回退到 index.html」，`createWebHistory` 下的深链与刷新必然 404。
改用 `createWebHashHistory`（`/#/home`），刷新、深链、微信内置浏览器均稳定，
无需额外的 404.html 重定向技巧。

**C. 点「开始下潜」没有任何反应。** 首页组题时 `pool` 缺省到 T12 的**演示
fixture**（`demo-basic-1` 等），而答题页经 `app/questContext.ts` 按**正式题库**
（`q001`…）查题，两端内容不一致 → 题组一道都取不出来 → 守卫把 `/quest` 打回
`/home`，表现为“点了没反应”。修复分三层：
- 题池改为**必填**（`HomeQuestOptions.pool`、`QuizSessionOptions.questions`、
  `HomeView.pool`、`QuestView.questions`），缺池在编译期报错而非静默降级；
- 删除演示 fixture（`home/fixtures.ts`、`quizStage/demoSimilarQuestions.ts`）；
- `HomeRoute` 从 `QUESTION_BANK` 显式注入题池，与 `questContext` 同源。

**顺带：悬空题组自愈。** `dailyQuestIndex` 由“先到者胜”改为**后者覆盖**，
并让首页把“当日题组在当前题池里一道都取不到”视为“今天还没有题组”。这样
内容换版后遗留的旧题组能让位给重新领取的新题组，否则孩子会被永久卡在一个
渲染不出题的会话里（`claimToday` 会因“今天已有题组”而拒绝重抽）。

**验证**：643 测试全绿、type-check 通过；本地浏览器实测建档 → PIN → 首页 →
领取 → 开始下潜 → 答题页渲染出题库真实题目；`/` 与深链刷新均正常。

---

## R22. P1 家长门禁与三区路由骨架（管道先行，页面留 P2）

**范围**：这是"家长区重构"的前半部分——只做**管道**（家长 PIN 存储、门禁、
三区路由、PIN 掩码输入框），不做三区页面的视觉；页面内容 P2 替换。

### 1. 家长 PIN 独立成 `guard` 对象库（`DB_VERSION` 3 → 4）

家长 PIN 与**任何孩子档案无关**（它是家长区门禁，不是某个孩子的凭据），因此
不能塞进 keyPath 为 `profileId` 的 `settings`（那会迫使编造一个假档案 ID）。
新增 `guard` 库（`keyPath: 'id'`，全场唯一一条 `id: 'parent'`）：

- `STORE_NAMES.guard` / `DeepSeaSchema.guard` / `GuardRecord`（只含 `pinHash` 与
  `salt`，无明文字段）；
- `DB_VERSION` 3 → 4。新增对象库**只能靠版本跳变**完成（不跳版本时旧库里没有
  这个库，读写一路 `NotFoundError`，表现为"家长 PIN 永远设置不上"）；
- `applyMigrations` 沿用"先 `contains` 再建"，对全新安装、旧版单库、v3 五库三种
  存量状态都幂等；
- `StorageFacade.guard` + `resolveStorage()` 两条分支（IndexedDB / 内存降级）
  都装配（降级态下门禁同样可用）。

数据保留用例：`tests/data/db.test.ts` 铺一个停在 v3（五库、无 `guard`）的库，
里面已有一条档案与一条事件，升级后断言 `version === DB_VERSION`、`guard` 库存在
且为空、既有 events / profiles 原样保留；另有"已是 v4 的库 reopen 时 guard 里的
家长 PIN 不被清空"。

### 2. 门禁规则（`useParentGate` + `parentSessionStore`）

- **首次**（`guard.load()` 返回 `undefined`）：进入"设置家长密码"模式，需输入
  两次（PIN + 确认）；两次不一致给中性文案（"两次输入不一致，请重新设置"，
  不含任何"哪里错了"的归因）并回到第一步；一致才 `hashPin` + 新随机盐落库，
  并置 `unlocked`。
- **已设过**：`verifyPin` 比对已存哈希；失败只说"再试一次"，连续 5 次锁定 60 秒
  ——与孩子 PIN **同一套口径**（直接复用 `usePinLock` 与 `features/profileSelect/
  types.ts` 的阈值常量，避免两侧限速行为漂移）。
- **是否跨刷新**：MUST NOT。`parentSessionStore` 是纯内存 Pinia（`unlocked` 一个
  ref），刷新后重新验证。孩子与家长共用设备，家长区操作（改题量/重置 PIN/删档）
  是破坏性的，门禁跨刷新留存等于给孩子留后门。
- **安全**：PIN 明文只活在 `pin` 这个短生命周期 ref，`submit()` 的 `finally` 里
  立刻清空（成功失败都清）；`fail()` 统一收口使"校验返回 false"与"校验抛错"
  行为一致（否则反复触发存储异常就成了绕过 5 次锁定的后门）；日志出口经
  `redact()`，且本函数从不主动把 PIN/盐当字段写进日志（有用例断言）。

### 3. 三区路由骨架与 `nextRoute` 纯函数

路由表（`src/router/index.ts`）四条，全部懒加载：

| 路径 | 组件 | 说明 |
|---|---|---|
| `/parent` | `ParentGateRoute.vue` | **门禁页**（旧的一体化 `ParentRoute.vue` 已删） |
| `/parent/overview` | `ParentOverviewRoute.vue` | 门禁通过后的落点 |
| `/parent/settings` | `ParentSettingsRoute.vue` | 待 P2 填 |
| `/parent/manage` | `ParentManageRoute.vue` | 待 P2 填 |

`nextRoute` 新增第 4 条规则：**家长子路径未解锁 → `/parent`**。规则只看内存态
`unlocked`，守卫里**不做任何异步 PIN 校验**（校验只发生在门禁页内）；门禁页自身
不在 `PARENT_CHILD_PATHS` 里，否则目标等于当前路径，vue-router 会判无限重定向。
`PROFILE_OPTIONAL_PATHS` 收进四个家长路径：首个档案正是在"还没有档案"的前提下
创建的，无档案时也要拦到门禁页（而不是档案选择页）。

三个子页面在 P1 是极简占位（标题 + 半句说明 + 返回按钮，均带 `data-testid`），
P2 替换。

### 4. PIN 掩码输入框（孩子与家长共用）

`PinPad` 在点数回显上方新增 `<input type="password" inputmode="numeric"
autocomplete="one-time-code" maxlength="4">`（`data-testid="pin-input"`，外层
`<label>` 提供无障碍名）。同步方式：

- 打字/粘贴 → emit `setpin`（整体赋值），由 `useProfileSelect.setPin` /
  `useParentGate.setPin` 过滤（剥非数字 + 截到 4 位，锁定期间不接收）；
- 组件不复制过滤规则：`onInput` 等一个 `nextTick` 后把 `props.value` 写回 DOM，
  被拒的输入不会作为明文残影留在框里；
- 点按键盘 → `props.value` 变化后输入框随 `:value` 同步（用例断言双向一致）。

`PinPad` 的 `nickname` 变为可选并新增 `title`（标题泛化，不复制第二份组件），
现有 `pin-dots` / `pin-error` / `pin-lock-countdown` / `pin-submit` / `pin-key-*`
的 testid 全部保留。

### 5. 本 task 的偏离与遗留

| # | 事项 | 说明 |
|---|---|---|
| 1 | **改了 `src/views/ProfileSelectView.vue`** | 不在任务书"可改/新增"清单内。但孩子侧的掩码输入框必须由该视图把 `@setpin` 接到 `useProfileSelect.setPin`，否则要求"孩子与家长共用同一套输入"就不成立。改动仅一行（`@setpin="select.setPin"`） |
| 2 | **`/parent` 不再渲染旧的 `ParentView.vue`** | P1 的 `/parent` 是门禁页，三个子页是占位——因此**建档 / 设置 / 报告 / 删档在 P2 落地前暂时不可达**。这是任务书明确的分期边界（"P2 再填真正的总览/设置报告/档案管理"），但会造成一个中间态功能缺口，P2 必须补齐 |
| 3 | `src/views/README.md` 的 `/parent → ParentView` 行已过时 | 该文件不在本 task 可改清单内，未动；P2 应一并更正 |
| 4 | `ParentView.vue` 覆盖率由 ~100% 降到 38.7% | 成因同 #2：App 级用例不再经 `/parent` 渲染它，只剩它自己的组件测试。总体阈值仍达标（见下），P2 重新接线后回升 |
| 5 | `productionStores.parent` 暂只有 P2 会消费 | 保留原装配不动；新增 `parentGate: storage.guard` 供门禁页用 |
| 6 | 三个子路由**未**注入 `getProductionStores()` 窄接口 | 占位页不消费任何 store，注入了就是死代码（`noUnusedLocals` 也会拦）。窄接口注入随 P2 的真实内容一起加 |

### 6. 验证

- `npm run test`：55 文件 / 687 用例全绿（较 P1 前 +44 用例）；
- `npm run type-check`：通过；
- `npm run test:coverage`：全绿（Statements 93.91% / Branches 91.65% /
  Functions 92.42% / Lines 95.52%，阈值 80%）；
- `npm run build`：成功；
- 需求改动逐条有测试：guard 库 save/load/clear/覆盖写/未设置为 `undefined`、
  v3 → v4 保留数据、内存态降级同契约；门禁首次设置 / 校验 / 5 次锁定 / 不跨刷新；
  `nextRoute` 未解锁打回 / 已解锁放行 / 门禁页不自重定向；掩码输入框可输入、
  过滤非数字、满 4 位、与键盘双向同步、不回显明文。
- 分支：仓库 HEAD 的 `004-dsm1234` 已是 `main` 的**祖先**（`main` 领先 3 个提交，
  含上线后修复），直接切回 `004-dsm1234` 会丢这些修复。因此本 task 从 `main`
  新建 `004-dsm1234-p1` 提交，未改任何既有分支历史、未 push。

## R23. P2 家长区三区页面（总览 / 设置与报告 / 档案管理）

P1 的三条子路由占位换成正式界面。三个功能区页面落在
`features/parentPanel/`（`FamilyOverviewSection` / `LearningSettingsSection` /
`ProfileManageSection`），由 `routes/Parent*Route.vue` 薄封装注入
`stores.parent`、`QUESTION_TYPE_BY_ID` 与当前档案 id 后挂载；底部导航
`ParentSectionNav` 只认功能区 id，路由翻译留在封装里（`features/` 不依赖
`router/`）。

**"本周概况"派生**：新增 `useFamilyOverview`（`ChildOverview` 类型进
`types.ts`）。它对每个孩子调一次 `replayProjections`（也算一次题型掌握），再
对事件流做一趟区间过滤算出近 7 天完成题数 / 平均用时 / 学习天数，并据题目级
掌握投影（经注入的题型表归类）挑出"未掌握 + 提示后掌握"最多的题型，拼一句
"需要关注"。组件只渲染结果，**绝不**在模板里 reduce 事件。

**组件复用 vs 泛化**：`SettingsForm` / `ReportPanel` / `DangerZone` 原样复用，
未复制第二份。`DangerZone` 未改签名——档案管理页改成**每个孩子一条可展开的
"安全"区**，一次只展开一个，展开即把 `useParentPanel` 的当前选中切到该孩子，
于是 `resetForm` / `deleteForm` 这些短生命周期输入永远只属于一个孩子。
`useParentPanel` 为此新增 `selectedProfileId` + `selectProfile()`（切换时清空
上一个孩子的半截 PIN/删档确认），`saveSettings` / `refreshReport` /
`deleteProfile` 一律改以它为准。新增组件 `ChildSummaryCard`、
`ParentSectionShell`（三页共享的标题/隐私说明/降级警示条/底部导航外壳）。

**`ParentView.vue` 删除**：P1 起 `/parent` 是门禁页，三类操作已分散到三个子
页，该视图不再被任何路由使用，连同其单测一并删除；`src/views/README.md` 的
`/parent → ParentView` 过时行改为 `ParentGateView`，并注明三个功能区页面住在
`features/parentPanel/`。

**验证**：

- `npm run test`：56 文件 / 698 用例全绿；
- `npm run type-check`：通过；
- `npm run test:coverage`：全绿（Statements 94.27% / Branches 91.74% /
  Functions 93.99% / Lines 95.71%，阈值 80%）；
- `npm run build`：成功；
- 三区行为逐条有测试：总览按昵称出卡、完成题数/平均用时由注入事件投影算出、
  点卡进该孩子设置、无档案给建档引导；切孩子表单与报告换人、保存写
  `settings-updated`、缺题型表显示"暂不可用"；建档回到列表、重置 PIN 后旧
  PIN 失效新 PIN 可用（`verifyPin` 断言）、删除需勾选 + 昵称一致且清理事件；
  降级三页均见警示条；导航高亮与切换；PIN 明文不进渲染文本与日志。

---

## R24. P3 家长区表单与卡片视觉打磨（真机验收后的修复）

**问题**：P2 删除 `views/ParentView.vue` 时，那段负责表单外观的 scoped 样式
一并消失，家长区输入框退化成浏览器默认控件（系统深色底、直角），档案管理页
与设置页"简陋"的观感正来源于此。**当时没有任何测试变红**——它只影响观感。

**表单样式落点**：新增 `src/styles/parentForms.css`，以 `ParentSectionShell`
的根类 `.parent-section` 为作用域（三页与全部子组件都渲染在该根节点内），由
`ParentSectionShell.vue` 引入一次。之所以不复用"每页各写一份 scoped 样式"：
那正是 P2 翻车的形态——删掉一个视图，样式跟着陪葬。为什么不全局生效：家长的
答题页、图鉴等不属于家长区，不该被这套外观染指。

规则覆盖：label 单列（标签在输入框上方）→ text/password/number/select 玻璃底
+ `var(--ds-radius-md)` + 聚焦 `var(--ds-accent-500)` 描边 + **font-size 16px**
（< 16px 时 iOS 聚焦会放大整页）→ 主按钮暖橙渐变、次要玻璃描边、危险操作玫红
（新增 `--ds-danger-*`，不用刺眼纯红）→ fieldset/legend 去边框并入卡片。

**头像可视化**：`avatar-1/2/3` 的文字 radio 换成三个可点选图形块
（`data-testid="avatar-option-1..3"`，内联 SVG：小鲸 / 海星 / 水母，颜色各异，
不含性别刻画）。radio 的 `name="avatar"` 与**在 DOM 中的顺序**都保留，只是
视觉隐藏——既有按 `form.findAll('input')` 下标定位的测试因此原样通过；新增
测试按 `data-testid` + `aria-label` 定位，不断言色值。

**安全区折叠**：`manage-toggle-*` 从裸按钮变成整行可点的卡片（昵称 + `▸/▾`
字形），并加 `aria-expanded`；展开后 `DangerZone` 包进玻璃卡片，删除档案一块
用玫红分隔线与描边，勾选确认 + 输入昵称的门槛不变。卡片内的重复标题改为
"安全设置"（昵称已在折叠行上，避免两行说同样的话）。

**空数据文案**：`ChildSummaryCard` 在 `completedQuestions === 0` 时平均用时
显示"—"（原来渲染 "0.0 秒"，会让人以为孩子答题快到 0 秒）；有记录才显示真值。

**布局**：`ParentSectionShell` 改为纵向 flex + `min-height: 100dvh`，底部导航
`margin-top: auto` + `position: sticky; bottom: 0`（内容短时贴底、长时吸底）。
注意这里**刻意不给根节点加 `overflow-x: hidden`**：它会把根节点变成滚动容器，
sticky 随即失效；横向溢出改为在源头处理（flex 子项 `min-width: 0`、长文本
`overflow-wrap: anywhere`）。`ReportPanel` 的 `dl` 改为"标签左 / 数值右"的行，
题型分布改为每档一个小块，纯 CSS、不改数据。

**验证**：

- `npm run test`：57 文件 / 705 用例全绿（新增 4 条：头像图形块与提交值一致、
  安全区 `aria-expanded` 与字形同步且一次只展开一个、空数据"—"、共享样式被
  外壳引入且全部规则限定在 `.parent-section`）；
- `npm run type-check`：通过；
- `npm run test:coverage`：全绿（Statements 94.33% / Branches 91.81% /
  Functions 94.15% / Lines 95.77%，阈值 80%）；
- `npm run build`：成功；
- agent-browser 375×667 实测三页：`scrollWidth === clientWidth === 375`（无横向
  溢出），长昵称（24 字）在卡片内换行不撑破，底部导航三页均贴视口底，
  截图确认建档表单、头像块、安全区折叠与"平均用时 —"的观感与首页/图鉴一致。


---

## R25. 家长区底部导航遮挡表单（已修）

**问题**：`ParentSectionNav` 原为 `position: sticky; bottom: 0`。sticky 元素**不为自己
占位**，且 `margin-top: auto` 只在内容短于视口时才有作用——内容一长，导航会盖住
末尾控件。实测在 iPhone 14 视口下，「创建档案」按钮被导航压住，点击事件落在
导航上（`agent-browser` 报 `Element is covered by nav.parent-nav`），家长无法建档。

**修复**：取消 `sticky`，改为普通块级元素排在内容末尾（短页面仍由 `margin-top: auto`
顶到视口底）。家长区是低频管理界面，不需要「导航随时可见」；能点到按钮比导航吸底
重要。同时把导航高度收敛成外壳上的 `--parents-nav-space` 变量，避免两处各写一个高度。

**顺带核对**：`PinPad` 的掩码输入框在真实浏览器里可用（聚焦后用键盘逐字输入 4 位，
点数回显与输入框值同步为 `4` / `1357`）。此前 `agent-browser fill` 看似无效，是该工具
对 `type=password` 的填值方式不触发组件所需的输入事件，非应用缺陷。

**验证**：705 测试全绿、build 通过；iPhone 14 视口实测「家长 PIN → 档案管理 → 创建档案 → 总览」全程可点，截图确认三页视觉与首页/图鉴一致。

---

## R26. 答题按钮状态机 + 看答案释义 + 家长区入口按钮（真机验收后的第三轮修复）

**背景**：家长在真机验收后提出三条：答题页三个按钮（提交/提示/看答案）始终同屏、答对后自动跳下一题、家长区入口是一行低对比小字。三处一起改。

### 1. 作答阶段状态机（`useQuizSession`）

新增 `AnswerPhase = 'answering' | 'correct' | 'wrong' | 'revealed'` 与 `heldQuestionId` /
`displayedQuestion`。关键设计：

- `currentQuestion` 仍由 `resolvedIds` 派生（答对/看答案后**立刻**推进队列），**不**改为按住——
  这保住了 `revealAnswer` 连续两次作用于两题、`submitAnswer` 订正后自动移到相似题等既有事件流
  语义（旧单测原样通过）。
- 界面用另加的 `displayedQuestion`：`heldQuestionId` 非空时按住那一题，`currentPosition` /
  提示链 / 五步状态等 UI 读数改以它为准。答对后 `phase='correct'` 且按住，孩子点 `nextQuestion()`
  才松开、回到 `answering`。
- `submitAnswer` 答对 → `correct`、答错 → `wrong`（**仍自动写一条 `hint-used` 第一层**，见下）；
  `revealAnswer` 写 `answer-revealed` 后 → `revealed` 且 `explanationVisible=true`；新增
  `showExplanation()` **只展开释义、不写任何事件**（答对后看详解，避免把已答对的题降级为提示后掌握）。

### 2. 底部统一动作区（`QuestView`）

三处分散按钮（`QuizStage` 提交、`HintStack` 提示、页尾直接看答案）合并为底部一个动作区，按
`phase` 只渲染两个：`action-submit`/`action-hint` → `action-next`/`action-explain` →
`action-submit`/`action-reveal` → `action-next`。为把提交按钮上移，输入值经
`QuizStage`/`StepBody` 的 `defineModel` 上抛给 `QuestView` 的 `draft`；答案步不再自带
`submit-step-answer` 按钮（`QuizStage`/`StepBody` 单测相应改为断言 model 上抛）。`HintStack`
新增 `showRevealButton`（缺省 `true`，答题页传 `false`），`reveal-hint` 单测原样通过。

**与规格的张力（显式留痕）**：`daily-math-quest` §答题流程与判定 要求「答错时展开提示链第一层」，
而按用户要求答错态只留「提交答案 / 看答案」两个按钮、不再显示「我需要提示」。处理为：答错时
**仍自动写 `hint-used` 第一层并展开该层**（规格满足），只是不再重复暴露提示入口（已在
`useQuizSession` 注释中写明来源）。

**既有测试的显式更新**：`reveal-answer`→`action-reveal`、`submit-answer`→`action-submit`、
`reveal-hint`（答题页）→`action-hint`；「看完题但未完成 / continue-practice」用例改为以存量
`answer-revealed` 事件重放该状态——新界面已不允许「不作答就 reveal」，该路径现在只对旧版
遗留会话有意义。

### 3. 看答案释义面板（`AnswerExplanation`）

题目下方新增 `data-testid="answer-explanation"`：五层提示按顺序展开（取自 `question.hints`，
标签取 `HINT_LAYER_LABELS`）+ 最终答案（算式优先，否则「数值 + 单位」）。两处显示时机：答错后
`看答案` → 显示且写 `answer-revealed`；答对后 `看答案详解` → 显示但**不**写事件。面板纯展示、
不持状态，写不写事件由 `useQuizSession` 决定。

### 4. 家长区入口按钮（`ProfilesRoute`）

页脚那行小字改为玻璃底 + `--ds-glass-border` 描边的次级按钮（不抢「选择你的档案」的暖橙主色），
`min-height: 2.75rem` + 水平内边距满足触屏点按，位置仍在主内容之后；`data-testid="goto-parent"`
保留。

### 验证

- `npm run test`：57 文件 / 712 用例全绿（新增：阶段机 phase/按住/nextQuestion、showExplanation
  不写事件、动作区按阶段渐进、释义面板五层 + 答案、HintStack `showRevealButton=false`）；
- `npm run type-check`：通过；`npm run test:coverage`：全绿（阈值 80%）；
- `npm run build`：成功；
- iPhone 14 视口 agent-browser 实测：档案页 `家长区（家长管理）` 按钮清晰可点；答题页未作答只
  见「提交答案/我需要提示」→ 答错后「提交答案/看答案」并自动展开第二层提示 → 看答案后展开
  「答案与讲解」五层 + 答案、只余「下一题」→ 答对后「下一题/看答案详解」，看详解展开释义且不
  写事件。

---

## R27. 移除五步引导：题目页只留题干 + 算式/答案 + 键盘（真机验收后的改动）

**决策来源**：家长真机验收后提出——

> 有几个应用题在没有要求提示时直接把提示流程写上去了，请去掉，直接让学生列出算式，和最终答案即可。

即：**所有题目都只显示「题干 + 算式/答案输入 + 数字键盘」**，解题思路只在孩子主动点「我需要提示」时经 5 层提示链（审题 → 已知/未知 → 关系 → 算式 → 讲解）按需提供。

**与冻结规格的冲突与处理**：这与 `specs/daily-math-quest/spec.md` 原有的「五步思考引导」需求直接矛盾（该需求要求应用题/探测题走五步进度条）。规格是冻结输入，因此按 Constitution 的修订流程以 **`## MODIFIED Requirements` delta** 改规格，而不是让实现单向偏离：原「五步思考引导」改写为「解题思路经分层提示提供」，原三个场景（应用题进入五步 / 五步自动前进 / 基础题直答）替换为「提示链按需展开」与「判定接受算式或答案」。`design.md` 追加《设计修订（上线后）》一节留痕。

**代码处置**：
- 删除 `src/features/quizStage/FiveStepBar.vue`、`StepBody.vue`；`QuizStage.vue` 只剩 `direct-answer` 一条渲染路径，props 去掉 `steps`/`machine`/`stepFeedback`，emit 去掉 `completeStep`/`revisitStep`/`resumeProgress`。
- `useQuizSession.ts` 删除五步状态与函数；`submitAnswer` 判定**统一为 `isCorrect(submitted, question.answer)`**——它已覆盖数值 / 带单位 / 算式三路等价，因此「列算式」与「填答案」在同一处判定。此前「应用题的答案步只比数值结果」的口径随之取消（对应单测已改写）。
- `QuestView.vue` 去掉传给 `QuizStage` 的五步 props 与事件。
- **不删** `src/domain/quiz/fiveStepMachine.ts`：它是已交付并有单测的纯领域能力，属未来可能复用的资产；仅在文件头 JSDoc 注明「当前版本界面不使用五步引导（见 RETRO R27），保留本模块供将来复用」。

**内容模型与校验**：
- `Question.requiresFiveStep` / `steps` 保留字段（不破坏既有事件/内容结构），但 JSDoc 注明当前版本 MUST NOT 使用。
- `schema.ts` 新增严格口径：任一题目声明 `requiresFiveStep === true` 或 `steps` 即报错（避免作者写了步骤却被界面静默忽略）。C1 期间现有 72 题仍带五步字段，故以 `ALLOW_LEGACY_QUESTION_CONTENT` 过渡豁免，`assertValidQuestionBank` 增加 `legacyContent` 选项；**C2 扩容并去五步后删除该常量**。
- 题量范围 60–80 → **200–400**，并新增「每个 `QuizType × Difficulty` 组合至少 8 题」运行时约束（常量 `QUESTION_BANK_LIMITS`）；过渡期下限回落 60 / 每格 1。负测覆盖：199 / 401 题被拒、某组合不足 8 题被拒、五步字段被拒。
- 相似题引用改为**可选**（空数组合法，订正流程遇到空相似题自动跳过）；一旦声明的同题型 / 共享技能 / 答案表示一致校验保留。

**界面上解题思路只剩一条路径**：底部「我需要提示」→ `HintStack` 逐层展开；答错时仍按规格自动展开第一层（R26 已留痕）。

**验证**：`npm run test` 57 文件 / 712 用例全绿；`npm run type-check` 通过；`npm run test:coverage` 全绿（阈值 80%）；`npm run build` 成功；`openspec validate dsm1234 --strict` 通过。

**遗留**：题库扩容到 200+ 与内容侧移除五步字段由后继任务 C2 负责；C2 完成后应删除 `ALLOW_LEGACY_QUESTION_CONTENT` 并把 `legacyContent` 选项一并去掉。


---

## R28. 题库扩容到 216 题：生成脚本、数字量级上调与过渡豁免删除（C2）

**决策来源**：家长反馈「题有点基础，针对 3 年级小孩，可以稍微加大点数字的计算」，并要求「准备一个题库，至少 200 道题，每次进入的时候，从题库中按难易程度和题类型去选择」。C1 已把界面收敛为「题干 + 算式/答案输入」并把题量上限放宽到 200–400、每格 ≥ 8，留了过渡豁免常量；C2 负责真正把题库补到 200+、上调数字量级并删掉豁免。

**用生成脚本而不是手写**：新建 `scripts/generate-question-bank.mjs`（Node ESM，零依赖，固定种子 `20261012`）。216 题 = 6 题型 × 3 难度 × 12 题，直接写出 `src/data/content/questionBank.json`（`version` 提到 `2.0.0`）。脚本头部写明运行方式（`node scripts/generate-question-bank.mjs`）、可调参数（种子 / 每格题数 / category 分布 / 各 kind 的数字范围）与「修改题库必须走脚本、不要手改 JSON」的理由。手写 200+ 道三位数题极易系统性算错，脚本把「情境模板 + 数字生成 + 答案计算 + 五层提示 + 来源链接」一次算出，可复现、diff 稳定。

**分布**：每格固定 6 basic / 4 applied / 2 probe → 全局 108 / 72 / 36，basic 池最厚，满足组题 5/3/1 的取题需求。每格内用与池长互质的步长轮转情境模板，保证 12 道题尽量分散；每个题型 ≥ 8 个不同故事模板（深海/潜水艇/考察站/生物观察等），`story.title` 与 `story.body` 都随情境变化而不是只换数字（内容测试断言每格 ≥ 6 个不同标题、每题型 ≥ 8 个）。

**数字量级上调（对齐三年级标准）**：`add-sub` d1 两位数加减 / d2 三位数加减 / d3 三位数连续进位·退位；`mul-div` d1 表内乘除且保底一边 ≥ 6 或积 ≥ 30 / d2 两位数 × 一位数、整除的除法 / d3 两位数 × 一位数含进位、有余数除法求「最多装满几份」（`divrem` 只给数值+单位答案，因为带余数的商不能用算式答案表达）；`two-step-app` d1 一位数 × 一位数再加 / d2 两位数 × 一位数加·减 / d3 三位数参与；`unknown-relation` d1 两位数 / d2·d3 三位数或两步逆向；`unit-time-route` d1 同单位长度·时间加减 / d2 时·分换算与米级长度 / d3 三段路程、多班经过时间；`pattern-data` d1 等差 / d2 等差·倍增 / d3 二阶差、平方数、×2+1。**全库不再出现个位数加减**。

**hints 保持五层且不泄答案**：第 1 层审题（**不含任何数字**，避免复述题干）、第 2 层已知/未知、第 3 层数量关系、第 4 层算式提示、第 5 层讲解示例。第 5 层用**另一组数字**重走同一技能，并额外避开本题的操作数，确保与 `validateWorkedExampleHint` 的整数边界口径一致。生成器对每道题在写入前做多轮「示例不撞答案数字」检查，撞不上就抛错而不是静默放行。

**相似题链接改为可选后的实际影响**：链接只给「同格 + 同精确技能 + 同答案形态 + 答案值不同」的相邻两题建立双向链接，共 **48 组 / 96 道题有链接，120 道留空（56%）**。空链接在订正流程中被跳过（C1 已让 `similarQuestionIds` 可选），不再因为缺链接而拒绝内容。

**删除过渡豁免**：移除 `ALLOW_LEGACY_QUESTION_CONTENT` 常量、`QuestionBankValidationOptions` 与 `validateQuestion` 的 `legacyContent` 形参，`assertValidQuestionBank` 现在一律走严格口径（200–400 题、每格 ≥ 8、禁止五步字段）。随之删除只服务旧内容的 `validateSteps` 与 `FIVE_STEP_TYPES` 引用。

**内容测试改写**（`tests/data/content/questionBank.test.ts`，27 条）：规模 216 / 每格 12 / category 6·4·2、索引桶对拍、来源域映射、相似题约束（同题型、共享技能、单位与算式形态一致、双向值不同）、`hints[4]` 不泄答案、第 1 层不复述题干数字、**数字量级下限**（`add-sub` 非暖身题操作数全 ≥ 10；`mul-div` d1 至少一边 ≥ 6 或积 ≥ 30）、情境多样性（每格 ≥ 6、每题型 ≥ 8），以及严格口径负测（199/401 题被拒、缺格被拒、五步字段被拒、来源缺域 / 单位不匹配 / 形态不匹配 / 悬空·重复引用被拒）。

**一处刻意的例外**：`tests/App.test.ts` 的端到端用例逐字敲 `7 + 5` 提交并期望整组完成，`q001` 因此保留为暖身题——它是全库唯一保留个位数操作数的题，`questionBank.test.ts` 的量级断言显式放行并单独断言 `q001` 就是 `{ value: 12, expression: '7 + 5' }`（该测试文件不在 C2 的可改清单内，故不动它）。

**验证**：`npm run test` 57 文件 / 709 用例全绿；`npm run type-check` 通过；`npm run test:coverage` 全绿（语句 94.1% / 分支 91.8%）；`npm run build` 成功；`openspec validate dsm1234 --strict` 通过；抽查 30+ 道题人工核对答案与算式一致（含三位数进位/退位、两步顺序、时·分换算、有余数除法取商），修正了「三段长度题题干只写两段」与「加法 d3 和超过 1000」两处生成器缺陷后重新生成。

**遗留**：无（C1 的过渡豁免已删除；题库规模与量级均达标）。

---

## R29. 移除「测试反过来约束题库内容」（已修）

**问题**：`tests/App.test.ts` 的端到端用例逐字敲 `7 + 5` 作答并断言解锁 `johnson-anglerfish`，
于是生成脚本为迁就它专门保留了一道个位数的 `q001` 暖身题，`questionBank.test.ts`
也为这道题开了数字量级的白名单例外。**内容被测试钉死**，方向是反的。

**修复**：用例改为从题库派生——挑一道 `basic`、数值型答案、带 `creatureRef` 的题，
按 `answer.value` 逐位敲键，并断言解锁的生物等于该题的 `creatureRef`、观察舱显示
该生物的名称（名称从 `CREATURE_BANK` 取）。生成脚本删除 `WARMUP` 特例，
`questionBank.test.ts` 删除白名单例外。现在题库怎么改，这两处断言都跟着走。

**顺带修掉一个生成器缺陷**：`add-sub` d2 的减法曾让被减数与减数独立取值，
生成出 `417 - 419 = -2` 的负结果题（内容校验抓到）。现在减数上界绑定被减数，
保证结果为正且差值不小于 60。

**验证**：全库审计 216 题无负数、无超 1000 的加减结果、无五步字段残留、ID 唯一；
709 测试全绿；`openspec validate dsm1234 --strict` 通过。

---

## R28. 观察舱接入授权 3D 模型（上线后授权范围内的范围扩展）

**背景**：`proposal.md` 明确排除「3D 模型（Three.js）」，图鉴四条目均只有原创 2D 插画。
用户从 Sketchfab 下载了若干深海鱼资源并授权接入其中**许可明确**的一个；其余
（`fish_deep.glb` / `manta_ray_birostris_animated.glb`）无随附许可证，未纳入。

**范围裁决**（用户确认）：这批改动挂在 **DSM1234** 下、直接提交 `main`（与历史一致）。
它与 proposal 的排除项冲突，因此在此显式记录范围扩展，不让实现单向偏离规格。

### 1. 资产与许可

| 项 | 值 |
|---|---|
| 模型 | `Deep Sea Fish #3DSM4`，Carlo Bergonzini |
| 许可 | CC BY 4.0（允许商用、允许修改，必须署名） |
| 原始体积 | 14.27 MB / 约 178 万面 |
| 交付体积 | `public/models/deep-sea-fish-3dsm4.glb`，**1.3 MB** |

- `public/models/anglerfish-license.txt` 为**原作者的许可文本原文照抄**。
- 优化手段：`gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 1024 --simplify-ratio 0.35 --simplify-error 0.001`，
  并先用 `@gltf-transform/core` 的 `NodeIO` 摘掉与目标生物无关的场景节点
  （`BezierCurve` / `Plane.3595` / `MegaFish LIte` / `Sphere.001`）。
- `model.attribution` 的 "Changes:" 一句如实写明「移除无关场景元素、简化几何、压缩贴图」。

### 2. 物种口径（不可模糊的一点）

该模型是**深海鮟鱇鱼的授权示意模型，不是约翰逊鮟鱇鱼的精确解剖复原**。
`creature.json` 的 `model.note` 明写这句，观察舱页面上与署名同屏显示；
`schema.ts` 强制该字段非空，避免后续内容编辑悄悄弱化免责表述。

### 3. 代码落点

- `src/data/content/schema.ts`：新增 `CreatureModelAsset` 与校验——`ref` 必须匹配
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`（挡路径穿越）、`attribution`/`license`/`note` 非空、
  `sourceUrl` 与 `licenseUrl` 必须 HTTPS（新增 `secureHttpsUrl` 辅助函数）。
- `src/features/bestiary/CreatureModelViewer.vue`：新组件。限制 DPR ≤ 1.5、
  按窄屏上调相机距离（避免鱼被裁切）、`ResizeObserver` 无实现时回退 `resize` 事件、
  卸载时释放动画循环与几何/材质/贴图。
- `src/features/bestiary/CreatureCanvas.vue`：新增 `preferModel` prop（缺省 `false`）
  与 `modelFailed` 回退。**只有观察舱传 `true`**——图鉴卡片继续用轻量 2D 插画，
  避免 N 个物种各拖 1–2 MB 把首屏压垮。
- `src/views/ObservationView.vue`：`:prefer-model="true"`。

### 4. 三条回退路径（都有测试）

1. WebGL 不可用 → `WebGLRenderer` 构造失败 → emit `error` → 退回原创插画；
2. 模型加载失败 → `loadAsync` reject → 同上；
3. 运行中 `webglcontextlost` → `preventDefault()` + emit `error` → 同上。
4. 任一回退后**署名与许可链接仍显示**（CC BY 的署名要求不因降级而消失）。

### 5. 本轮顺带修复的遗留项

| 来源 | 问题 | 处置 |
|---|---|---|
| R7 | `FishBackdrop` 的 `count` 无上限，传 10000 会掉帧 | 收敛到 `MAX_BACKDROP_FISH = 24`，常量提至 `src/features/theme/types.ts` 供实现与测试共用；模板内联推导改 computed |
| 本轮新增 | Three.js 使 `CreatureModelViewer` 分块 639 kB 触发构建告警 | `vite.config.ts` 加 `manualChunks` 拆出 `three-vendor`（635 kB / gzip 160 kB，仅 3D 路由下载），业务代码降至 3.97 kB，告警消除 |
| — | 后续接入新模型无指引 | 新增 `docs/3d-model-assets.md`：许可门槛、落位、压缩命令、`creatures.json` 登记与 schema 约束、回退契约、验证清单 |

**顺带修正**：`CreatureCanvas` 的插画路径改为 `import.meta.env.BASE_URL` 前缀——
原 2D 插画在 GitHub Pages 子路径下同样是 404 的，只是没人报过。

### 6. 产品裁决（本项不写代码）

- **R4「看答案是否算完成该题」**：维持现状（看答案不计完成、不写事件、不改变掌握状态）。
- **PIN 5 次锁 60 秒是否跨刷新保留**：维持内存态。规格只要求「连续 5 次错误后锁定
  60 秒」，未要求跨刷新；本地哈希 + 盐的威胁模型下持久化收益有限。

### 7. 验证

`npm run test` 59 文件 / 716 用例全绿（新增：模型元数据校验与负测、许可原件存在性、
`CreatureModelViewer` 的 WebGL 失败与 context-loss 回退、FishBackdrop 上限）；
`npm run type-check` 通过；`npm run test:coverage` 全绿（statements 91.82% / branches
89.82% / functions 92.70% / lines 93.52%，阈值 80%）；`npm run build` 成功且无分块告警。
iPhone 视口（375×812）实测：观察舱模型加载成功、可拖动/缩放、署名与许可链接可见、
页面无横向溢出；`getContext` 返回 null 时正确回退到原创插画。

**遗留**：用户将继续手工下载更多深海鱼资源；后续物种接入按
`docs/3d-model-assets.md` 执行，**拿不到许可证文件的模型不接入**。

---

## R29. 真机验收后的三处体验缺陷（完成态死路 / 区域口径分叉 / 图鉴不用 3D）

**决策来源**：家长真机验收后提出三条——

> 1.「这一组完成啦，继续探索深海吧」界面没有返回按钮
> 2. 首页界面太简陋，请丰富一下
> 3. 图鉴里我明明解锁了是暮光区，但是还是显示深渊区，而且深渊区的深海鱼还很丑，
>    不是我下载的 3d 模型图

### 1. 完成态死路（`QuestView`）

题组做完后屏幕只有一句"继续探索深海吧"，**没有任何可点的东西**——孩子只能
靠浏览器返回或重开应用（后者直接丢会话上下文）。新增 `quest-back-home`
按钮，经 `go-home` 事件由 `QuestRoute` 翻译成 `router.push(HOME_PATH)`；
`QuestView` 依旧不 import `vue-router`（design §4 组件边界不变）。

### 2. 两张地图给出矛盾的「当前所在」

这是本次唯一一处**真实逻辑 bug**，且不是家长描述的那个现象：

- `HomeView` 按「今天这组题完成没完成」把区域粗估成 0/1；
- `useBestiary`（地图 Tab 页）按事件投影取**最深已解锁区**。

孩子完成过不止一组题时，首页只高亮到暮光区，地图 Tab 页却显示深渊区。
修复：抽出 `src/features/bestiary/zoneProgress.ts` 的
`resolveZoneProgress` 作为唯一口径，两边共用。顺带把 `MapPanel` 的
`currentZoneIndex` 从 1 基改为 0 基（`-1` = 基地）——原先「基地」与
「第一区」共用同一个值。

**关于家长描述的"显示深渊区"**：投影逻辑经测试验证是正确的（只解锁
`zone:twilight` 时 `current` 就是 twilight）。后来家长补充了复现路径——
「完成任务后因为没有返回按钮，我返回首页，点击图鉴后直接就是深渊区」——
指向的是**图鉴卡片**而非地图：图鉴列表默认展示全部物种，其中三个物种的
深度区间跨进深渊区（约翰逊鮟鱇鱼 100–4,500 米、大鼬鳚 2,000–4,300 米、
宝石鱿鱼 15.5–4,276 米），因此孩子看到的是"跨区物种"而非"我在深渊区"。
跨区展示本身符合 spec §物种可能跨区，但**界面没有说清这一点**——卡片上
没有任何区域标注，孩子只能按图上的鱼去猜。这一条留作后续项（见文末）。

### 3. 图鉴卡片不用 3D，与观察舱同物种两张脸

`public/illustrations/` 下四个 SVG 各只有 2–3 个 path、几百字节，是示意
剪影级别；而观察舱用 1.3 MB 的授权模型。家长说"很丑"是准确判断。已按
家长决定改为**卡片也用 3D**，但用**缩略图模式**：

- 单帧渲染后即停掉动画循环（`thumbnail` prop）；
- 无控制按钮、无交互提示、不接受指针事件；
- 理由：列表里同时存在多张卡，每张都跑渲染循环会让低端机合成层持续满载，
  而卡片要传达的只是"这是什么鱼"；
- **两处必须同一份模型**——否则孩子会在图鉴里认不出刚在观察舱看过的鱼。

目前只有约翰逊鮟鱇鱼有授权模型，因此 4 张卡片里 1 张是 3D、3 张仍是
插画；后续按 `docs/3d-model-assets.md` 逐个接入。

### 4. 首页丰富（家长："好看、功能齐全"）

新增三个模块，全部由事件重建、不新增存储：

| 组件 | 回答 | 数据来源 |
|---|---|---|
| `HomeStatusBar` | 我是谁 / 我在哪 | 会话态昵称 + `zoneProgress.currentZoneId` |
| `HomeProgressSummary` | 我拥有什么 | `session-completed.rewards` 累计数、`zone:*` / `creature:*` 键数 |
| `NextZoneHint` | 我还差多少 | `zoneProgress.nextZoneId`，四区全解锁时不渲染 |

徽章口径是**累计不去重**：语义是"获得过几次"，去重会让进度永远停在 1。

### 5. 验证

`npm run test` 59 文件 / 726 用例全绿（新增 12 条：缩略图模式无控件、
thumbnail 下 WebGL 失败仍回退、区域高亮三条、状态条、成就行、
下一区提示与其隐藏条件）；`npm run type-check` 通过；`npm run build`
成功且无分块告警。iPhone 视口（390×844）实测：图鉴 4 张卡片中授权物种
正常加载 3D 缩略图、卡片内无旋转/缩放按钮、`scrollWidth === 390`
无横向溢出。

### 遗留

- [ ] **图鉴卡片缺少区域标注**：跨区物种在列表里看不出"它属于哪些区"，
  孩子按图猜。下一步应在卡片上加一行"可见于：暮光 / 深海"（区间表述，
  不用"唯一栖息区"）。
- [ ] 其余三个物种仍用示意插画，等家长提供授权模型后按
  `docs/3d-model-assets.md` 接入。
