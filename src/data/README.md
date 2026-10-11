# `src/data/` —— 存储与内容种子

**职责**：IndexedDB 持久化、版本迁移、存储降级，以及题库 / 生物内容种子数据。与 `domain/` 平级：可依赖 `domain/` 的类型与纯函数，**不得**被 `domain/` 反依赖，也不得 import `features/` / `views/`。

## 硬约束

- 所有读写都是 **Promise**（异步非阻塞），不得同步阻塞渲染线程。
- 禁止在循环中逐条 `await` / 逐条 `get`：先用 `getAll` 一次取回，再在内存处理。
- 接口与实现分离（`profileRepo` / `eventRepo` / `settingsRepo` / `bestiaryRepo`），以便 IndexedDB 不可用时整体替换为内存态。

## 文件

| 文件 | 职责 |
|---|---|
| `db.ts` | IndexedDB schema（对象库 `events` / `projections` / `profiles` / `settings`）、v1 版本迁移、`resolveStorage()` 门面解析 |
| `repositories/` | 四仓储的接口 + IndexedDB 实现 + 内存态实现 |
| `memoryFallback.ts` | 存储降级：`indexedDB.open` 失败时切换内存态并置 `degraded` / `degradedReason` |
| `content/` | `questionBank.json`（72 题）、`creatures.json`（4 物种）、`schema.ts`（运行时校验）、`index.ts`（导出 `QUESTION_BANK` / `CREATURE_BANK` / `QUESTION_INDEX`） |

`resolveStorage()` 返回统一门面：正常为 `kind: 'indexeddb'`，IndexedDB 不可用时为 `kind: 'memory'` 并置 `degraded` / `degradedReason`，家长区警示条据此渲染。测试用 `fake-indexeddb` 注入全局 `indexedDB`（jsdom 不实现 IndexedDB）——必须整组注入 `IDBRequest` 等构造器，只赋 `indexedDB` 不够，见 `tests/data/fakeIndexedDb.ts`。

分层总览与依赖方向见 [`../README.md`](../README.md)。
