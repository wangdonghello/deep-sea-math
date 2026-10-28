import { afterEach, describe, expect, it, vi } from 'vitest'

import { randomUuid } from '../../../src/domain/crypto/randomUuid'

describe('domain/crypto: randomUuid fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' })
    expect(randomUuid()).toBe('fixed-uuid')
  })

  it('builds a v4 UUID from getRandomValues without randomUUID', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        array.fill(0)
        return array
      },
    })
    expect(randomUuid()).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('still returns a valid v4 UUID when crypto is missing entirely', () => {
    vi.stubGlobal('crypto', undefined)
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
