/**
 * `src/features/parentPanel/createParentStore.ts` —— 把 Task 9 的
 * `StorageFacade` 适配成家长区所需的 `ParentStore` 窄接口。
 *
 * 家长区组件（`useParentPanel` 及其测试）只依赖 {@link ParentStore}：一个
 * 描述"删档案要清四段数据"的最小契约，不依赖 IndexedDB，也不知道背后是库
 * 还是内存态。**适配只发生在这一处**——T17 装配时一行即可接线：
 * ```ts
 * const storage = await resolveStorage()
 * useParentPanel({ store: createParentStore(storage), profileId, ... })
 * ```
 *
 * 映射表（`StorageFacade` → `ParentStore`）：
 * | ParentStore        | StorageFacade                 | 说明                       |
 * |--------------------|-------------------------------|----------------------------|
 * | profiles.*         | profiles.*                    | 直通，方法名逐一对应       |
 * | events.*           | events.*                      | 直通                       |
 * | settings.*         | settings.*                    | 直通（T9 已补 `remove`）   |
 * | bestiary.remove    | bestiary.clear                | 语义等价，命名差异在此收口 |
 * | degraded(_Reason)  | degraded(_Reason)             | 透传驱动家长区警示条       |
 *
 * `bestiary.remove` 之所以映射到 `clear` 而不是自行拼装删除：图鉴投影是
 * **可重建缓存**——解锁事实来自事件日志（`unlock-granted` /
 * `session-completed` 的 `unlockedCreature`），`clear` 的语义就是删掉该档案
 * 的缓存行来让下次重放重建。因此删档案时清掉它不会丢任何进度；家长区以
 * `remove` 命名只是与其他三段删除保持一致。
 */
import type { StorageFacade } from '@/data/db'

import type { ParentStore } from './types'

/** 用 Task 9 的存储门面组装家长区窄接口。 */
export function createParentStore(storage: StorageFacade): ParentStore {
  return {
    degraded: storage.degraded,
    degradedReason: storage.degradedReason,
    profiles: {
      list: () => storage.profiles.list(),
      get: (id) => storage.profiles.get(id),
      save: (profile) => storage.profiles.save(profile),
      remove: (id) => storage.profiles.remove(id),
    },
    events: {
      listByProfile: (profileId) => storage.events.listByProfile(profileId),
      append: (incoming) => storage.events.append(incoming),
      removeByProfile: (profileId) => storage.events.removeByProfile(profileId),
    },
    settings: {
      get: (profileId) => storage.settings.get(profileId),
      save: (profileId, value) => storage.settings.save(profileId, value),
      remove: (profileId) => storage.settings.remove(profileId),
    },
    bestiary: {
      remove: (profileId) => storage.bestiary.clear(profileId),
    },
  }
}
