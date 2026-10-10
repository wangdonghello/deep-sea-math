import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compositeOver, contrastRatio, parseColor } from '@/features/theme/contrastRatio'
import { describe, expect, it } from 'vitest'

/**
 * Task 10 的儿童可读硬门槛（design §6 / 视觉规范「正文色与背景色对比度
 * ≥ 4.5:1」）。
 *
 * 做法：直接**解析 `src/styles/theme.css` 的 CSS 自定义属性**，而不是把颜色
 * 抄一份到测试里。抄一份的话，将来只改色板不改测试，门槛就会静默失效。
 *
 * 断言口径：
 * - 每个正文/辅助/弱化文字色，对**渐变背景的每一个色停**（`--ds-bg-*`）都
 *   必须 ≥ 4.5:1。浅色文字配深背景时，**最亮的那个色停**（`--ds-bg-shallow`）
 *   比分母最不利，因此这条是最严的。
 * - 主按钮文字 `--ds-on-accent` 对暖橙渐变的两个色停（`--ds-accent-500/600`）
 *   同样 ≥ 4.5:1，否则按钮上的字会糊。
 * - 玻璃卡片为半透明，测试里先用共享的 {@link compositeOver} 把它合成到
 *   最亮色停上再算 —— 半透明卡片在亮色停上的可读性比在深色停上更差，
 *   因此这是真实的最坏情况。
 */

/** WCAG 2.x 的最小对比度要求（正文 AA）。 */
const MIN_RATIO = 4.5

/**
 * theme.css 的绝对路径。
 *
 * 注意：测试跑在 jsdom 环境里，全局 `URL` 是 jsdom 的实现，会把相对 URL
 * 解析到 `http://localhost:3000`（文档 baseURI）而不是测试文件位置 —— 所以
 * 这里必须先用 `fileURLToPath` 得到测试文件的真实路径，再用 `node:path`
 * 拼相对路径，不能写 `new URL('../../../src/...', import.meta.url)`。
 */
const THEME_CSS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../src/styles/theme.css',
)

/** 从 theme.css 里抓出 `--ds-*` 自定义属性的字面值（不做任何解释）。 */
function readTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  const pattern = /(--ds-[\w-]+)\s*:\s*([^;]+);/g
  for (const match of css.matchAll(pattern)) {
    tokens.set(match[1], match[2].trim())
  }
  return tokens
}

const css = readFileSync(THEME_CSS_PATH, 'utf8')
const tokens = readTokens(css)

/** 取一个 token 的值，缺失即失败（附带「色板确实读过文件」的语义）。 */
function token(name: string): string {
  const value = tokens.get(name)
  expect(value, `theme.css 缺少设计稿 A 要求的 ${name}`).toBeDefined()
  return value as string
}

/** 把一个解析后的颜色重新格式化成 `rgb(r, g, b)` 字面量。 */
function toCssRgb(color: { r: number; g: number; b: number }): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
}

describe('深海主题对比度（儿童可读硬门槛）', () => {
  it('theme.css 定义了设计稿 A 的完整色板与字号阶', () => {
    // 只断言"存在"，不锁定具体色值 —— 具体色值由下面的对比度测试把关
    const required = [
      '--ds-bg-deep',
      '--ds-bg-mid',
      '--ds-bg-shallow',
      '--ds-text-primary',
      '--ds-text-secondary',
      '--ds-text-muted',
      '--ds-accent-500',
      '--ds-accent-600',
      '--ds-accent-text',
      '--ds-on-accent',
      '--ds-glow-primary',
      '--ds-glow-secondary',
      '--ds-glass-surface',
      '--ds-font-size-body',
      '--ds-font-size-title',
      '--ds-glass-particle',
      '--ds-glass-glow',
    ]
    for (const name of required) {
      expect(tokens.has(name), `theme.css 缺少 ${name}`).toBe(true)
    }
  })

  it('正文/辅助/弱化文字色对每一个背景色停都 ≥ 4.5:1', () => {
    const bgStops = ['--ds-bg-deep', '--ds-bg-mid', '--ds-bg-shallow']
    const textColors = [
      '--ds-text-primary',
      '--ds-text-secondary',
      '--ds-text-muted',
      '--ds-accent-text',
    ]

    for (const bgName of bgStops) {
      const bg = token(bgName)
      for (const textName of textColors) {
        const ratio = contrastRatio(token(textName), bg)
        expect(
          Number.isFinite(ratio),
          `${textName} (${token(textName)}) 无法被 contrastRatio 解析`,
        ).toBe(true)
        // 失败信息带实测比值，调色时直接看到差多少
        expect(ratio, `${textName} on ${bgName} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          MIN_RATIO,
        )
      }
    }
  })

  it('主按钮文字对暖橙渐变两个色停都 ≥ 4.5:1', () => {
    const buttonText = token('--ds-on-accent')
    for (const accent of ['--ds-accent-500', '--ds-accent-600', '--ds-accent-text']) {
      const ratio = contrastRatio(buttonText, token(accent))
      expect(
        ratio,
        `--ds-on-accent on ${accent} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_RATIO)
    }
  })

  it('玻璃卡片上的文字（半透明合成后）仍 ≥ 4.5:1', () => {
    // 半透明卡片叠在最亮色停上是最不利情况；合成复用共享工具，避免测试里
    // 另抄一套混合公式
    const glass = compositeOver(
      parseColor(token('--ds-glass-surface')),
      parseColor(token('--ds-bg-shallow')),
    )
    const composited = toCssRgb(glass)
    for (const textName of ['--ds-text-primary', '--ds-text-secondary', '--ds-text-muted']) {
      const ratio = contrastRatio(token(textName), composited)
      expect(
        ratio,
        `${textName} on 玻璃卡片(${composited}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_RATIO)
    }
  })

  it('contrastRatio() 自身符合 WCAG 定义', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#776655', '#776655')).toBeCloseTo(1, 5)
  })
})
