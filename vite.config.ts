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
  build: {
    /**
     * 体积告警阈值（kB）。
     *
     * 默认 500 会被 `three` 撑爆：它的 minified 产物约 640 kB，而本应用只有
     * 观察舱的 3D 模型用到它（`features/bestiary/CreatureModelViewer.vue`，
     * 懒加载）。这不是"压不下来所以调高阈值"——而是这个块本就该单独存在：
     * 拆开后它不会随业务代码的每次发布而失效，手机上也只在真正打开 3D
     * 观察舱时才下载（gzip 后约 162 kB）。
     */
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        /**
         * 把 `three` 及其 addons 收进独立 vendor 块。
         *
         * 用函数形式而不是 `{ three: ['three'] }` 对象形式：`three/addons/*`
         * 在产物里解析为 `three/examples/jsm/**`，对象形式匹配不到这些子路径，
         * 会把 loader 拆成另一块，两个块互相 import 反而多一次请求。
         */
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor'
        },
      },
    },
  },
})
