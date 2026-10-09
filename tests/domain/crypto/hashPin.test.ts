import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { hashPin, verifyPin, type DigestFn } from '../../../src/domain/crypto/hashPin'

/**
 * 同步 SHA-256 的 `DigestFn` 实现，仅供测试注入。
 *
 * 之所以要注入：domain 的公共签名必须做到「宿主持不提供 Web Crypto 都无关」
 * —— 这里用一个只依赖 `node:crypto` 的同步哈希来证明这件事，顺带把
 * 「摘要算法可替换」这个设计前提变成可执行断言，而不是一句空话。
 *
 * 输入是 `Uint8Array`，因此这里逐字节哈希，与浏览器里
 * `crypto.subtle.digest('SHA-256', utf8Bytes)` 摘的是同一份字节；
 * 金样测试（见下）正是用这一点把两种实现对拍在一起。
 */
const syncSha256: DigestFn = async (_algorithm, data) => {
  const digest = createHash('sha256').update(data).digest()
  // Node 的 `Hash.digest()` 返回 `NonSharedBuffer`（SharedArrayBuffer 的
  // 近亲），与 Web Crypto 的 `ArrayBuffer` 不是同一类型。剖出标准
  // `ArrayBuffer` 拷贝，正好对齐 `DigestFn` 的返回类型。
  return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength)
}

describe('domain/crypto: hashPin', () => {
  it('同一 PIN + 同一 salt 得到相同哈希', async () => {
    const first = await hashPin('1234', 'salt-a', syncSha256)
    const second = await hashPin('1234', 'salt-a', syncSha256)

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('不同 salt 得到不同哈希', async () => {
    const withSaltA = await hashPin('1234', 'salt-a', syncSha256)
    const withSaltB = await hashPin('1234', 'salt-b', syncSha256)

    expect(withSaltA).not.toBe(withSaltB)
  })

  it('不同 PIN 得到不同哈希', async () => {
    const four = await hashPin('1234', 'salt-a', syncSha256)
    const other = await hashPin('5678', 'salt-a', syncSha256)

    expect(four).not.toBe(other)
  })

  it('哈希输出不含明文 PIN（PIN=1234）', async () => {
    const hash = await hashPin('1234', 'salt-a', syncSha256)

    expect(hash).not.toContain('1234')
    expect(hash.toLowerCase()).not.toContain('1234')
  })

  it('输出即 SHA-256(pin + salt) 的 UTF-8 字节十六进制（金样锁定）', async () => {
    const expected = createHash('sha256').update('1234salt-a', 'utf8').digest('hex')

    expect(await hashPin('1234', 'salt-a', syncSha256)).toBe(expected)
  })

  it('PIN 为空时抛错', async () => {
    await expect(hashPin('', 'salt-a', syncSha256)).rejects.toThrow(/PIN/)
  })

  it('salt 为空时抛错', async () => {
    await expect(hashPin('1234', '', syncSha256)).rejects.toThrow(/salt/)
  })

  it('摘要返回空结果时抛错（不把空串当合法哈希）', async () => {
    const emptyDigest: DigestFn = async () => new ArrayBuffer(0)

    await expect(hashPin('1234', 'salt-a', emptyDigest)).rejects.toThrow(/摘要/)
  })

  it('注入的摘要算法收到的是 SHA-256', async () => {
    const algorithms: string[] = []
    const recording: DigestFn = async (algorithm, data) => {
      algorithms.push(algorithm)
      return syncSha256(algorithm, data)
    }

    await hashPin('1234', 'salt-a', recording)

    expect(algorithms).toEqual(['SHA-256'])
  })

  it('不注入 digest 时默认走 Web Crypto（与注入实现结果一致）', async () => {
    // Vitest 跑在 Node 20+ 上，`globalThis.crypto.subtle` 由 Node 提供；
    // jsdom 只是不主动暴露它，并没有把它删掉。因此这里能真实验证默认注入
    // 确实接到了 Web Crypto 而不是留了个永远走不到的分支。
    const viaDefault = await hashPin('1234', 'salt-a')
    const viaInjected = await hashPin('1234', 'salt-a', syncSha256)

    expect(viaDefault).toBe(viaInjected)
    expect(viaDefault).not.toContain('1234')
  })

  it('不注入 digest 时 verifyPin 默认分支同样可用', async () => {
    const hash = await hashPin('1234', 'salt-a')

    expect(await verifyPin('1234', 'salt-a', hash)).toBe(true)
    expect(await verifyPin('9999', 'salt-a', hash)).toBe(false)
  })
})

describe('domain/crypto: verifyPin', () => {
  it('PIN 正确且 salt 一致时返回 true', async () => {
    const hash = await hashPin('1234', 'salt-a', syncSha256)

    expect(await verifyPin('1234', 'salt-a', hash, syncSha256)).toBe(true)
  })

  it('PIN 错误时返回 false', async () => {
    const hash = await hashPin('1234', 'salt-a', syncSha256)

    expect(await verifyPin('4321', 'salt-a', hash, syncSha256)).toBe(false)
  })

  it('salt 不一致时返回 false', async () => {
    const hash = await hashPin('1234', 'salt-a', syncSha256)

    expect(await verifyPin('1234', 'salt-b', hash, syncSha256)).toBe(false)
  })

  it('待比对哈希长度不同（被截断）时返回 false 且不抛错', async () => {
    const hash = await hashPin('1234', 'salt-a', syncSha256)

    expect(await verifyPin('1234', 'salt-a', hash.slice(0, 32), syncSha256)).toBe(false)
  })

  it('待比对哈希为空串时返回 false', async () => {
    expect(await verifyPin('1234', 'salt-a', '', syncSha256)).toBe(false)
  })

  it('大小写敏感：大写十六进制哈希得不到静默 true', async () => {
    // 契约：verifyPin 大小写敏感。存储层若规范化为大写十六进制，
    // 会得到静默 false，故此处显式钉住该行为。
    const hash = await hashPin('1234', 'salt-a', syncSha256)

    expect(await verifyPin('1234', 'salt-a', hash.toUpperCase(), syncSha256)).toBe(false)
  })

  it('PIN 或 salt 为空时与 hashPin 同样抛错（不静默放行）', async () => {
    const hash = await hashPin('1234', 'salt-a', syncSha256)

    await expect(verifyPin('', 'salt-a', hash, syncSha256)).rejects.toThrow(/PIN/)
    await expect(verifyPin('1234', '', hash, syncSha256)).rejects.toThrow(/salt/)
  })
})
