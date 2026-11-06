/**
 * 宠物成长规则（design §4.5）。
 *
 * 纯函数：只做数值推导，不读系统时钟、不碰存储。所有需要「现在」的函数
 * 都由调用方把 `now` 传进来，这样重放/测试都能得到确定结果。
 */

export type PetStage = 'egg' | 'baby' | 'child' | 'juvenile' | 'adult' | 'final'

/** 每小时饱食度衰减点数。 */
const DECAY_PER_HOUR = 2
/**
 * 饱食度：**越高越饱，越低越饿**（design §4.6）。
 *
 * 喂食 +30 / +45 / +60 都是往上加，低于 40 才表现为「有点饿」，所以存的是
 * 饱食度而不是「饥饿值」。注意函数名 `decayedHunger` 是下游已用的契约，
 * 不要为了语义改名。
 */
const MIN_STAT = 0
const MAX_STAT = 100
/** 等级封顶。 */
const MAX_LEVEL = 15

const MS_PER_HOUR = 3_600_000

/**
 * 从 Lv `level` 升到下一级所需 XP，即 `40 + 15N`。
 *
 * 注意入参是**当前**等级：`xpForNextLevel(0) = 40`（Lv0→Lv1），
 * `xpForNextLevel(1) = 55`（Lv1→Lv2）。因此 Lv1→Lv15 累计 2135 点，
 * 再算上 Lv0→Lv1 的 40 点，Lv0→Lv15 一共 2175 点。
 *
 * 仅 `level < 15` 有有限值；满级（`level >= 15`）没有「下一级」，
 * 返回 `Infinity`，避免把 265 这种不存在的升级花费泄漏给调用方。
 */
export function xpForNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return Infinity
  return 40 + 15 * level
}

/**
 * 累计 XP → 当前等级（封顶 Lv15）。
 *
 * 逐级扣减**当前**等级的升级花费，而不是 `level + 1` 的：后者的偏移量会让
 * 40 点 XP 停在 Lv0、95 点停在 Lv1，与曲线定义和阶段边界都对不上。
 */
export function levelFromXp(xp: number): number {
  let level = 0
  let remaining = Math.max(0, xp)
  while (level < MAX_LEVEL) {
    const cost = xpForNextLevel(level)
    if (remaining < cost) break
    remaining -= cost
    level += 1
  }
  return level
}

/** 等级 → 阶段：0 蛋、1 幼体、2–4 幼童、5–9 少年、10–14 成体、15 完全体。 */
export function stageFromLevel(level: number): PetStage {
  if (level <= 0) return 'egg'
  if (level < 2) return 'baby'
  if (level < 5) return 'child'
  if (level < 10) return 'juvenile'
  if (level < 15) return 'adult'
  return 'final'
}

/**
 * 按经过的小时数衰减**饱食度**，每小时 2 点。
 *
 * 返回的是饱食度（越高越饱、越低越饿，低于 40 表现为「有点饿」）；
 * 调用方若要展示「饥饿」进度，用 `100 - 返回值` 即可。入参与返回值都沿用
 * `hunger` 命名，是因为下游已按这个名字消费，这里不改名、只澄清语义。
 *
 * 衰减只向下不惩罚：最低夹到 0（离线再久也不会变成负数债务），
 * 最高夹到 100（`updatedAt` 在未来的时钟回拨不会把数值顶上天）。
 *
 * 返回值保持**浮点**（不做取整），以免每次读取都丢精度；展示层需要整数时
 * 自行 `Math.round`。
 */
export function decayedHunger(hunger: number, updatedAt: number, now: number): number {
  const hours = Math.max(0, (now - updatedAt) / MS_PER_HOUR)
  return Math.max(MIN_STAT, Math.min(MAX_STAT, hunger - hours * DECAY_PER_HOUR))
}

/** 当前等级的 XP 进度：`into` 是这一级已获得，`needed` 是升下一级所需。 */
export interface LevelProgress {
  level: number
  into: number
  needed: number
}

/**
 * 把累计 XP 换算成“这一级练了多少 / 升级还差多少”。
 *
 * 满级时 `needed` 为 `Infinity`，调用方应显示“已满级”而不是算百分比。
 */
export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp)
  let spent = 0
  for (let current = 0; current < level; current += 1) spent += xpForNextLevel(current)
  return { level, into: Math.max(0, xp - spent), needed: xpForNextLevel(level) }
}
