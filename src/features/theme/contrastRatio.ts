/**
 * 可访问性对比度工具（WCAG 2.x）。
 *
 * 存在的唯一理由：Task 10 把「正文色与背景色对比度 ≥ 4.5:1」定为儿童可读
 * 硬门槛（design §6）。这个门槛必须**在测试里从 `theme.css` 的 CSS 自定义
 * 属性现算**，否则换一次色板、测试没跟着改，深浅文字糊成一片也没人知道。
 * 因此本模块被 `tests/features/theme/contrast.test.ts` 直接依赖，不属于
 * 运行时渲染路径。
 *
 * 计算口径：
 * 1. 颜色先在 **sRGB gamma 空间**（未线性化）完成 alpha 合成 —— 与浏览器
 *    对 CSS 颜色的合成方式一致。
 * 2. 再按 WCAG 的相对亮度公式 `L = 0.2126R + 0.7152G + 0.0722B` 计算，
 *    其中 R/G/B 是线性化后的通道值。
 * 3. 对比度 = `(L_max + 0.05) / (L_min + 0.05)`，取值恒在 [1, 21]。
 */

/** 解析后的 RGBA 颜色，通道均为 0–255，alpha 为 0–1。 */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * 把 CSS 颜色字面量解析为 {@link Rgba}。
 *
 * 支持 `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()`
 * （`rgb()`/`rgba()` 只认逗号分隔，不认 `rgb(10 20 30)` 这种空格新语法，
 * 本仓库的 CSS 一律用逗号写法）；不接受颜色名（`red` 之类）与 `hsl()` ——
 * 多支持一种语法就多一条要维护的分支，而色板里根本不会出现。
 *
 * @param input CSS 颜色字面量，两侧允许有空白
 * @returns 解析结果；`alpha` 缺省为 1
 * @throws {TypeError} 输入不是上述任一形式、分量个数不对、分量含非数字，
 * 或通道值/alpha 越界
 */
export function parseColor(input: string): Rgba {
  const text = input.trim()
  if (text.length === 0) throw new TypeError('颜色不能是空字符串')

  if (text.startsWith('#')) {
    const hex = text.slice(1)
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new TypeError(`无法解析颜色 ${JSON.stringify(input)}：含非十六进制字符`)
    }
    /*
     * 上面已用 `^[0-9a-fA-F]+$` 校验过整段十六进制，因此这里的
     * `parseInt` 必然得到有限数，无需再判一次 `Number.isFinite`。
     */
    const expand = (pair: string) => Number.parseInt(pair.length === 1 ? pair + pair : pair, 16)
    if (hex.length === 3 || hex.length === 4) {
      return { r: expand(hex[0]), g: expand(hex[1]), b: expand(hex[2]), a: hex.length === 4 ? expand(hex[3]) / 255 : 1 }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: expand(hex.slice(0, 2)),
        g: expand(hex.slice(2, 4)),
        b: expand(hex.slice(4, 6)),
        a: hex.length === 8 ? expand(hex.slice(6, 8)) / 255 : 1,
      }
    }
    throw new TypeError(`无法解析颜色 ${JSON.stringify(input)}：十六进制位数应为 3/4/6/8`)
  }

  const functional = text.match(/^rgba?\(([^)]*)\)$/i)
  if (!functional) {
    throw new TypeError(
      `无法解析颜色 ${JSON.stringify(input)}：仅支持 #rgb/#rrggbb 与 rgb()/rgba()`,
    )
  }
  const parts = functional[1].split(',').map((part) => part.trim())
  if (parts.length < 3 || parts.length > 4) {
    throw new TypeError(`无法解析颜色 ${JSON.stringify(input)}：rgb()/rgba() 需要 3–4 个分量`)
  }
  if (parts.some((part) => part.length === 0)) {
    throw new TypeError(`无法解析颜色 ${JSON.stringify(input)}：分量不能为空`)
  }
  const [r, g, b] = parts.slice(0, 3).map((part) => Number(part))
  const a = parts.length === 4 ? Number(parts[3]) : 1
  const channels = [r, g, b] as const
  if (channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
    throw new TypeError(`无法解析颜色 ${JSON.stringify(input)}：RGB 分量须在 0–255 之间`)
  }
  if (!Number.isFinite(a) || a < 0 || a > 1) {
    throw new TypeError(`无法解析颜色 ${JSON.stringify(input)}：alpha 须在 0–1 之间`)
  }
  return { r, g, b, a }
}

/**
 * 在 sRGB gamma 空间把半透明前景合成到不透明背景上。
 *
 * @param foreground 前景色，`alpha < 1` 时逐通道按 alpha 插值
 * @param background 背景色，必须不透明（`a === 1`）
 * @returns 合成结果，`alpha` 恒为 1
 * @throws {TypeError} 背景带透明度时无法确定合成基准
 */
export function compositeOver(foreground: Rgba, background: Rgba): Rgba {
  if (background.a !== 1) {
    throw new TypeError('背景色必须不透明：半透明背景没有确定的合成基准')
  }
  if (foreground.a === 1) return { ...foreground }
  return {
    r: foreground.a * foreground.r + (1 - foreground.a) * background.r,
    g: foreground.a * foreground.g + (1 - foreground.a) * background.g,
    b: foreground.a * foreground.b + (1 - foreground.a) * background.b,
    a: 1,
  }
}

/**
 * WCAG 相对亮度。
 *
 * 通道先做 sRGB → 线性化（`c <= 0.03928` 时用 `c / 12.92`，否则
 * `((c + 0.055) / 1.055) ** 2.4`），再加权求和。
 *
 * @param color 任意 RGBA（alpha 不参与亮度计算）
 * @returns 相对亮度，取值 [0, 1]
 */
export function relativeLuminance(color: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b)
}

/**
 * 两个 CSS 颜色之间的 WCAG 对比度。
 *
 * @param foreground 文字色；半透明时会先按 alpha 合成到 {@link background} 上
 * @param background 背景色，必须不透明
 * @returns 对比度，取值 [1, 21]；`1` 表示完全同色，`21` 表示黑白
 * @throws {TypeError} 任一颜色无法解析，或背景带透明度
 */
export function contrastRatio(foreground: string, background: string): number {
  const bg = parseColor(background)
  const fg = compositeOver(parseColor(foreground), bg)
  const [lighter, darker] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}
