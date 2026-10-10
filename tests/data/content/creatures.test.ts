import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assertValidCreatures } from '../../../src/data/content/schema'

/** Loads the checked-in bestiary as JSON so tests exercise shipped content. */
function readCreatures(): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/content/creatures.json'), 'utf8'))
}

describe('creature content', () => {
  it('contains four sourced entries with interval depths and 3–5 knowledge cards', () => {
    const bestiary = readCreatures() as { creatures: Array<Record<string, any>> }
    expect(bestiary.creatures).toHaveLength(4)
    assertValidCreatures(bestiary)

    for (const creature of bestiary.creatures) {
      expect(creature.name.trim()).not.toBe('')
      expect(creature.scientificName.trim()).not.toBe('')
      expect(creature.depthRange.max).toBeGreaterThan(creature.depthRange.min)
      expect(creature.habitat).toMatch(/\d[\d,]*[–-]\d[\d,]*米/)
      expect(creature.knowledgeCards.length).toBeGreaterThanOrEqual(3)
      expect(creature.knowledgeCards.length).toBeLessThanOrEqual(5)
      expect(creature.sources.length).toBeGreaterThan(0)
      expect(creature.illustrationRef).toMatch(/^original-/)
    }
  })

  it('includes Johnson’s anglerfish and rejects fixed-depth claims', () => {
    const bestiary = readCreatures() as { creatures: Array<Record<string, any>> }
    const anglerfish = bestiary.creatures.find((creature) => creature.scientificName === 'Melanocetus johnsonii')
    expect(anglerfish?.depthRange).toEqual({ min: 300, max: 4000 })
    expect(anglerfish?.knowledgeCards.join(' ')).toMatch(/发光/)

    const invalid = structuredClone(bestiary)
    invalid.creatures[0].habitat = '活动范围约300–4,000米，只生活在500米深处，其他深度绝不会出现。'
    expect(() => assertValidCreatures(invalid)).toThrow(/fixed|固定|唯一/i)
  })
})
