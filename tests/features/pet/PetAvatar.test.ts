import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PetAvatar from '@/features/pet/PetAvatar.vue'
import type { PetStage } from '@/domain/pet/growth'

/**
 * jsdom 没有 accessible name 计算，这里按按钮名称算法的关键一步取值：
 * 按钮自身有 `aria-label` 就用它，否则取内容里 `<svg role="img">` 的名称。
 *
 * 组件约定**不**在按钮上重复写 `aria-label`，否则按钮的名称会覆盖图像
 * 名称、读屏把同一段话念两遍；下面的断言同时锁住这两点。
 */
function buttonAccessibleName(view: VueWrapper): string {
  const button = view.get('[data-testid="pet-tap"]')
  return button.attributes('aria-label') ?? view.get('svg').attributes('aria-label') ?? ''
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PetAvatar', () => {
  it('按阶段渲染不同形态并带可访问名称', () => {
    const baby = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    expect(baby.get('svg').attributes('role')).toBe('img')
    expect(baby.find('[data-stage="baby"]').exists()).toBe(true)

    // 名称只有一份：按钮不写 aria-label，靠内容里的 svg 名称。
    expect(baby.get('[data-testid="pet-tap"]').attributes('aria-label')).toBeUndefined()
    expect(buttonAccessibleName(baby)).toContain('幼体')
    expect(buttonAccessibleName(baby)).toContain('心情')
    expect(buttonAccessibleName(baby)).toContain('点我摸摸')

    const egg = mount(PetAvatar, { props: { stage: 'egg', mood: 80 } })
    expect(egg.find('[data-stage="egg"]').exists()).toBe(true)
  })

  it('Lv.2 幼童形态有独立造型与名称', () => {
    const view = mount(PetAvatar, { props: { stage: 'child', mood: 80 } })
    expect(view.find('[data-stage="child"]').exists()).toBe(true)
    expect(view.find('.pet-avatar__child-crest').exists()).toBe(true)
    expect(buttonAccessibleName(view)).toContain('幼童')
  })

  it('完全体渲染 final 形态', () => {
    const view = mount(PetAvatar, { props: { stage: 'final', mood: 80 } })
    expect(view.find('[data-stage="final"]').exists()).toBe(true)
  })

  it('点击时发出 tap 事件并带挤压动画类', async () => {
    const view = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    await view.get('[data-testid="pet-tap"]').trigger('click')
    expect(view.emitted('tap')).toHaveLength(1)
    expect(view.get('[data-testid="pet-tap"]').classes()).toContain('is-squish')
  })

  it('连续两次点击会重播挤压动画，220ms 后移除', async () => {
    vi.useFakeTimers()
    const view = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    const button = view.get('[data-testid="pet-tap"]')

    await button.trigger('click')
    vi.advanceTimersByTime(200)
    await button.trigger('click')

    // 若第一次的定时器没被清掉，它会在 220ms 处摘类；这里已经过了 300ms
    // （第二次点击后再 100ms），类仍在说明计时被重新开始。
    vi.advanceTimersByTime(100)
    expect(button.classes()).toContain('is-squish')

    // 第二次点击后满 220ms，类被移除。
    vi.advanceTimersByTime(120)
    await nextTick()
    expect(button.classes()).not.toContain('is-squish')
  })

  it('卸载后清理挤压定时器', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(window, 'clearTimeout')
    const view = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    await view.get('[data-testid="pet-tap"]').trigger('click')

    clearSpy.mockClear()
    view.unmount()

    expect(clearSpy).toHaveBeenCalled()
    expect(() => vi.advanceTimersByTime(300)).not.toThrow()
  })

  it('心情低于 40 时根按钮带 is-low 类', () => {
    const view = mount(PetAvatar, { props: { stage: 'baby', mood: 20 } })
    expect(view.get('[data-testid="pet-tap"]').classes()).toContain('is-low')
  })

  it('同页多个实例的渐变 id 不重复', () => {
    const first = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    const second = mount(PetAvatar, { props: { stage: 'egg', mood: 80 } })
    const firstId = first.get('svg linearGradient').attributes('id')
    const secondId = second.get('svg linearGradient').attributes('id')

    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()
    expect(firstId).not.toBe(secondId)
  })

  it('未知阶段回退到幼体视觉而不抛错', () => {
    // 运行时会收到脏 props（旧存档/拼写错误），不能把整页渲染炸掉。
    const view = mount(PetAvatar, {
      props: { stage: 'unknown' as unknown as PetStage, mood: 80 },
    })

    // data-stage 原样透传，方便调用方排查；视觉回退到 baby 的配色。
    expect(view.find('[data-stage="unknown"]').exists()).toBe(true)
    expect(view.find('.pet-avatar__creature').exists()).toBe(true)
    expect(view.get('svg').attributes('aria-label')).toContain('幼体')
    expect(view.get('svg linearGradient stop').attributes('stop-color')).toBe('#a9efff')
  })
})
