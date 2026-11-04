import { describe, expect, it } from 'vitest'

import { decayedHunger, levelFromXp, stageFromLevel, xpForNextLevel } from '@/domain/pet/growth'

/**
 * `domain/pet/growth` 的行为契约。
 *
 * 锁四件事（design §4.5 / §4.6）：
 * 1. 升级曲线：从 Lv N 升到 Lv N+1 需要 `40 + 15N` 点 XP，满级为 `Infinity`；
 * 2. `levelFromXp` 吃的是**累计** XP，并且封顶 Lv15；
 * 3. 阶段由等级推导：0 蛋、1–4 幼体、5–9 少年、10–14 成体、15 完全体；
 * 4. 饱食度按小时衰减（每小时 2 点），且不惩罚：最低 0、最高 100。
 *
 * 时间戳一律用定值并把 `now` 显式传进去，用例不依赖系统时钟。
 */

const hour = 3_600_000

describe('pet growth', () => {
  it('升级所需 XP 为 40 + 15N', () => {
    expect(xpForNextLevel(0)).toBe(40)
    expect(xpForNextLevel(1)).toBe(55)
    expect(xpForNextLevel(14)).toBe(250)
    // 满级没有「下一级」：不返回 265 这种不存在的花费。
    expect(xpForNextLevel(15)).toBe(Infinity)
  })

  it('按累计 XP 计算等级与阶段', () => {
    expect(levelFromXp(0)).toBe(0)
    expect(levelFromXp(40)).toBe(1)
    expect(levelFromXp(95)).toBe(2)
    // 距 Lv2 还差 1 点：停在 Lv1，不四舍五入。
    expect(levelFromXp(94)).toBe(1)
    expect(stageFromLevel(0)).toBe('egg')
    expect(stageFromLevel(1)).toBe('baby')
    expect(stageFromLevel(5)).toBe('juvenile')
    expect(stageFromLevel(10)).toBe('adult')
    expect(stageFromLevel(15)).toBe('final')
  })

  it('饱食度按小时衰减但不低于 0', () => {
    const now = 10 * hour
    expect(decayedHunger(100, 0, now)).toBe(80)
    expect(decayedHunger(5, 0, now)).toBe(0)
  })

  it('等级封顶 15，多余 XP 不再升级', () => {
    /** Lv0→Lv15 累计 2175 点。 */
    expect(levelFromXp(2175)).toBe(15)
    expect(levelFromXp(2174)).toBe(14)
    expect(levelFromXp(1e9)).toBe(15)
    expect(levelFromXp(-10)).toBe(0)
  })

  it('阶段边界按等级切换', () => {
    expect(stageFromLevel(4)).toBe('baby')
    expect(stageFromLevel(9)).toBe('juvenile')
    expect(stageFromLevel(14)).toBe('adult')
    // 负数等级没有意义，按最保守的蛋处理。
    expect(stageFromLevel(-1)).toBe('egg')
  })

  it('衰减时间不倒流，也不会把饱食度顶过 100', () => {
    // updatedAt 在 now 之后（时钟回拨）：不衰减。
    expect(decayedHunger(50, 10 * hour, 0)).toBe(50)
    // 传入的数值已超过上限时夹到 100。
    expect(decayedHunger(150, 0, 0)).toBe(100)
    // 零时长不衰减。
    expect(decayedHunger(100, 5 * hour, 5 * hour)).toBe(100)
    // 半个小时的衰减保留浮点，不提前取整。
    expect(decayedHunger(100, 0, hour / 2)).toBe(99)
  })
})
