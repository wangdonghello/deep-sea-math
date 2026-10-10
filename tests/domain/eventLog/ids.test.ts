import { describe, expect, it } from 'vitest'

import { createEventId, defaultRandomUuid } from '../../../src/domain/eventLog/ids'

/**
 * `domain/eventLog/ids` 的行为契约（spec `offline-event-log` §离线可用
 * 的「同步预留字段」：每个事件都带全局唯一 eventId）。
 *
 * 锁两件事：
 * 1. **可注入**：`randomUUID` 可被调用方注入（测试注入固定发生器），
 *    否则事件 ID 不可复现——与 design §1 的 `idGenerator` 注入点同一立场；
 * 2. **默认行为**：不注入时走 Web Crypto 的 `randomUUID()`，且在**调用时**
 *    才解析全局，import 期不触碰宿主环境。
 */
describe('domain/eventLog/ids: createEventId', () => {
  it('不注入时默认走 Web Crypto randomUUID，产出合法 UUID 形状', () => {
    // jsdom 不提供 crypto.randomUUID，但 Node 20+ 的 globalThis.crypto 有；
    // vitest 的 jsdom 环境会暴露 Node 的 globalThis.crypto。
    const id = createEventId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('注入的 randomUUID 被使用，且每次调用取一个新值', () => {
    let counter = 0
    const nextId = () => `fixed-${(counter += 1)}`
    expect(createEventId(nextId)).toBe('fixed-1')
    expect(createEventId(nextId)).toBe('fixed-2')
  })

  it('defaultRandomUuid 是零参函数（可注入签名兼容）', () => {
    expect(defaultRandomUuid.length).toBe(0)
    expect(defaultRandomUuid()).toMatch(/^[0-9a-f]{8}-/)
  })
})
