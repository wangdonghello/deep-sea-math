import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router/index.ts'
import './styles/theme.css'

/**
 * 应用入口。
 *
 * 装配顺序固定为 Vue 实例 → Pinia → Router → mount：
 * Pinia 必须先于 Router 注册，因为后续 Task 11+ 的路由守卫与视图会
 * 在导航过程中读取 store。
 */
const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
