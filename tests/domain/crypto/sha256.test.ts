import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { hashPin, verifyPin } from '../../../src/domain/crypto/hashPin'
import { sha256 } from '../../../src/domain/crypto/sha256'

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

describe('domain/crypto: pure SHA-256 fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('matches the standard abc test vector', () => {
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('hashes and verifies a PIN when crypto.subtle is unavailable', async () => {
    // HTTP 非安全上下文：crypto 存在但没有 subtle。
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => array })
    const salt = 'salt-a'
    const expected = createHash('sha256').update('1234salt-a').digest('hex')

    expect(await hashPin('1234', salt)).toBe(expected)
    expect(await verifyPin('1234', salt, expected)).toBe(true)
    expect(await verifyPin('4321', salt, expected)).toBe(false)
  })
})
