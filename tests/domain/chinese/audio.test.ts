import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import manifest from '@/data/content/chinese/audio-manifest.json'

describe('chinese audio manifest', () => {
  it('每条录音都有文本、文件与状态', () => {
    expect(manifest.entries.length).toBeGreaterThan(0)
    for (const entry of manifest.entries) {
      expect(entry.text.length).toBeGreaterThan(0)
      expect(entry.file).toMatch(/^chinese\/.+\.mp3$/)
      expect(['pending', 'recorded']).toContain(entry.status)
    }
  })

  it('已录制的条目都有本地文件', () => {
    for (const entry of manifest.entries) {
      if (entry.status !== 'recorded') continue
      const file = resolve(process.cwd(), 'public/audio', entry.file)
      expect(existsSync(file), entry.file).toBe(true)
      expect(statSync(file).size).toBeGreaterThan(5_000)
    }
  })
})
