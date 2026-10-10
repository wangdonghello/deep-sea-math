import { describe, expect, it } from 'vitest'

import { hashPin, verifyPin } from '../../../src/domain/crypto/hashPin'
import { createProfileSelectStore } from '../../../src/features/profileSelect/createProfileSelectStore'
import { syncSha256 } from './manualClock'

/**
 * 内存态 fake 的 `ProfileRepo`（只实现适配器用到的 `get` / `list`）。
 *
 * 签名刻意与 T9 的 `ProfileRepo` 对齐到能骗过结构检查的程度：`get` 对不存在的
 * ID 返回 `undefined` 而不是 `null`——这一条不是风格偏好，T9 的 JSDoc 明确
 * 约定"不抛异常"，适配器若按 `null` 判断，接线后"档案不存在"会被当成异常
 * 抛出，进而是 `submit()` 的 catch 分支（把存储故障也计成一次失败）。
 */
function makeRepo(rows: Array<{ id: string; nickname: string; avatarId: string; pin: string }>) {
    const stored = new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          nickname: row.nickname,
          avatarId: row.avatarId,
          salt: `salt-${row.id}`,
          pinHash: '', // 下面统一回填，避免在 map 回调里 await
          createdAt: 1_700_000_000_000, // 固定时间戳，让用例不受真实时钟影响
        },
      ]),
    )

  return {
    async fill() {
      for (const row of rows) {
        const profile = stored.get(row.id)
        if (profile === undefined) continue
        profile.pinHash = await hashPin(row.pin, profile.salt, syncSha256)
      }
    },

    async list() {
      return [...stored.values()]
    },

    async get(id: string) {
      return stored.get(id)
    },
  }
}

describe('features/profileSelect: createProfileSelectStore', () => {
  it('list() 只投影展示字段，pinHash 与 salt 不外泄', async () => {
    const repo = makeRepo([{ id: 'p1', nickname: '小深', avatarId: 'angler', pin: '1234' }])
    await repo.fill()
    const store = createProfileSelectStore(repo, { digest: syncSha256 })

    const profiles = await store.list()

    expect(profiles).toEqual([{ id: 'p1', nickname: '小深', avatarId: 'angler' }])
    // 逐键断言而不是"看起来对"：哈希与盐绝不能出现在返回值里
    expect(Object.keys(profiles[0] ?? {})).toEqual(['id', 'nickname', 'avatarId'])
  })

  it('verify 走真实 verifyPin：正确 PIN 通过，错误 PIN 拒绝', async () => {
    const repo = makeRepo([{ id: 'p1', nickname: '小深', avatarId: 'angler', pin: '1234' }])
    await repo.fill()
    const store = createProfileSelectStore(repo, { digest: syncSha256 })

    expect(await store.verify('p1', '1234')).toBe(true)
    expect(await store.verify('p1', '4321')).toBe(false)
  })

  it('档案不存在时返回 false（与 PIN 错误同一结果，不区分错因）', async () => {
    const repo = makeRepo([{ id: 'p1', nickname: '小深', avatarId: 'angler', pin: '1234' }])
    await repo.fill()
    const store = createProfileSelectStore(repo, { digest: syncSha256 })

    expect(await store.verify('missing-id', '1234')).toBe(false)
  })

  it('verify 与 hashPin 的结果对拍（证明接的是 Task 2 的 domain 函数）', async () => {
    const repo = makeRepo([{ id: 'p1', nickname: '小深', avatarId: 'angler', pin: '1234' }])
    await repo.fill()
    const store = createProfileSelectStore(repo, { digest: syncSha256 })

    const profile = await repo.get('p1')
    const expected = await verifyPin('1234', profile?.salt ?? '', profile?.pinHash ?? '', syncSha256)

    expect(await store.verify('p1', '1234')).toBe(expected)
    expect(expected).toBe(true)
  })

  it('不带 digest 时缺省走 verifyPin 默认注入（不要求调用方注入）', async () => {
    const repo = makeRepo([{ id: 'p1', nickname: '小深', avatarId: 'angler', pin: '1234' }])
    await repo.fill()
    // 故意不传 options：默认分支必须可用
    const store = createProfileSelectStore(repo)

    expect(await store.verify('p1', '1234')).toBe(true)
    expect(await store.verify('p1', '0000')).toBe(false)
  })
})
