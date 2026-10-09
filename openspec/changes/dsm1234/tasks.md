# 深海数学探险 · 阶段一 核心学习循环 — 任务清单

**change-id**: DSM1234 ｜ **plan**: `design.md` ｜ **执行模式**: executing-plans
**约束**：每 task 必须 RED → GREEN → REFACTOR；完成即勾 `- [x]`；
commit message 一律用本文件给出的格式；禁止修改 `specs/*.md` 与 `design.md`。

---

### Task 1: 项目脚手架（Vue 3 + TS + Vite + Vitest）

- [x] **Step RED**: 写 `tests/smoke.test.ts`，断言 `src/App.vue` 可被挂载且渲染出 `<div id="app">`（此时项目尚不存在，测试必须失败）。
- [x] **Step GREEN**: 初始化项目：创建 Vue3+TS+Vite 脚手架；安装 `vue-router` `pinia` `idb` `typescript` `vite` `vitest` `@vue/test-utils` `jsdom` `fake-indexeddb`；配置 `vitest.config.ts`（environment: jsdom）；建 `src/main.ts` `src/App.vue` `src/router/index.ts`；`package.json` 加 `test`/`type-check` 脚本。
- [x] **Step REFACTOR**: 清理脚手架默认产物（`HelloWorld.vue`、默认 CSS、`components/__tests__` 示例）；按 design §1 建 `src/domain` `src/data` `src/features` `src/views` 目录与占位 `README.md` 说明各层职责；跑全套测试确认仍 GREEN。
- [x] **验证**: `npm run test` 全绿、`npm run type-check` 通过、`npm run dev` 能起。
- [x] **Commit**: `[DSM1234] chore: T1 - scaffold vue3 ts vite vitest`

### Task 2: domain 基础模型与 crypto 抽象

- [x] **Step RED**: 写 `tests/domain/model.test.ts`：断言 `QuizType` 六个取值齐全、`Question` 必填字段可由构造函数补全默认值（`requiresFiveStep` 缺省 false、`similarQuestionIds` 缺省 []）；写 `tests/domain/crypto/hashPin.test.ts`：断言同一 PIN + 同一 salt 得到相同哈希、不同 salt 得到不同哈希、哈希不含明文 PIN。
- [x] **Step GREEN**: 建 `src/domain/model/types.ts`（Question / FiveStep / Profile / AnswerEvent / MasteryState / BestiaryEntry / Session / Settings 及事件 union）；建 `src/domain/crypto/hashPin.ts`，实现依赖注入的 `hashPin(pin, salt, digest)` 与 `verifyPin(pin, salt, hash, digest)`，默认注入 `crypto.subtle.digest`，测试注入同步 SHA-256 实现。
- [x] **Step REFACTOR**: 为每个导出加 JSDoc（含 `@throws`）；把 `digest` 注入类型收敛为窄接口 `DigestFn`，不泄漏 Web Crypto 全局类型到 domain；跑全套测试。
- [x] **验证**: 单测覆盖 hashPin 全部分支；`hashPin` 输出不包含子串 "1234"（对 PIN=1234 的情况）。
- [x] **Commit**: `[DSM1234] feat: T2 - domain models and pin hashing`

### Task 3: 答案判等与五步状态机

- [ ] **Step RED**: 写 `tests/domain/quiz/answerJudgement.test.ts`：断言 `6`/`6颗`/`6 颗` 对答案 `{value:6,unit:'颗'}` 均判对，`8` 判错，`24÷4` 对 `{expression:'24÷4'}` 判对，`6/24` 判错。写 `tests/domain/quiz/fiveStepMachine.test.ts`：断言合法迁移 KNOWN→UNKNOWN→RELATION→EXPRESSION→ANSWER、非法迁移抛错、已完成步可回看不可重做。
- [ ] **Step GREEN**: 建 `src/domain/quiz/answerJudgement.ts`（数值归一化 / 单位归一化 / 算式 token 比对三路判等）与 `src/domain/quiz/fiveStepMachine.ts`（纯函数状态机，无副作用）。
- [ ] **Step REFACTOR**: 抽出单位映射表 `unitAliases`；给两个模块补 JSDoc；确保 machine 返回新状态对象而非原地修改；跑全套测试。
- [ ] **验证**: 三路判等各有正反用例；状态机对任意非法迁移稳定抛错。
- [ ] **Commit**: `[DSM1234] feat: T3 - answer judgement and five-step machine`

### Task 4: 组题与难度自适应

- [ ] **Step RED**: 写 `tests/domain/quiz/buildDailyQuest.test.ts`：给定 60 题池与 settings(5/3/1)，断言返回 9 题；断言已独立掌握的题被排除、池不足时 `repeatCount>0`；断言注入固定 `idGenerator` 与 `clock` 后**两次调用结果完全一致**（确定性）；写 `tests/domain/quiz/difficulty.test.ts`：断言连续答对升档、连续提示后答对降档、clamp 在 1..3 内、回落写 `difficultyFallback`。
- [ ] **Step GREEN**: 建 `src/domain/quiz/difficulty.ts`（依据 masteryByTopic 事件摘要计算档位）与 `src/domain/quiz/buildDailyQuest.ts`（按三类数量取题 + 排除已掌握 + 确定性排序）。
- [ ] **Step REFACTOR**: 取题算法改为单次分区而非三次过滤（避免循环内重复遍历）；补 JSDoc；跑全套测试。
- [ ] **验证**: 注入固定时钟与 ID 发生器时，同输入必同输出（回归锁定确定性）。
- [ ] **Commit**: `[DSM1234] feat: T4 - daily quest builder and difficulty adaptation`

### Task 5: 掌握状态机与提示链选择

- [ ] **Step RED**: 写 `tests/domain/mastery/masteryStateMachine.test.ts`：断言未掌握→独立掌握、提示后→提示后掌握、看答案→提示后掌握、同题型连续 3 次独立答对→题型稳定掌握、看答案后不得进独立掌握。写 `tests/domain/hint/hintChainSelector.test.ts`：断言同一题第 n 次取提示返回第 n 层、超过 5 层不再前进、步内提示返回该步专属文案。
- [ ] **Step GREEN**: 建 `src/domain/mastery/masteryStateMachine.ts`（题目级 + 题型级双轨迁移）与 `src/domain/hint/hintChainSelector.ts`。
- [ ] **Step REFACTOR**: 迁移表抽为纯数据结构 `MASTERY_TRANSITIONS`，去掉散落的 if 分支；补 JSDoc；跑全套测试。
- [ ] **验证**: 状态机每个迁移分支至少一条正反用例。
- [ ] **Commit**: `[DSM1234] feat: T5 - mastery state machine and hint chain`

### Task 6: 事件日志、ID 幂等与投影重建

- [ ] **Step RED**: 写 `tests/domain/eventLog/eventLog.test.ts`：断言 `appendEvents` 对同一 `eventId` 去重、对同一 `sessionId+questionId+retryCount+level` 逻辑组合去重；写 `tests/domain/eventLog/replay.test.ts`：构造一段真实事件序列，断言 `replayProjections(events)` 得到的 `questProgress` / `masteryByQuestion` / `mistakeBook` / `bestiaryUnlock` 与逐事件增量维护的结果**深度相等**。
- [ ] **Step GREEN**: 建 `src/domain/eventLog/ids.ts`（可注入 `randomUUID`）、`src/domain/eventLog/appendEvents.ts`（去重规则）、`src/domain/eventLog/replay.ts`（reduce 出全部投影）。
- [ ] **Step REFACTOR**: 重放改为一次 `reduce` 处理全量事件（**禁止循环内逐条查询**）；补 JSDoc；跑全套测试。
- [ ] **验证**: 随机事件序列（固定种子的 fuzz 循环 200 次）下重放与增量始终一致。
- [ ] **Commit**: `[DSM1234] feat: T6 - event log idempotency and projection replay`

### Task 7: 解锁与奖励规则

- [ ] **Step RED**: 写 `tests/domain/reward/unlockRules.test.ts`：断言整组完成必得图鉴卡+徽章、独立答对率≥60% 额外得独立掌握徽章、未完成不得解锁、奖励计算不依赖随机数。写 `tests/domain/reward/rewardGrant.test.ts`：断言追加型事件（无 `unlock-revoked` 类型）、重复完成同一题组不重复发奖。
- [ ] **Step GREEN**: 建 `src/domain/reward/unlockRules.ts` 与 `src/domain/reward/rewardGrant.ts`。
- [ ] **Step REFACTOR**: 奖励规则抽为可声明的 `RewardRule[]`；补 JSDoc；跑全套测试。
- [ ] **验证**: 单测断言模块中不存在 `unlock-revoked` 字符串（防回退语义回流）。
- [ ] **Commit**: `[DSM1234] feat: T7 - unlock and reward rules`

### Task 8: 题库与生物内容（含内容校验测试）

- [ ] **Step RED**: 写 `tests/data/content/questionBank.test.ts`：载入 `src/data/content/questionBank.json`，逐条断言必填字段非空、`answer` 合法、`hints.length === 5`、`similarQuestionIds` 均存在于题库、`requiresFiveStep=true` 的题必有 `steps`、`sources` 非空。写 `tests/data/content/creatures.test.ts`：断言 4 条条目学名/深度范围/知识卡 3–5 条/来源链接均非空，且深度文案为区间形式。
- [ ] **Step GREEN**: 写 `src/data/content/questionBank.json`（60–80 题，覆盖六类题型 × 三档难度，深海宠物任务包装，每条带 sources）与 `src/data/content/creatures.json`（4 条：约翰逊鮟鱇鱼 *Melanocetus johnsonii* + 其余 3 条自规格 12 候选中选取），含原创插画引用占位与知识卡。
- [ ] **Step REFACTOR**: 抽 `src/data/content/schema.ts` 与共享校验函数供运行时复用；为题库加分类索引减少查询遍历；跑全套测试。
- [ ] **验证**: 题库通过 schema 校验；`npm run test` 中内容测试全绿；深度断言拒绝"唯一固定深度"表述。
- [ ] **Commit**: `[DSM1234] feat: T8 - question bank and creature content with validation`

### Task 9: IndexedDB 仓储、版本迁移与降级

- [ ] **Step RED**: 写 `tests/data/repositories/*.test.ts`（用 `fake-indexeddb`）：断言 eventRepo 写入后读回一致、同 eventId 重复写入不产生两条、按 profileId 隔离；断言 `openDb` 版本迁移从 v0 到 v1 保留既有事件；断言 `resolveStorage` 在 `indexedDB.open` 抛错时返回内存态实现且界面层可见降级标记。
- [ ] **Step GREEN**: 建 `src/data/db.ts`（对象库：`events` / `projections` / `profiles` / `settings`，v1 schema + migration）、`src/data/memoryFallback.ts`、`src/data/repositories/{profileRepo,eventRepo,settingsRepo,bestiaryRepo}.ts`（接口与实现分离，便于内存态替换）。
- [ ] **Step REFACTOR**: 仓储读取统一 `getAll` 一次取回后在内存处理（不在循环内逐条读）；补 JSDoc；跑全套测试。
- [ ] **验证**: 降级路径有单测覆盖；`npm run type-check` 通过。
- [ ] **Commit**: `[DSM1234] feat: T9 - indexeddb repositories migration and fallback`

### Task 10: 全局深海主题样式与 FishBackdrop

- [ ] **Step RED**: 写 `tests/features/theme/FishBackdrop.test.ts`：断言组件渲染出至少 1 条鱼形 `<svg>` 且带 `data-testid="fish-backdrop"`；写 `tests/features/theme/contrast.test.ts`：断言主题 CSS 变量中正文色与背景色对比度 ≥ 4.5:1（用可访问性对比度工具函数计算）。
- [ ] **Step GREEN**: 建 `src/styles/theme.css`（设计稿 A 的色板与字号阶，深靛蓝渐变 + 暖橙强调 + 微光粒子变量）、`src/features/theme/FishBackdrop.vue`（SVG 鱼群，缓慢漂移动画，`prefers-reduced-motion` 时静止）。
- [ ] **Step REFACTOR**: 鱼群元素数量与尺寸参数化；动画改用 transform（不触发重排）；抽取 `contrastRatio()` 到共享工具；跑全套测试。
- [ ] **验证**: 对比度测试通过（儿童可读硬门槛）。
- [ ] **Commit**: `[DSM1234] feat: T10 - deep-sea theme and fish backdrop`

### Task 11: 档案选择与 PIN 交互

- [ ] **Step RED**: 写 `tests/features/profileSelect/ProfileSelectView.test.ts`：断言档案列表渲染、选中档案出现 PIN 盘、PIN 错误显示"再试一次"且不含错因、连续 5 次错误后按钮禁用并显示 60 秒倒计时（注入假时钟）。写 `tests/features/profileSelect/useProfileSelect.test.ts`：断言成功后进入 Home 且 store 载入该档案投影。
- [ ] **Step GREEN**: 建 `ProfileCard.vue` `PinPad.vue` `useProfileSelect.ts` 与 `views/ProfileSelectView.vue`；接入 Task 2 的 hashPin/verifyPin 与 Task 9 的 profileRepo。
- [ ] **Step REFACTOR**: 锁定倒计时逻辑移到 composable，组件只渲染；跑全套测试。
- [ ] **验证**: 单测断言错误提示文案不含"错误""不对"等归因措辞之外的敏感信息；日志经 `redact()` 脱敏。
- [ ] **Commit**: `[DSM1234] feat: T11 - profile select and pin interaction`

### Task 12: 首页（地图主体 + 任务卡浮层）

- [ ] **Step RED**: 写 `tests/features/home/HomeView.test.ts`：断言渲染 `MapPanel` 与 `QuestCard`；有未完成题组时展示进度"N / 9"与"开始下潜"按钮，无题组时展示"领取今日任务"；断言 `FishBackdrop` 出现在首页。
- [ ] **Step GREEN**: 建 `views/HomeView.vue`、`MapPanel.vue`（起点潜水艇基地 + 四区 + 深度刻度）、`QuestCard.vue`（预计用时 / 进度 / 目标奖励 / 开始按钮）、`DepthScale.vue`、`TabBar.vue`；按设计稿 A 布局。
- [ ] **Step REFACTOR**: 地图区数据驱动（`zones` 配置数组），避免硬编码四个 `<div>`；跑全套测试。
- [ ] **验证**: 视觉对齐设计稿 A；首页不出现任何网络请求。
- [ ] **Commit**: `[DSM1234] feat: T12 - home view with map panel and quest card`

### Task 13: 答题页与五步引导

- [ ] **Step RED**: 写 `tests/features/quizStage/QuizStage.test.ts`：断言基础题不显示 `FiveStepBar`、应用题显示且停在第一步；点选已知条件后自动前进到下一步；`HintStack` 初始只显示 0 层、点击一次显示第 1 层、第三次显示第 3 层；`Numpad` 输入/退格/运算符正确。写 `tests/features/quizStage/useQuizSession.test.ts`：断言提交答案后写事件、答错不显示红色弹窗、订正答对后追加相似题、看答案后事件带 `revealedAnswer`。
- [ ] **Step GREEN**: 建 `StageHeader.vue` `QuizStage.vue` `FiveStepBar.vue` `StepBody.vue` `HintStack.vue` `Numpad.vue` `useQuizSession.ts` 与 `views/QuestView.vue`；接通 Task 3/4/5/6 的 domain 函数与仓储。
- [ ] **Step REFACTOR**: 五步渲染改为按 `stepType` 映射组件表；抽 `submitting` 状态防止重复提交；跑全套测试。
- [ ] **验证**: 规格 `hint-and-correction` 与 `daily-math-quest` 的每个 Scenario 均有对应用例。
- [ ] **Commit**: `[DSM1234] feat: T13 - quest view with five-step guidance and hints`

### Task 14: 图鉴、观察舱与地图视图

- [ ] **Step RED**: 写 `tests/features/bestiary/BestiaryView.test.ts`：断言未解锁生物显示剪影与"继续下潜解锁"、已解锁显示名称与插画；`ObservationView` 断言展示学名/深度区间/知识卡 3–5 条/来源，且标注"原创示意插画"。写 `tests/features/bestiary/CreatureCanvas.test.ts`：断言插画加载失败时显示文字占位且知识卡仍渲染。
- [ ] **Step GREEN**: 建 `views/BestiaryView.vue` `views/ObservationView.vue` `views/MapView.vue` 与 `CreatureCanvas.vue` `KnowledgeCardList.vue` `SourceNote.vue`；读取 Task 8 的 `creatures.json` 与投影中的解锁状态。
- [ ] **Step REFACTOR**: 生物条目渲染抽为复用组件；插画加载失败统一用 `onError` 降级；跑全套测试。
- [ ] **验证**: 深度文案全部为区间表述（内容测试已锁，这里补 UI 断言）。
- [ ] **Commit**: `[DSM1234] feat: T14 - bestiary observation and map views`

### Task 15: 错题本

- [ ] **Step RED**: 写 `tests/features/mistakeBook/MistakeBookView.test.ts`：断言按题型与掌握状态筛选、空态提示、点击错题进入重练并携带相似题。
- [ ] **Step GREEN**: 建 `views/MistakeBookView.vue`、`MistakeList.vue`、`MistakeFilter.vue`，读 `mistakeBook` 投影。
- [ ] **Step REFACTOR**: 筛选逻辑抽为纯函数并加单测；跑全套测试。
- [ ] **验证**: 筛选纯函数有用例覆盖。
- [ ] **Commit**: `[DSM1234] feat: T15 - mistake book`

### Task 16: 家长区（设置 / 报告 / PIN 重置 / 删除档案）

- [ ] **Step RED**: 写 `tests/features/parentPanel/*.test.ts`：断言修改三类题量与时长上限后写 `settings-updated` 事件且次日生效；报告展示完成题数/平均用时/提示次数/掌握分布；索引库降级时常驻警示条出现；删除档案需二次确认并输入档案昵称，确认后该档案数据被清除。
- [ ] **Step GREEN**: 建 `views/ParentView.vue`、`SettingsForm.vue`、`ReportPanel.vue`、`DangerZone.vue`；存储降级时从 `resolveStorage` 的降级标记驱动警示条。
- [ ] **Step REFACTOR**: 报告数据由 `replayProjections` 单次计算，避免多处重复 reduce；跑全套测试。
- [ ] **验证**: 单测断言家长区渲染内容不含 PIN 明文；`redact()` 覆盖日志出口。
- [ ] **Commit**: `[DSM1234] feat: T16 - parent panel settings report and deletion`

### Task 17: 解锁反馈、路由与整体装配

- [ ] **Step RED**: 写 `tests/App.test.ts`：断言整组完成后 `UnlockOverlay` 出现并展示奖励名；断言路由 `/` 重定向到档案选择、`/home` `/quest` `/bestiary` `/observation/:id` `/mistakes` `/parent` 可达；断言 `prefers-reduced-motion` 下鱼群静止。
- [ ] **Step GREEN**: 建 `UnlockOverlay.vue`，配置 `src/router/index.ts` 全部路由与导航守卫（未选档案跳档案选择），在 `App.vue` 组装全局布局。
- [ ] **Step REFACTOR**: 守卫逻辑抽为纯函数 `nextRoute(state)` 并单测；跑全套测试。
- [ ] **验证**: `npm run test` 全绿、`npm run type-check` 通过、`npm run build` 成功；真机 iOS Safari / Android Chrome 手动验收首页→答题→订正→解锁→观察舱全流程。
- [ ] **Commit**: `[DSM1234] feat: T17 - unlock overlay routing and app assembly`

### Task 18: README 与收尾

- [ ] **Step RED**: 写 `tests/readme.test.ts`：断言 `README.md` 含"快速开始""配置说明""使用示例"三节且命令块可解析（含 `npm install` 与 `npm run dev`），含 `src/README.md` 分层说明。
- [ ] **Step GREEN**: 重写 `README.md`（项目简介 / 快速开始 / 目录分层 / 配置说明 / 使用示例 / 阶段一范围与后续阶段说明），写 `src/README.md` 说明 domain-data-features-views 依赖方向。
- [ ] **Step REFACTOR**: 清理无用占位文件与示例代码；统一 JSDoc；跑全套测试。
- [ ] **验证**: `npm run test` 全绿、覆盖率 ≥ 80%（domain ≥ 90%）；`openspec validate dsm1234 --strict` 通过。
- [ ] **Commit**: `[DSM1234] docs: T18 - readme and wrap-up`


