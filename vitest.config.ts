/// <reference types="node" />
import { defineConfig } from 'vitest/config'

import { alias, plugins } from './vite.shared.ts'

/**
 * Vitest 配置。
 *
 * Vitest **只**读取本文件、不会自动合并 `vite.config.ts`，因此从这里
 * 显式引入 `./vite.shared.ts`，使测试期的 SFC 编译插件与 `@ → src` 别名
 * 和生产构建使用同一份定义。
 *
 * - `environment: 'jsdom'`：应用是手机网页，组件测试需要真实 DOM。
 *   **jsdom 不提供 IndexedDB 全局**，从 Task 9 起需要在测试 setup 中
 *   注入 `fake-indexeddb`（在 jsdom 下 `indexedDB` 直接是 undefined）。
 * - `globals: true`：测试文件可直接使用 `describe` / `it` / `expect`；
 *   对应类型由 `tsconfig.test.json` 的 `vitest/globals` 提供（因此测试
 *   文件既可以显式导入、也可以直接用全局，两种写法都能过类型检查）。
 */
export default defineConfig({
  plugins,
  resolve: {
    alias,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // 只统计 src 下真正参与运行时代码的文件；README / 声明文件不入统计。
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
        // 入口装配文件：只做 createApp/mount 的接线，无业务分支。
        'src/main.ts',
      ],
      /*
       * design §6 的覆盖率门槛（总体行覆盖 ≥ 80%）。
       * 此处先配好，18 个 task 的测试逐步补齐过程中持续有效；
       * 若阶段性未达标，`npm run test:coverage` 会以非零退出码提示。
       */
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
