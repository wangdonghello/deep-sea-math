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
})
