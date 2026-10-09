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
| `db.ts` | IndexedDB schema + 版本迁移（v1） |
| `repositories/` | `profileRepo` / `eventRepo` / `settingsRepo` / `bestiaryRepo` |
| `memoryFallback.ts` | 存储降级：IndexedDB 不可用时切换内存态 |
| `content/` | 题库 JSON（60–80 题）、4 条生物条目、初始内容 |

本目录在 Task 1 阶段仅为占位，尚无代码。快速开始请见仓库根目录的 `README.md`。测试用 `fake-indexeddb` 注入全局
`indexedDB`（jsdom 不实现 IndexedDB）。
