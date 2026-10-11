import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `tests/readme.test.ts` —— 项目文档的可执行契约（Task 18）。
 *
 * 文档也会腐烂：某一节被删、命令块丢了语言标签导致不再被任何工具高亮、
 * 分层说明与真实代码结构脱节，都不会有编译错误或单测报警。因此把"新人照着
 * README 能不能把项目跑起来"这件事变成断言：
 *   1. 根 README 必须含七个必备章节（缺一节就意味着有人复制不了流程）；
 *   2. 命令块必须能解析（围栏闭合 + 带语言标签）且真的含 `npm install` /
 *      `npm run dev` —— 少了任何一条，"快速开始"就是假的；
 *   3. 配置节必须覆盖部署子路径与 GitHub Pages 触发器，否则只读文档的部署
 *      必然失败；
 *   4. `src/README.md` 必须列出全部六层与依赖方向 —— 新代码放进错误的层
 *      （比如在 `domain/` 里 import Vue）是分层架构唯一的失效方式。
 *
 * 断言只锁**结构**（章节名、命令、层级名、方向箭头），不锁文案措辞：
 * README 的内容会持续演进，锁措辞只会逼人每次改文档都改测试。
 */

/** 仓库根目录（测试位于 `tests/` 下一层）。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 读一份文档；传入相对仓库根的路径。 */
function readDoc(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

/** 抓出 `##` 二级标题文本（README 的章节结构）。 */
function sections(markdown: string): string {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]).join('\n')
}

/** 抓出全部围栏代码块，返回「语言标签 + 代码内容」。 */
function fencedBlocks(markdown: string): Array<{ lang: string; code: string }> {
  return [...markdown.matchAll(/^```([a-zA-Z]*)\n([\s\S]*?)^```/gm)].map((match) => ({
    lang: match[1],
    code: match[2],
  }))
}

describe('readme: 根 README 结构', () => {
  const readme = readDoc('README.md')

  it('含七个必备章节', () => {
    const titles = sections(readme)
    for (const required of ['项目简介', '快速开始', '目录分层', '配置说明', '使用示例', '阶段一', '测试']) {
      expect(titles).toContain(required)
    }
  })

  it('命令块可解析，且含 npm install 与 npm run dev', () => {
    const blocks = fencedBlocks(readme)
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    for (const block of blocks) expect(block.lang).not.toBe('')
    expect(blocks.some((block) => block.code.includes('npm install'))).toBe(true)
    expect(blocks.some((block) => block.code.includes('npm run dev'))).toBe(true)
  })

  it('配置说明覆盖部署子路径 VITE_BASE 与 GitHub Pages', () => {
    expect(readme).toContain('VITE_BASE')
    expect(readme).toContain('GitHub Pages')
  })

  it('测试节给出 npm run test:coverage 与覆盖率门槛', () => {
    expect(readme).toContain('npm run test:coverage')
    expect(readme).toContain('80%')
  })
})

describe('readme: src/README.md 分层说明', () => {
  const srcReadme = readDoc('src/README.md')

  it('列出全部六层与 domain 零依赖理由', () => {
    for (const layer of ['domain', 'data', 'features', 'views', 'router', 'app', 'shared']) {
      expect(srcReadme).toContain(layer)
    }
    expect(srcReadme).toContain('零依赖')
  })

  it('给出 views → features → domain 的单向依赖方向', () => {
    expect(srcReadme).toMatch(/views[^\n]*→[^\n]*features[^\n]*→[^\n]*domain/)
  })
})
