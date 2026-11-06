import { describe, expect, it } from 'vitest'

import { levelFromXp, levelProgress, stageFromLevel, xpForNextLevel } from '@/domain/pet/growth'

describe('pet growth', () => {
  it('等级曲线：Lv0→1 需要 40，之后每级多 15', () => {
    expect(xpForNextLevel(0)).toBe(40)
    expect(xpForNextLevel(1)).toBe(55)
    expect(levelFromXp(40)).toBe(1)
    expect(levelFromXp(94)).toBe(1)
    expect(levelFromXp(95)).toBe(2)
  })

  it('等级进度可以显示还差多少 XP', () => {
    expect(levelProgress(120)).toEqual({ level: 2, into: 25, needed: 70 })
    expect(levelProgress(99999).level).toBe(15)
  })

  it('阶段边界：Lv0 蛋、1 幼体、2–4 幼童、5–9 少年、10–14 成体、15 完全体', () => {
    expect(stageFromLevel(0)).toBe('egg')
    expect(stageFromLevel(1)).toBe('baby')
    expect(stageFromLevel(2)).toBe('child')
    expect(stageFromLevel(4)).toBe('child')
    expect(stageFromLevel(5)).toBe('juvenile')
    expect(stageFromLevel(9)).toBe('juvenile')
    expect(stageFromLevel(10)).toBe('adult')
    expect(stageFromLevel(15)).toBe('final')
  })
})
