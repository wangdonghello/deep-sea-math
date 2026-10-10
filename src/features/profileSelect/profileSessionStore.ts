import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { ProfileProjection } from './types'

/**
 * 当前档案的会话态（Pinia）。
 *
 * design §1 对 Pinia 的定位是「只持有当前会话这类易失态，权威状态始终来自
 * domain 投影」。这里严格照做：store 里**只有** activeProfileId 与投影快照，
 * 没有任何业务规则；刷新后由 Task 17 的路由守卫依据投影是否为空决定是否
 * 打回档案选择页。
 *
 * 之所以还额外持有 `projection`：首页（Task 12）需要知道“现在是谁在玩”，
 * 而投影字段将来由事件重放扩展（题组进度、错题数等）。现在只放最小字段，
 * 比起让每个视图各自读一遍档案列表更省事，也避免重复读存储。
 */
export const useProfileSessionStore = defineStore('profile-session', () => {
  /** 当前登录档案 ID；未登录为 `null`。 */
  const activeProfileId = ref<string | null>(null)
  /** 当前档案的投影快照；未登录为 `null`。 */
  const projection = ref<ProfileProjection | null>(null)

  /** 登录成功后写入（幂等：重复写入同一档案无副作用）。 */
  function setActive(profile: ProfileProjection): void {
    activeProfileId.value = profile.profileId
    projection.value = profile
  }

  /** 退出登录（Task 16 的家长区/切换档案入口会调用）。 */
  function clear(): void {
    activeProfileId.value = null
    projection.value = null
  }

  return { activeProfileId, projection, setActive, clear }
})
