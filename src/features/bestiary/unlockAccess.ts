import { DEEP_SEA_STAGES } from '@/data/content/deepSeaStages'

/**
 * v3 图鉴可见性：显式解锁的鱼 + 已通关关卡内的鱼。
 *
 * 关卡推进的规则是“完成第 N 组每日题 = 通关第 N 关 = 解锁该关的 3 条图鉴”
 * （v3 design §4）。这里**不能**再按区域把整片海域的鱼一起放出来：深渊区
 * 一解锁就送出它名下 3 关共 9 条，孩子只通关到第 6 关却拿到了第 7、8 关的
 * 图鉴——实测就是“解锁 3 个区、图鉴显示 24 条”，而正确值是 6 关 × 3 = 18 条。
 *
 * 区域只决定地图可达与筛选范围，不直接发放图鉴。
 *
 * 图鉴列表与观察舱守卫 MUST 共用本函数，否则“看得见”和“进得去”会再次分叉。
 */
export function unlockedCreatureIdSetWithProgress(
  unlocks: Readonly<Record<string, unknown>>,
  completedStages: number,
): ReadonlySet<string> {
  const unlocked = new Set<string>()
  for (const key of Object.keys(unlocks)) {
    if (key.startsWith('creature:')) unlocked.add(key.slice('creature:'.length))
  }
  for (const stage of DEEP_SEA_STAGES) {
    if (stage.stage > completedStages) continue
    for (const creatureId of stage.creatureIds) unlocked.add(creatureId)
  }
  return unlocked
}
