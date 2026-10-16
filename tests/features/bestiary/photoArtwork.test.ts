import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CREATURE_BANK } from '@/data/content'

/**
 * 真实影像的**可用下限**回归测试。
 *
 * 为什么需要它：家长连续三次反馈"图鉴的鱼太丑、太抽象、太简化"，最后明确要求
 * 换成真实影像。换成照片之后，回归风险从"画得太简单"变成三件可测的事：
 *   1. 图片文件真的被提交进仓库（不能只在本地挂着）；
 *   2. 分辨率够放在 320×224 的卡片里不糊；
 *   3. 单张体积受控——四张照片要在手机上快速出来，不能悄悄塞进几 MB 原图。
 *
 * 视觉好坏无法断言，但这三条能把"退回占位图/塞进巨图"这类真实事故挡住。
 */
const photosDir = resolve(process.cwd(), 'public/photos')

/** JPEG 的魔数：`FF D8 FF`。用来确认提交的是位图而非被改名的占位文件。 */
function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

describe('生物真实影像素材', () => {
  const notice = readFileSync(resolve(photosDir, 'ATTRIBUTION.txt'), 'utf8')

  for (const creature of CREATURE_BANK.creatures) {
    describe(creature.name, () => {
      const file = resolve(photosDir, `${creature.photo.ref}.jpg`)
      const bytes = readFileSync(file)

      it('是可解析的 JPEG 位图', () => {
        expect(isJpeg(bytes), `${creature.photo.ref}.jpg 不是 JPEG`).toBe(true)
      })

      it('分辨率不低于卡片展示所需的 900 像素（长边）', () => {
        // SOF 段里读宽高：字节 0xFFC0-0xFFCF（跳过 DHT/DAC 等非帧段）。
        let width = 0
        let height = 0
        for (let index = 2; index + 9 < bytes.length; index += 1) {
          if (bytes[index] !== 0xff) continue
          const marker = bytes[index + 1]
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            height = bytes.readUInt16BE(index + 5)
            width = bytes.readUInt16BE(index + 7)
            break
          }
        }
        // 卡片最多显示 20rem×14rem（≈320×224 CSS px），2 倍屏需要长边 ≥ 900。
        // 竖构图（如鱿鱼）允许宽 < 高，因此按长边判定，短边只要求 ≥ 480。
        expect(Math.max(width, height), '无法从 SOF 段读出尺寸').toBeGreaterThanOrEqual(900)
        expect(Math.min(width, height)).toBeGreaterThanOrEqual(480)
      })

      it('单张不超过 250 KB，避免把原图直接打包上线', () => {
        expect(statSync(file).size).toBeLessThanOrEqual(250 * 1024)
      })

      it('在 ATTRIBUTION.txt 里有可复核的署名与许可', () => {
        // 素材文件必须和许可记录一起发布：只把 jpg 丢进 public/ 等于丢失授权证据
        expect(notice).toContain(`${creature.photo.ref}.jpg`)
        expect(notice).toContain(creature.photo.sourceUrl)
        expect(notice).toContain(creature.photo.licenseUrl)
      })
    })
  }
})
