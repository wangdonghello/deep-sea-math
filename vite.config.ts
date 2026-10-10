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
  /**
   * 部署到 GitHub Pages 的项目子路径 `/<repo>/`。
   *
   * 必须显式设置：默认 `base: '/'` 会让部署后的页面请求 `/src/main.ts`
   * 这类绝对路径，在 `https://<user>.github.io/deep-sea-math/` 下全部 404。
   * 可用 `VITE_BASE` 覆盖，便于本地预览生产产物（`VITE_BASE=/ npm run build`）。
   */
  base: process.env.VITE_BASE ?? '/deep-sea-math/',
})
