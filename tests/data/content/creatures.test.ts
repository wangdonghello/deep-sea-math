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
      expect(creature.bodySize.trim()).not.toBe('')
      expect(creature.photo.ref).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  it('gives every species a licensed photograph with visible attribution', () => {
    const bestiary = readCreatures() as { creatures: Array<Record<string, any>> }
    const seen = new Set<string>()
    for (const creature of bestiary.creatures) {
      const photo = creature.photo
      // 影像是家长明确要求的视觉口径：不允许悄悄退回示意插画
      expect(photo, `${creature.id} 缺 photo`).toBeDefined()
      expect(photo.note, `${creature.id} 的 note 必须说明影像实际内容`).toMatch(/真实影像/)
      expect(`${photo.creditSummary}${photo.attribution}`).toMatch(/CC|公有领域/)
      expect(photo.sourceUrl).toMatch(/^https:\/\//)
      expect(photo.licenseUrl).toMatch(/^https:\/\//)
      expect(photo.creditSummary.trim()).not.toBe('')
      expect(seen.has(photo.ref), `影像键重复：${photo.ref}`).toBe(false)
      seen.add(photo.ref)
    }
  })

  it('flags the two images that are only identified to genus', () => {
    const creatures = (readCreatures() as { creatures: Array<Record<string, any>> }).creatures
    // 蜥鱼与鱿鱼只找得到属级实拍：孩子看到的并不一定是本页那个物种，必须写明
    for (const id of ['deep-sea-lizardfish', 'jewel-squid']) {
      const creature = creatures.find((item) => item.id === id)!
      expect(creature.photo.note).toContain('只鉴定到属')
      expect(creature.photo.note).toContain(creature.scientificName)
    }
    // 大鼬鳚与鮟鱇鱼的影像与学名可对应；鮟鱇鱼是馆藏照，不能写成水下活体
    const cusk = creatures.find((item) => item.id === 'giant-cusk-eel')!
    expect(cusk.photo.note).toContain('Spectrunculus grandis')
    const anglerfish = creatures.find((item) => item.id === 'johnson-anglerfish')!
    expect(anglerfish.photo.note).toContain('Melanocetus johnsonii')
    expect(anglerfish.photo.note).toContain('不是水下活体拍摄')
    expect(anglerfish.photo.license).toBe('CC BY-SA 4.0')
    expect(anglerfish.photo.attribution).toContain('Fernando Losada Rodríguez')
  })

  it('rejects photos without attribution or with an insecure licence link', () => {
    const bestiary = readCreatures() as { version: string; creatures: Array<Record<string, any>> }
    const missingPhoto = structuredClone(bestiary)
    delete missingPhoto.creatures[0].photo
    expect(() => assertValidCreatures(missingPhoto)).toThrow(/photo.*expected an object/i)

    const unsafeRef = structuredClone(bestiary)
    unsafeRef.creatures[0].photo.ref = '../private/photo'
    expect(() => assertValidCreatures(unsafeRef)).toThrow(/photo\.ref.*safe/i)

    const blankAttribution = structuredClone(bestiary)
    blankAttribution.creatures[0].photo.attribution = '  '
    expect(() => assertValidCreatures(blankAttribution)).toThrow(/photo\.attribution.*non-empty/i)

    const unnamedLicence = structuredClone(bestiary)
    unnamedLicence.creatures[0].photo.creditSummary = '图片来自网上'
    unnamedLicence.creatures[0].photo.attribution = '图片来自网上'
    unnamedLicence.creatures[0].photo.license = '未标注'
    expect(() => assertValidCreatures(unnamedLicence)).toThrow(/name the licence/i)

    const insecureSource = structuredClone(bestiary)
    insecureSource.creatures[0].photo.sourceUrl = 'http://commons.wikimedia.org/wiki/File:X.jpg'
    expect(() => assertValidCreatures(insecureSource)).toThrow(/photo\.sourceUrl.*HTTPS/i)

    const insecureLicence = structuredClone(bestiary)
    insecureLicence.creatures[0].photo.licenseUrl = 'http://creativecommons.org/licenses/by-sa/4.0/'
    expect(() => assertValidCreatures(insecureLicence)).toThrow(/photo\.licenseUrl.*HTTPS/i)
  })

  it('includes size records with their original measurement basis and direct species citations', () => {
    const creatures = (readCreatures() as { creatures: Array<Record<string, any>> }).creatures
    const expected = [
      ['johnson-anglerfish', '18厘米', '2.9厘米', 'TL', 'https://www.fishbase.se/summary/Melanocetus-johnsonii.html'],
      ['giant-cusk-eel', '127厘米', 'SL', 'https://www.fishbase.se/summary/Spectrunculus-grandis.html'],
      ['deep-sea-lizardfish', '64.0厘米', 'SL', 'https://www.fishbase.se/summary/Bathysaurus-ferox.html'],
      ['jewel-squid', '33厘米', 'ML', 'https://www.sealifebase.se/summary/Histioteuthis-bonnellii.html'],
    ]
    for (const [id, ...details] of expected) {
      const creature = creatures.find((item) => item.id === id)!
      const citation = details.pop()!
      for (const detail of details) {
        expect(creature.bodySize, `${id} bodySize includes ${detail}`).toContain(detail)
      }
      expect(creature.sources).toContain(citation)
    }
  })

  it('rejects missing or blank body-size data', () => {
    const bestiary = readCreatures() as { version: string; creatures: Array<Record<string, any>> }
    const missing = structuredClone(bestiary)
    delete missing.creatures[0].bodySize
    expect(() => assertValidCreatures(missing)).toThrow(/bodySize.*non-empty/i)
    const blank = structuredClone(bestiary)
    blank.creatures[0].bodySize = '   '
    expect(() => assertValidCreatures(blank)).toThrow(/bodySize.*non-empty/i)
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

  it('keeps licensed model attribution separate from species facts and validates asset metadata', () => {
    const bestiary = readCreatures() as { version: string; creatures: Array<Record<string, any>> }
    const johnson = bestiary.creatures.find((creature) => creature.id === 'johnson-anglerfish')!
    expect(johnson.model).toMatchObject({
      ref: 'deep-sea-fish-3dsm4',
      creditSummary: 'Deep Sea Fish #3DSM4 · Carlo Bergonzini · CC BY 4.0',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://sketchfab.com/3d-models/deep-sea-fish-3dsm4-6ee4e67640794f7b8cecd10295ab2f55',
    })
    expect(johnson.model.attribution).toContain('Carlo Bergonzini')
    expect(johnson.model.attribution).toContain('CC-BY-4.0')
    expect(johnson.model.note).toMatch(/约翰逊鮟鱇鱼.*精确/)
    assertValidCreatures(bestiary)

    const unsafeRef = structuredClone(bestiary)
    unsafeRef.creatures.find((creature) => creature.id === 'johnson-anglerfish')!.model!.ref = '../private/model'
    expect(() => assertValidCreatures(unsafeRef)).toThrow(/model\.ref.*safe/i)

    const missingAttribution = structuredClone(bestiary)
    missingAttribution.creatures.find((creature) => creature.id === 'johnson-anglerfish')!.model!.attribution = ' '
    expect(() => assertValidCreatures(missingAttribution)).toThrow(/model\.attribution.*non-empty/i)

    const insecureLicenseUrl = structuredClone(bestiary)
    insecureLicenseUrl.creatures.find((creature) => creature.id === 'johnson-anglerfish')!.model!.licenseUrl = 'http://creativecommons.org/licenses/by/4.0/'
    expect(() => assertValidCreatures(insecureLicenseUrl)).toThrow(/model\.licenseUrl.*HTTPS/i)
  })

  it('ships the optimized model and its license notice as local assets', () => {
    const modelPath = resolve(process.cwd(), 'public/models/deep-sea-fish-3dsm4.glb')
    const licensePath = resolve(process.cwd(), 'public/models/anglerfish-license.txt')
    const model = readFileSync(modelPath)
    const license = readFileSync(licensePath, 'utf8')

    expect(model.byteLength).toBeLessThan(2 * 1024 * 1024)
    expect(license).toContain('CC-BY-4.0')
    expect(license).toContain('Carlo Bergonzini')
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
      expect(creature.habitat).toMatch(/OBIS.*(?:观测|水深).*(?:不代表|不等于)(?:物种)?完整分布/)
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
