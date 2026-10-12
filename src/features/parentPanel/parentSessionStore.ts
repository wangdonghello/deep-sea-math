import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 家长区门禁的会话态（Pinia）。
 *
 * **仅内存态**：刷新后重新验证家长 PIN。孩子与家长共用同一台设备，而家长区的
 * 操作（改题量、重置 PIN、删档案）是破坏性的——门禁 MUST NOT 跨刷新留存，
 * 否则孩子关掉浏览器再打开就能直接进家长区。这也与 spec `child-profiles`
 * §PIN 错误"连续 5 次错误后锁定 60 秒"的本地凭据模型一致：会话态是易失的。
 *
 * store 里**只有**一个布尔量，没有任何业务规则：什么时候解锁、怎么校验 PIN
 * 全在 `useParentGate` 里；路由守卫只读 `unlocked` 决定放不放行。
 */
export const useParentSessionStore = defineStore('parent-session', () => {
  /** 本次会话是否已通过家长 PIN 校验。 */
  const unlocked = ref(false)

  /** 校验通过后调用（幂等）。 */
  function unlock(): void {
    unlocked.value = true
  }

  /** 重新上锁（家长主动退出 / 需要重新验证时调用）。 */
  function lock(): void {
    unlocked.value = false
  }

  return { unlocked, unlock, lock }
})
