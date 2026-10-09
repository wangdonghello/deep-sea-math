# `src/domain/` —— 纯业务规则

**职责**：全部教学规则、判等逻辑、状态机、投影重放，纯 TypeScript，**零依赖**。

## 硬约束

- 不得 `import` Vue、`vue-router`、`pinia` 或任何组件。
- 不得访问 `window` / `document` / `indexedDB` / `localStorage` 等浏览器全局。
- 时间、随机数、UUID、摘要算法必须由**调用方注入**（`clock` / `idGenerator` / `digest`），
  否则单元测试不可复现。
- 所有导出必须有 JSDoc（含 `@throws`），这是企业基线 SOFT_RULE。

## 规划中的子目录

| 子目录 | 职责 |
|---|---|
| `model/` | 值对象与类型：`Question` / `FiveStep` / `Profile` / `AnswerEvent` / `MasteryState` / `BestiaryEntry` / `Session` / `Settings` 及事件 union |
| `quiz/` | `buildDailyQuest` / `difficulty` / `answerJudgement` / `fiveStepMachine` |
| `mastery/` | `masteryStateMachine`（未掌握 → 提示后 → 独立 → 稳定） |
| `reward/` | `unlockRules` / `rewardGrant`（奖励为追加型，无回退） |
| `hint/` | `hintChainSelector`（固定 5 层提示链） |
| `eventLog/` | `eventId` / `appendEvents` 去重 / `replayProjections` |
| `crypto/` | `hashPin` / `verifyPin`（Web Crypto 抽象，注入以便 Node 测试） |

本目录在 Task 1 阶段仅为占位，尚无代码。快速开始请见仓库根目录的 `README.md`。
