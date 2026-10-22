import { describe, expect, it } from 'vitest'

import { THEME_PACKS, themePackById } from '@/data/content/themePacks'

describe('theme packs', () => {
  it('has three themes with eight entries each', () => {
    expect(THEME_PACKS).toHaveLength(3)
    for (const pack of THEME_PACKS) {
      expect(pack.entries).toHaveLength(8)
      expect([1, 2, 3, 4].every((stage) => pack.entries.filter((entry) => entry.stage === stage).length === 2)).toBe(true)
    }
  })

  it('falls back to deep sea for an unknown theme', () => {
    expect(themePackById('unknown' as never).id).toBe('deep-sea')
  })
})
