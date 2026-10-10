import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import App from '../src/App.vue'
import router from '../src/router/index.ts'

/**
 * 脚手架冒烟测试：应用根组件可被挂载，且渲染出 `<div id="app">` 根节点。
 *
 * 这是整个测试套件的地基——它同时验证了三件脚手架期必须成立的事：
 *   1. `@vue/test-utils` + jsdom 环境可用；
 *   2. `.vue` SFC 能被 Vitest 编译并挂载；
 *   3. `src/router` 能被导入并作为插件安装（后续组件测试都依赖同一环境）。
 *
 * 装配顺序固定为 Vue 实例 → Pinia → Router（与 `main.ts` 逐行一致）：Task 17
 * 起 `App.vue` 在 setup 里读 `profileSessionStore`（解锁反馈要知道"现在是谁
 * 在玩"），Pinia 必须先注册，否则根组件连挂载都做不到。
 */
describe('smoke: 项目脚手架', () => {
  it('挂载 src/App.vue 并渲染出 <div id="app">', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    expect(wrapper.find('#app').exists()).toBe(true)
  })
})
