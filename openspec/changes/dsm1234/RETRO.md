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
