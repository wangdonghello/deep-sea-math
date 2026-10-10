# `src/data/` —— 存储与内容种子

**职责**：IndexedDB 持久化、版本迁移、存储降级，以及题库 / 生物内容种子数据。

## 硬约束

- 所有读写都是 **Promise**（异步非阻塞），不得同步阻塞渲染线程。
- 禁止在循环中逐条 `await` / 逐条 `get`：先用 `getAll` 一次取回，再在内存处理。
- 接口与实现分离（`profileRepo` / `eventRepo` / `settingsRepo` / `bestiaryRepo`），
  以便 IndexedDB 不可用时整体替换为内存态。
- 禁止 import `features/` 或 `views/`。

## 规划中的文件

| 文件 | 职责 |
|---|---|
| `db.ts` | IndexedDB schema + 版本迁移（v1）+ `resolveStorage` 门面解析 |
| `repositories/` | `profileRepo` / `eventRepo` / `settingsRepo` / `bestiaryRepo`（接口 + 实现分离） |
| `memoryFallback.ts` | 存储降级：IndexedDB 不可用时切换内存态 |
| `content/` | 题库 JSON（60–80 题）、4 条生物条目、初始内容（Task 8） |

`resolveStorage()` 返回统一门面：正常为 `kind: 'indexeddb'`，IndexedDB 不可用时为
`kind: 'memory'` 并置 `degraded` / `degradedReason`，家长区警示条据此渲染。测试用
`fake-indexeddb` 注入全局 `indexedDB`（jsdom 不实现 IndexedDB）——必须整组注入
`IDBRequest` 等构造器，只赋 `indexedDB` 不够，见 `tests/data/fakeIndexedDb.ts`。
