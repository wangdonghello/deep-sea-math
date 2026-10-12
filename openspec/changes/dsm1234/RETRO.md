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
