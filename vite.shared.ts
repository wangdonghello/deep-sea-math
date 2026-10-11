/// <reference types="node" />
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * Vite / Vitest 共享配置。
 *
 * 抽出来的原因：`vite.config.ts`（生产构建）与 `vitest.config.ts`（测试）
 * 本应使用完全相同的 SFC 编译插件与路径别名。若两份配置各自硬编码，
 * 将来只改一处就会造成"单测全绿但 `npm run build` 失败"且没有任何测试
 * 能捕获的分裂。
 *
 * 注意：Vitest **只**读取 `vitest.config.ts`，不会自动合并
 * `vite.config.ts`，因此测试配置必须显式 `import` 本模块。
 */

/** `@` → `./src` 的路径别名。 */
export const alias: Record<string, string> = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
}

/** `.vue` 单文件组件编译插件（测试与生产构建共用）。 */
export const plugins = [vue()]
