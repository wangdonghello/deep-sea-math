import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { themePackById } from '@/data/content/themePacks'

describe('dinosaur 3D models', () => {
  it('every dinosaur entry with a modelRef has a packaged glb and a license source', () => {
    const pack = themePackById('dinosaur')
    const withModels = pack.entries.filter((entry) => entry.modelRef !== undefined)
    expect(withModels).toHaveLength(8)
    for (const entry of withModels) {
      expect(existsSync(resolve('public/models/dino', `${entry.modelRef}.glb`))).toBe(true)
      expect(entry.modelLicense).toBe('CC0')
      expect(entry.modelSource).toContain('poly.pizza')
    }
  })
})
