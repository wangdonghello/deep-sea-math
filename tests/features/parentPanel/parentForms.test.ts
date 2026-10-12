import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * P2 回归的守门测试。
 *
 * P2 删除 `views/ParentView.vue` 时，那段负责表单外观的 scoped 样式一起消失，
 * 输入框退化成浏览器默认控件——那时没有任何测试会失败，因为它**只影响观感**。
 * 这里把"家长区共享外观确实存在、且确实被外壳引入"变成可断言的事实：
 *
 * - 样式必须以 `.parent-section` 为作用域（三页与其子组件都在该根节点内）；
 * - 必须覆盖 text/password/number 三类输入（家长的昵称、PIN、题量都走它们）；
 * - 字号必须 ≥ 16px（< 16px 时 iOS Safari 聚焦会自动放大整页）。
 *
 * 只断言"规则存在"，不断言任何具体色值——色板改动不该让这个测试变红。
 */
const HERE = dirname(fileURLToPath(import.meta.url))

function read(relativePath: string): string {
  return readFileSync(resolve(HERE, relativePath), 'utf8')
}

describe('parent section shared form styles', () => {
  const css = read('../../../src/styles/parentForms.css')
  const shell = read('../../../src/features/parentPanel/ParentSectionShell.vue')
  /** 注释里会出现中文逗号与反引号，先剥掉注释再解析选择器，避免误判。 */
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

  it('is imported once by ParentSectionShell so all three sections share it', () => {
    expect(shell).toContain('@/styles/parentForms.css')
  })

  it('scopes every rule to the parent section root', () => {
    // 抓出所有选择器，逐条要求带 `.parent-section` 前缀：漏了前缀就会全局生效
    const selectors = [...withoutComments.matchAll(/(?:^|\})\s*([^{}]+)\{/g)]
      .map((match) => match[1]!.trim())
      .filter((selector) => selector.length > 0)
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim(), `选择器未限定在家长区根节点：${part}`).toContain('.parent-section')
      }
    }
  })

  it('styles the text, password and number inputs parents actually type into', () => {
    for (const type of ['text', 'password', 'number']) {
      expect(css).toContain(`input[type='${type}']`)
    }
  })

  it('keeps the inputs at 16px or more so iOS does not zoom the page on focus', () => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]))
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
  })
})
