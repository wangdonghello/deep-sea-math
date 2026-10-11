import { compositeOver, contrastRatio, parseColor, relativeLuminance } from '@/features/theme/contrastRatio'
import { describe, expect, it } from 'vitest'

/**
 * `features/theme/contrastRatio` 的单元契约。
 *
 * 与 `contrast.test.ts` 分工：那个文件锁「色板对比度达标的业务结果」，
 * 本文件锁「工具函数本身的行为」——解析哪些语法、拒绝哪些输入、透明度
 * 怎么合成。解析规则一旦悄悄放宽（比如开始接受 `hsl()`），下游从 CSS
 * 里抓到的色值就可能被误算成合法值而无人知晓，所以这里逐条钉死。
 */

describe('parseColor', () => {
  it('解析 3/4/6/8 位十六进制', () => {
    expect(parseColor('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 })
    expect(parseColor('#abcd')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd / 255 })
    expect(parseColor('#aabbcc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 })
    expect(parseColor('#aabbccdd')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd / 255 })
  })

  it('大小写与两侧空白都可容忍', () => {
    expect(parseColor('  #AABBCC  ')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 })
  })

  it('解析 rgb() 与 rgba()（仅逗号分隔）', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
  })

  it.each([
    ['空字符串', ''],
    ['颜色名', 'red'],
    ['hsl()', 'hsl(200, 50%, 50%)'],
    ['HEX 8 位写法缺失 #', 'aabbcc'],
    ['位数非法', '#aabbc'],
    ['分量个数不足', 'rgb(1, 2)'],
    ['分量个数超出', 'rgba(1, 2, 3, 0.5, 9)'],
    ['含非十六进制字符', '#gggggg'],
    ['空分量', 'rgb(1,,3)'],
    ['RGB 分量越界', 'rgb(300, 0, 0)'],
    ['RGB 分量为负', 'rgb(-1, 0, 0)'],
    ['alpha 越界', 'rgba(0, 0, 0, 2)'],
    ['分量含 NaN', 'rgb(a, 0, 0)'],
  ])('拒绝 %s', (_label, input) => {
    expect(() => parseColor(input)).toThrow(TypeError)
  })
})

describe('compositeOver', () => {
  it('不透明前景原样返回', () => {
    expect(compositeOver(parseColor('#ffffff'), parseColor('#000000'))).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    })
  })

  it('半透明前景按 alpha 在 sRGB 空间插值', () => {
    // rgba(255, 0, 0, 0.5) 叠到 #000000 上应为 128,0,0（0.5*255 四舍五入）
    expect(compositeOver(parseColor('rgba(255,0,0,0.5)'), parseColor('#000000'))).toEqual({
      r: 127.5,
      g: 0,
      b: 0,
      a: 1,
    })
  })

  it('背景带透明度时抛出（没有确定合成基准）', () => {
    expect(() => compositeOver(parseColor('#ffffff'), parseColor('rgba(0,0,0,0.5)'))).toThrow(
      TypeError,
    )
  })
})

describe('relativeLuminance', () => {
  it('黑为 0、白为 1', () => {
    expect(relativeLuminance(parseColor('#000000'))).toBeCloseTo(0, 10)
    expect(relativeLuminance(parseColor('#ffffff'))).toBeCloseTo(1, 10)
  })
})

describe('contrastRatio', () => {
  it('黑白为 21（WCAG 上限）', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10)
    // 对称：前景背景互换结果一致（亮度的排序保证）
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
  })

  it('同色为 1', () => {
    expect(contrastRatio('#776655', '#776655')).toBeCloseTo(1, 10)
  })

  it('半透明前景会先合成到背景上再计算', () => {
    // rgba(255,255,255,0.5) 叠到 #000000 上得到 127.5 灰，
    // 因此结果应与「127.5 灰 vs 纯黑」完全一致，且低于不透明的 21:1
    const translucent = contrastRatio('rgba(255,255,255,0.5)', '#000000')
    const opaque = contrastRatio('rgb(127.5,127.5,127.5)', '#000000')
    expect(translucent).toBeCloseTo(opaque, 10)
    expect(translucent).toBeLessThan(21)
  })

  it('背景半透明时抛出', () => {
    expect(() => contrastRatio('#ffffff', 'rgba(0,0,0,0.5)')).toThrow(TypeError)
  })
})
