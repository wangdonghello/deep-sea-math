# `src/` 分层说明

四层结构，**依赖方向单向向下**：`views → features → domain ← data`。
`domain` 不依赖 Vue、不依赖浏览器 API，因此可在 Node 下被纯单测覆盖。

```
src/
  domain/     纯 TypeScript 业务规则（无 Vue / 无 DOM）
  data/       IndexedDB 仓储 + 内容种子数据
  features/   按功能域的 Vue 组合式逻辑与组件
  views/      路由级页面
  router/     路由定义（Task 17 补齐导航守卫）
  styles/     全局主题样式（Task 10 补齐色板）
  App.vue     根组件
  main.ts     入口
```

## 依赖规则

| 层 | 允许依赖 | 禁止依赖 |
|---|---|---|
| `views/` | `features/`、`domain/`、`router/` | 直接读写 IndexedDB、直接调用仓储实现 |
| `features/` | `domain/` | `views/`（反向依赖）、`data/repositories/` 之外的直接 DOM 操作 |
| `domain/` | 仅自身与被注入的窄接口 | Vue、`window`、`document`、`indexedDB`、任何框架运行时 |
| `data/` | `domain/`（类型与纯函数）、`idb` | `features/`、`views/` |

## 可注入单例

`crypto`、`storage`、`clock`、`idGenerator` 四个注入点，是让 `domain/`
在 Vitest 中获得确定性结果的关键——否则时间与随机数会让组题判定不可复现。

快速开始请见仓库根目录的 `README.md`。
