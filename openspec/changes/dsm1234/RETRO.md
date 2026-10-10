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

## R8. T11 待补：实现者披露的裁决结果

**问题**：`DomainEvent` 不带 `Question.type`，题型级轨道必须由调用方传 `questionTypeById` 给 `replayProjections`。若 T9/T16 调用方忘传，题型级投影会静默为空（单向失败，不污染题目轨，但无告警）。

**待办**：T12/T16 接线时确认题库侧能提供该表（T8 的 `questionBank.json` 可派生）。

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
