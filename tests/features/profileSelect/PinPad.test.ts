import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PinPad from '../../../src/features/profileSelect/PinPad.vue'

/**
 * `PinPad` 的输入契约。
 *
 * 本组件是**纯输入展示**：它不知道锁定规则，也不决定"什么算合法输入"。新增的
 * 掩码输入框同样如此 —— 打字/粘贴只 emit `setpin`（整体赋值），过滤在
 * composable 里；组件唯一多做的一件事，是把被拒的输入从 DOM 里抹回权威值。
 */

/** 一套可覆盖的最小 props。 */
function props(overrides: Record<string, unknown> = {}) {
  return {
    value: '',
    disabled: false,
    errorMessage: '',
    remainingSeconds: 0,
    submitting: false,
    ...overrides,
  }
}

/** 掩码输入框的底层 DOM 元素（VTU 的 `element` 类型宽泛，这里收窄一次）。 */
function inputOf(wrapper: VueWrapper): HTMLInputElement {
  return wrapper.get('[data-testid="pin-input"]').element as HTMLInputElement
}

describe('features/profileSelect: PinPad 掩码输入框', () => {
  it('输入框是密码型数字输入，带 label、inputmode 与最大长度', () => {
    const wrapper = mount(PinPad, { props: props({ nickname: '小深' }) })
    const input = wrapper.get('[data-testid="pin-input"]')

    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('inputmode')).toBe('numeric')
    expect(input.attributes('autocomplete')).toBe('one-time-code')
    expect(input.attributes('maxlength')).toBe('4')
    // 有 label 才有无障碍名：这里断言它确实被一个 <label> 包着。
    expect(input.element.closest('label')).not.toBeNull()
    expect(input.element.closest('label')?.textContent).toContain('密码')
  })

  it('打字/粘贴走 setpin（整体赋值），组件不自行过滤', async () => {
    const wrapper = mount(PinPad, { props: props({ nickname: '小深' }) })
    const input = wrapper.get('[data-testid="pin-input"]')

    inputOf(wrapper).value = '12'
    await input.trigger('input')

    expect(wrapper.emitted('setpin')).toEqual([['12']])
    // 组件没有替调用方拒绝任何字符：'1a' 也照实上报。
    inputOf(wrapper).value = '1a'
    await input.trigger('input')
    expect(wrapper.emitted('setpin')?.[1]).toEqual(['1a'])
  })

  it('被拒的输入被抹回权威值（框里不残留明文残影）', async () => {
    const wrapper = mount(PinPad, { props: props({ value: '12', nickname: '小深' }) })
    const input = wrapper.get('[data-testid="pin-input"]')

    // 父级没接受这次输入（value 仍是 '12'）：DOM 必须被拉回到 '12'。
    inputOf(wrapper).value = '1a9'
    await input.trigger('input')
    await flushPromises()

    expect(inputOf(wrapper).value).toBe('12')
  })

  it('键盘点击后输入框跟随 props.value 同步', async () => {
    const wrapper = mount(PinPad, { props: props({ value: '', nickname: '小深' }) })

    await wrapper.get('[data-testid="pin-key-7"]').trigger('click')
    expect(wrapper.emitted('digit')).toEqual([['7']])

    // 等价于父级把这次输入写进了 value。
    await wrapper.setProps({ value: '7' })
    expect(inputOf(wrapper).value).toBe('7')
  })

  it('掩码：明文不进入 DOM 文本（点数回显只给"几位"）', () => {
    const wrapper = mount(PinPad, { props: props({ value: '1234', nickname: '小深' }) })
    const input = wrapper.get('[data-testid="pin-input"]')

    // 密码型输入：明文不作为可读文本出现在页面里（浏览器按 password 掩码渲染）。
    expect(input.attributes('type')).toBe('password')
    expect(input.element.textContent).toBe('')
    // 点数回显是纯图形：它只表达"几位"，没有一个字符是 PIN 本身。
    expect(wrapper.get('[data-testid="pin-dots"]').text()).toBe('')
    expect(wrapper.get('[data-testid="pin-dots"]').attributes('data-filled')).toBe('4')
  })

  it('标题泛化：title 优先，nickname 拼出默认标题，都没有时用中性标题', () => {
    const withTitle = mount(PinPad, { props: props({ nickname: '小深', title: '家长区密码' }) })
    expect(withTitle.get('.pin-pad__title').text()).toBe('家长区密码')

    const withNickname = mount(PinPad, { props: props({ nickname: '小深' }) })
    expect(withNickname.get('.pin-pad__title').text()).toBe('小深的密码')

    const bare = mount(PinPad, { props: props() })
    expect(bare.get('.pin-pad__title').text()).toBe('密码')
  })

  it('锁定/提交中禁用输入框（与数字键同一开关）', () => {
    const locked = mount(PinPad, { props: props({ nickname: '小深', disabled: true }) })
    expect(locked.get('[data-testid="pin-input"]').attributes('disabled')).toBeDefined()

    const submitting = mount(PinPad, { props: props({ nickname: '小深', submitting: true }) })
    expect(submitting.get('[data-testid="pin-input"]').attributes('disabled')).toBeDefined()
  })
})
