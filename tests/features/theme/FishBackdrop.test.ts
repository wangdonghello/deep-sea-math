import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FishBackdrop from '@/features/theme/FishBackdrop.vue'
import { MAX_BACKDROP_FISH } from '@/features/theme/types'

/**
 * `features/theme/FishBackdrop` 的行为契约。
 *
 * 锁四组事：
 * 1. 组件挂载后确实渲染 `data-testid="fish-backdrop"` 的容器，且里面至少有
 *    1 条鱼形 `<svg>`（`home-layout.html` 原型里那句"背景可以加个深海鱼"
 *    的最小落地形态）。
 * 2. 鱼群数量与尺寸由 props 参数化 —— 调用方（Task 12 的 `MapPanel`）可以
 *    按屏幕密度决定放几条、放多大，组件不写死。
 * 3. `prefers-reduced-motion: reduce` 时鱼群静止 —— Task 17 会复用这条断言，
 *    因此这里就把「动画类名只在允许动画时出现」固定下来。
 * 4. 环境兜底：`matchMedia` 抛错或缺方法时组件照常渲染、卸载不炸。
 *
 * 之所以断言 **CSS 类名 + data 属性**而不是断言 `style.animation`：jsdom 不
 * 解析 `<style>` 块里的 `@keyframes`，也模拟不了媒体查询；组件正是用
 * `data-motion` + 类名把「当前是否允许动画」显式暴露给 CSS 与测试的。
 */

/** 让 `window.matchMedia` 可预测：jsdom 里它默认总是 `matches: false`。 */
function stubMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

describe('FishBackdrop', () => {
  it('渲染出带 data-testid="fish-backdrop" 的容器', () => {
    const wrapper = mount(FishBackdrop)

    const backdrop = wrapper.find('[data-testid="fish-backdrop"]')
    expect(backdrop.exists()).toBe(true)
  })

  it('至少渲染 1 条鱼形 <svg>', () => {
    const wrapper = mount(FishBackdrop)

    const fishes = wrapper.findAll('[data-testid="fish-backdrop"] svg')
    expect(fishes.length).toBeGreaterThanOrEqual(1)
  })

  it('鱼群数量可参数化（count prop）', () => {
    const wrapper = mount(FishBackdrop, { props: { count: 6 } })

    const fishes = wrapper.findAll('[data-testid="fish-backdrop"] svg')
    expect(fishes).toHaveLength(6)
  })

  it('鱼群尺寸可参数化（size prop）', () => {
    const wrapper = mount(FishBackdrop, { props: { count: 2, size: 96 } })

    const fishes = wrapper.findAll('[data-testid="fish-backdrop"] svg')
    expect(fishes).toHaveLength(2)
    // 尺寸通过 CSS 自定义属性下发，而不是把 width 写死在 SVG 属性上——
    // 这样同一个鱼形在不同密度下只改一处变量即可缩放。
    // 每条鱼在 size 基础上缩放 ±25% 形成景深，因此只断言变量存在且落在
    // [0.75*size, 1.25*size] 区间内，不锁定具体像素值。
    for (const fish of fishes) {
      const style = fish.attributes('style') ?? ''
      const width = Number(/--fish-size:\s*(\d+(?:\.\d+)?)px/.exec(style)?.[1])
      expect(width).toBeGreaterThanOrEqual(96 * 0.75)
      expect(width).toBeLessThanOrEqual(96 * 1.25)
    }
  })

  it('count 超过上限时收敛到 24 条，避免低端机被鱼群拖垮', () => {
    const wrapper = mount(FishBackdrop, { props: { count: 5000 } })

    const fishes = wrapper.findAll('[data-testid="fish-backdrop"] svg')
    expect(fishes).toHaveLength(MAX_BACKDROP_FISH)
  })

  it('prefers-reduced-motion: reduce 时鱼群静止', () => {
    stubMatchMedia(true)
    const wrapper = mount(FishBackdrop)

    expect(wrapper.find('[data-testid="fish-backdrop"]').attributes('data-motion')).toBe('reduced')

    const drifting = wrapper
      .findAll('[data-testid="fish-backdrop"] .fish-backdrop__fish')
      .filter((f) => f.classes().includes('fish-backdrop__fish--drifting'))
    expect(drifting).toHaveLength(0)
  })

  it('允许动画时鱼群挂上漂移动画类', () => {
    stubMatchMedia(false)
    const wrapper = mount(FishBackdrop, { props: { count: 3 } })

    expect(wrapper.find('[data-testid="fish-backdrop"]').attributes('data-motion')).toBe('full')

    const drifting = wrapper
      .findAll('[data-testid="fish-backdrop"] .fish-backdrop__fish')
      .filter((f) => f.classes().includes('fish-backdrop__fish--drifting'))
    expect(drifting).toHaveLength(3)
  })

  it('matchMedia 抛错时按「允许动画」兜底，不阻塞渲染', () => {
    window.matchMedia = (() => {
      throw new Error('该环境不支持 matchMedia')
    }) as unknown as typeof window.matchMedia

    const wrapper = mount(FishBackdrop)

    expect(wrapper.find('[data-testid="fish-backdrop"]').attributes('data-motion')).toBe('full')
    expect(wrapper.findAll('[data-testid="fish-backdrop"] svg').length).toBeGreaterThanOrEqual(1)
  })

  it('媒体查询对象没有 removeEventListener 时卸载也不抛错', () => {
    window.matchMedia = (() =>
      ({ matches: false, media: '', onchange: null, addEventListener: () => {} })) as unknown as typeof window.matchMedia

    const wrapper = mount(FishBackdrop)
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('卸载后解除 change 监听（不会泄漏）', () => {
    const removed: string[] = []
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: (_event: string, _listener: () => void) => {
        removed.push(query)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    const wrapper = mount(FishBackdrop)
    expect(removed).toHaveLength(0)

    wrapper.unmount()
    expect(removed).toEqual(['(prefers-reduced-motion: reduce)'])
  })
})
