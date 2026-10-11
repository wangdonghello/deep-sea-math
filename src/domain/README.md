# `src/domain/` —— 纯业务规则

**职责**：全部教学规则、判等逻辑、状态机、投影重放。纯 TypeScript，**零依赖**：不 import Vue、不触碰任何浏览器/Node 全局，因此可在 Node 下被纯单测覆盖（`tests/domain/**`）。

## 硬约束

- 不得 `import` Vue、`vue-router`、`pinia` 或任何组件。
- 不得访问 `window` / `document` / `indexedDB` / `localStorage` 等浏览器全局。
- 时间、随机数、UUID、摘要算法必须由**调用方注入**（`clock` / `idGenerator` / `digest` / `randomUUID`），否则单元测试不可复现。
- 不得依赖 `data/`：业务规则不能与存储实现共生（换存储不应触及判等逻辑）。
- 所有导出必须有 JSDoc（含 `@throws`），这是企业基线 SOFT_RULE。

## 子目录

| 子目录 | 职责 |
|---|---|
| `model/` | 类型与常量元组：`Question` / `FiveStep` / `Profile` / `Session` / `Settings` / `BestiaryEntry`，及 `QUIZ_TYPES` / `QUEST_CATEGORIES` / `FIVE_STEP_TYPES` / `MASTERY_LEVELS` / `EVENT_TYPES` 与事件 union |
| `quiz/` | `answerJudgement`（三路判等）、`fiveStepMachine`（五步合法迁移）、`buildDailyQuest`（组题）、`difficulty`（档位自适应与回落）、`streakSignal`（连续独立答对） |
| `mastery/` | `masteryStateMachine`：题目级 + 题型级双轨四态迁移（未掌握 → 提示后 → 独立 → 稳定） |
| `reward/` | `unlockRules`（整组完成结算奖励）、`rewardGrant`（追加型发放，无回退事件） |
| `hint/` | `hintChainSelector`：固定 5 层提示链，第 n 次取提示得第 n 层 |
| `eventLog/` | `ids`（事件 ID）、`appendEvents`（幂等去重）、`replay`（`replayProjections` 单次 reduce 重建全部投影） |
| `crypto/` | `hashPin` / `verifyPin`：加盐 SHA-256，`digest` 注入以便 Node 测试 |

**没有 `unlock-revoked` 事件类型**：解锁是追加型事实，答错绝不回退已解锁内容——`tests/domain/reward/rewardGrant.test.ts` 以字符串断言锁住这条语义。

分层总览与依赖方向见 [`../README.md`](../README.md)。
