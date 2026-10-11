import { describe, expect, it } from 'vitest'

import { redact } from '../../src/shared/redact'

/**
 * `redact()` 的单测（Constitution Check §1 + spec `child-profiles` §不采集敏感信息）。
 *
 * 断言重点只有一件事：**任何含 `pin` / `pinHash` / `salt` / `token` / `password`
 * 等键的对象，其值在脱敏后都变成 `'***'`，且递归覆盖嵌套对象与数组**。
 * 这里刻意不做「看起来合理」的模糊匹配（如子串 `pi` 就命中），密钥名匹配必须
 * 精确到完整键名，否则会把 `spin`、`napping` 这类无害字段误伤成 `***`。
 */
describe('shared/redact', () => {
  it('把敏感键的值替换为 ***，保留其他键原样', () => {
    const input = {
      profileId: 'p1',
      pin: '1234',
      nickname: '小深',
    }

    const output = redact(input)

    expect(output).toEqual({
      profileId: 'p1',
      pin: '***',
      nickname: '小深',
    })
  })

  it('递归覆盖嵌套对象与数组里的敏感键', () => {
    const input = {
      profiles: [
        { id: 'p1', pinHash: 'a'.repeat(64), salt: 's1' },
        { id: 'p2', pinHash: 'b'.repeat(64), salt: 's2' },
      ],
      debug: { token: 't', attempt: 3 },
    }

    const output = redact(input)

    expect(output).toEqual({
      profiles: [
        { id: 'p1', pinHash: '***', salt: '***' },
        { id: 'p2', pinHash: '***', salt: '***' },
      ],
      debug: { token: '***', attempt: 3 },
    })
  })

  it('大小写不敏感：Pin / PIN / pinHash / Salt 均命中', () => {
    const output = redact({ Pin: '1111', PIN: '2222', pinHash: 'a', Salt: 's' })

    expect(output.Pin).toBe('***')
    expect(output.PIN).toBe('***')
    expect(output.pinHash).toBe('***')
    expect(output.Salt).toBe('***')
  })

  it('非敏感的同形近音键不被误伤', () => {
    const output = redact({
      spinning: true,
      napping: false,
      pinLength: 4,
      saltedFish: 'yes',
    })

    expect(output).toEqual({
      spinning: true,
      napping: false,
      pinLength: 4,
      saltedFish: 'yes',
    })
  })

  it('保留 null 与原始类型，不把 null 变成字符串', () => {
    const output = redact({ pin: null, nickname: null, count: 2, ok: false })

    expect(output).toEqual({ pin: null, nickname: null, count: 2, ok: false })
  })

  it('数组元素是原始值时整体保留', () => {
    expect(redact([1, 'a', true, null])).toEqual([1, 'a', true, null])
  })

  it('Error 的 message / stack 不丢失，且异常上捎带的 pin 仍被掩', () => {
    const failure = new Error('读取档案失败')
    Object.assign(failure, { pin: '1234', salt: 'salt-p1', profileId: 'p1' })
    failure.stack = 'Error: 读取档案失败\n    at load (useProfileSelect.ts:81)'

    const output = redact({ error: failure })

    // 经 unknown 中转：Error 与 Record 无足够重叠，直接 as 会被 TS 拒绝
    const redacted = (output.error ?? {}) as unknown as Record<string, unknown>
    expect(redacted.name).toBe('Error')
    // 排查信息必须存活：否则日志退化成 `{ event, error: {} }` 这种空心对象
    expect(redacted.message).toBe('读取档案失败')
    expect(redacted.stack).toContain('useProfileSelect.ts')
    // 但捎带在异常上的凭据照样掩
    expect(redacted.pin).toBe('***')
    expect(redacted.salt).toBe('***')
    expect(redacted.profileId).toBe('p1')
  })

  it('Date 转 ISO 串而不是 {}', () => {
    const moment = new Date('2026-10-10T10:00:00.000Z')

    expect(redact({ createdAt: moment })).toEqual({ createdAt: '2026-10-10T10:00:00.000Z' })
  })

  it('Map / Set 转成数组而非抛空', () => {
    const redacted = redact({
      counters: new Map([
        ['pin', '1234'],
        ['profileId', 'p1'],
      ]),
      tags: new Set(['deep-sea', 'profile']),
    })

    expect(redacted).toEqual({
      // 键是"字段名"不是"秘密"，原样保留才能看出掩的是哪一个
      counters: [
        ['pin', '***'],
        ['profileId', 'p1'],
      ],
      // Set 里没有对象可递归，整体转为数组
      tags: ['deep-sea', 'profile'],
    })
  })

  it('Map / Set 里的嵌套对象同样被递归脱敏', () => {
    const redacted = redact({
      byProfile: new Map([['p1', { nickname: '小深', pin: '1234' }]]),
      failedIds: new Set([{ id: 'p1', salt: 'salt-p1' }]),
    })

    expect(redacted).toEqual({
      byProfile: [['p1', { nickname: '小深', pin: '***' }]],
      failedIds: [{ id: 'p1', salt: '***' }],
    })
  })

  it('循环引用不会无限递归', () => {
    const node: Record<string, unknown> = { name: 'root' }
    node.self = node
    node.pin = '1234'

    const output = redact(node) as Record<string, unknown>

    expect(output.name).toBe('root')
    expect(output.pin).toBe('***')
    expect(output.self).toBe(output)
  })
})
