import { describe, expect, it } from 'vitest'

import { cleanOcrText } from '@/features/mistakeImport/ocr'

describe('OCR text cleanup', () => {
  it('去掉汉字之间的识别空格，保留数字与算式空格', () => {
    expect(cleanOcrText('小 明 有 3 个 苹 果 , 又 买 了 4 个')).toBe('小明有 3 个苹果，又买了 4 个')
    expect(cleanOcrText('3 + 4 = ?')).toBe('3 + 4 = ?')
  })
})
