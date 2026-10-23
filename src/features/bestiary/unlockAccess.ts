import { CREATURE_BANK } from '@/data/content'
import { ZONES } from '@/features/home/zones'
import { overlapsZone } from './zoneFilter'

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
    if (ZONES.some((zone) => zones.has(zone.id) && overlapsZone(creature, zone))) {
      unlocked.add(creature.id)
    }
  }
  return unlocked
}
