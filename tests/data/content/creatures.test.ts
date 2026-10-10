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
      expect(creature.habitat).toMatch(/\d[\d,.]*[–-]\d[\d,.]*米/)
      expect(creature.knowledgeCards.length).toBeGreaterThanOrEqual(3)
      expect(creature.knowledgeCards.length).toBeLessThanOrEqual(5)
      expect(creature.sources.length).toBeGreaterThan(0)
      expect(creature.illustrationRef).toMatch(/^original-/)
    }
  })

  it('includes Johnson’s anglerfish and rejects fixed-depth claims', () => {
    const bestiary = readCreatures() as { creatures: Array<Record<string, any>> }
    const anglerfish = bestiary.creatures.find((creature) => creature.scientificName === 'Melanocetus johnsonii')
    expect(anglerfish?.depthRange).toEqual({ min: 100, max: 4500 })
    expect(anglerfish?.habitat).toMatch(/MBARI.*类群.*300–4,000米.*FishBase.*100–4,500米/)
    expect(anglerfish?.habitat).not.toContain('580米')
    expect(anglerfish?.sources).toContain('https://www.fishbase.se/summary/Melanocetus-johnsonii.html')
    expect(anglerfish?.sources).toContain('https://www.mbari.org/animal/deep-sea-anglerfish/')
    expect(anglerfish?.knowledgeCards.join(' ')).toMatch(/发光/)
    expect(anglerfish?.knowledgeCards.join(' ')).not.toContain('580米')

    const invalid = structuredClone(bestiary)
    invalid.creatures[0].habitat = '活动范围约300–4,000米，只生活在500米深处，其他深度绝不会出现。'
    expect(() => assertValidCreatures(invalid)).toThrow(/fixed|固定|唯一/i)
  })

  it('uses species-level OBIS observation sources without claiming complete ranges', () => {
    const bestiary = readCreatures() as { creatures: Array<Record<string, any>> }
    for (const [id, taxonId, min, max, count] of [
      ['deep-sea-lizardfish', '126369', 222.5, 3516, 587],
      ['jewel-squid', '140111', 15.5, 4276, 277],
    ]) {
      const creature = bestiary.creatures.find((item) => item.id === id)!
      expect(creature.depthRange).toEqual({ min, max })
      expect(creature.sources).toContain(`https://api.obis.org/v3/taxon/${taxonId}`)
      expect(creature.sources).toContain(`https://api.obis.org/v3/occurrence?taxonid=${taxonId}&size=10000`)
      expect(creature.habitat).toMatch(/OBIS.*观测记录范围.*不代表(?:物种)?完整分布/)
      expect(creature.knowledgeCards.join(' ')).toContain(`${count}条`)
    }
  })

  it('rejects broad homepage sources without species-level identifiers', () => {
    const bestiary = readCreatures() as { version: string; creatures: Array<Record<string, any>> }
    const invalid = structuredClone(bestiary)
    invalid.creatures[1].sources = ['https://www.mbari.org/']
    expect(() => assertValidCreatures(invalid)).toThrow(/species-scoped|species-specific/i)
    const broadAnimalPage = structuredClone(bestiary)
    broadAnimalPage.creatures[0].sources = ['https://www.mbari.org/animal/deep-sea-anglerfish/']
    expect(() => assertValidCreatures(broadAnimalPage)).toThrow(/species-scoped|species-specific/i)
  })
})
