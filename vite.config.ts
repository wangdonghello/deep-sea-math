/// <reference types="node" />
import { defineConfig } from 'vite'

import { alias, plugins } from './vite.shared.ts'

/**
 * 生产构建配置。
 *
 * SFC 插件与 `@ → src` 别名统一定义在 `./vite.shared.ts`，
 * 并与 `vitest.config.ts` 共用，避免两处配置漂移。
 *
 * https://vite.dev/config/
 */
export default defineConfig({
  plugins,
  resolve: {
    alias,
  },
})
