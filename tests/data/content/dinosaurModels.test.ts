import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { themePackById } from '@/data/content/themePacks'

describe('dinosaur models and photos', () => {
  it('every dinosaur entry has a packaged GLB and a real museum/fossil photo with source', () => {
    const pack = themePackById('dinosaur')
    expect(pack.entries).toHaveLength(8)
    for (const entry of pack.entries) {
      expect(entry.modelRef).toBeTruthy()
      expect(existsSync(resolve('public/models/dino', `${entry.modelRef}.glb`))).toBe(true)
      expect(entry.modelLicense).toBe('CC0')
      expect(entry.modelSource).toContain('poly.pizza')
      expect(entry.photoRef).toBeTruthy()
      expect(existsSync(resolve('public/photos/dino', `${entry.photoRef}.jpg`))).toBe(true)
      expect(entry.photoSource).toContain('wikimedia.org/wiki/File:')
      expect(entry.photoCredit).toBeTruthy()
      expect(entry.photoLicense).toBeTruthy()
    }
  })
})
