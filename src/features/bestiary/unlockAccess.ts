import { CREATURE_BANK } from '@/data/content'
import { DEEP_SEA_STAGES } from '@/data/content/deepSeaStages'
import { zonesForCreature } from './zoneFilter'

/**
 * 图鉴可见性：显式解锁的鱼 + 已解锁区域内的鱼。
 *
 * 区域解锁是“进入这片海域”的权限，同一个区域里的鱼应该一起出现在图鉴里；
 * 否则孩子解锁暮光区后仍只看到一行剪影，会觉得区域没生效。
 */
export function unlockedCreatureIdSet(
  unlocks: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  const unlocked = new Set<string>()
  const zones = new Set<string>()
  for (const key of Object.keys(unlocks)) {
    if (key.startsWith('creature:')) unlocked.add(key.slice('creature:'.length))
    if (key.startsWith('zone:')) zones.add(key.slice('zone:'.length))
  }
  if (zones.size === 0) return unlocked
  for (const creature of CREATURE_BANK.creatures) {
    if (zonesForCreature(creature).some((zone) => zones.has(zone.id))) {
      unlocked.add(creature.id)
    }
  }
  return unlocked
}

/**
 * 十关进度与图鉴解锁的合并口径。
 *
 * v3 的规则是“完成第 N 组每日题 = 通关第 N 关 = 解锁该关的 3 条图鉴”，但
 * `bestiaryUnlock` 投影里只有历史上的 `unlock-granted` 事件（每条一次只发一张
 * 卡、一个区）。两套口径不合并时会出现：关卡标签已经亮到第 N 关，那一关的鱼
 * 却还是剪影，点进观察舱又被守卫打回图鉴。
 *
 * 图鉴列表与观察舱守卫 MUST 共用本函数，否则“看得见”和“进得去”会再次分叉。
 */
export function unlockedCreatureIdSetWithProgress(
  unlocks: Readonly<Record<string, unknown>>,
  completedStages: number,
): ReadonlySet<string> {
  const unlocked = new Set(unlockedCreatureIdSet(unlocks))
  for (const stage of DEEP_SEA_STAGES) {
    if (stage.stage > completedStages) continue
    for (const creatureId of stage.creatureIds) unlocked.add(creatureId)
  }
  return unlocked
}
