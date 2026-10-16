import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CREATURE_BANK } from '@/data/content'

/**
 * 原创插画的**质量下限**回归测试。
 *
 * 为什么需要它：图鉴和观察舱里，没有授权 3D 模型的物种只能看这张插画。此前四张
 * 插画每张只有 2–3 条 `path`，家长验收时直接说"是个简陋的图"。视觉好坏无法用
 * 断言完全表达，但"退化成简笔画"是可测的：这里锁住渐变层次、绘图元素数量和
 * 纯矢量（不嵌位图）三条硬门槛。
 */
const illustrationsDir = resolve(process.cwd(), 'public/illustrations')

describe('生物原创插画', () => {
  for (const creature of CREATURE_BANK.creatures) {
    describe(creature.name, () => {
      const svg = readFileSync(resolve(illustrationsDir, `${creature.illustrationRef}.svg`), 'utf8')

      it('带标题与可访问名称', () => {
        expect(svg).toContain('<title>')
        expect(svg).toContain('role="img"')
        expect(svg).toContain(`<title>${creature.name}原创示意插画</title>`)
      })

      it('用渐变做明暗层次，而不是单色填充', () => {
        expect(svg).toMatch(/<(linearGradient|radialGradient)\b/)
        expect(svg.match(/<stop\b/g) ?? []).not.toHaveLength(0)
        // 至少两处渐变填充：身体 + 生物发光/鳍
        expect((svg.match(/fill="url\(#/g) ?? []).length).toBeGreaterThanOrEqual(2)
      })

      it('有足够的图形元素，不是几条 path 的简笔画', () => {
        const shapes = svg.match(/<(path|circle|ellipse|polygon|rect|line|polyline)\b/g) ?? []
        expect(shapes.length).toBeGreaterThanOrEqual(12)
      })

      it('是纯矢量：不嵌入位图、不引用外部资源', () => {
        expect(svg).not.toContain('<image')
        expect(svg).not.toContain('xlink:href')
        expect(svg).not.toMatch(/href="https?:/)
      })
    })
  }
})
