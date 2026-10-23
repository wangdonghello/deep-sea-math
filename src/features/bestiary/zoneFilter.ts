import type { CreatureContent } from '@/data/content/schema'
import { ZONES, type ZoneConfig } from '@/features/home/zones'

/** Whether a creature's documented depth interval intersects a teaching zone. */
export function overlapsZone(
  creature: Pick<CreatureContent, 'depthRange'>,
  zone: Pick<ZoneConfig, 'min' | 'max'>,
): boolean {
  const zoneMin = zone.min ?? -Infinity
  const zoneMax = zone.max ?? Infinity
  return creature.depthRange.min <= zoneMax && creature.depthRange.max >= zoneMin
}


/**
 * 图鉴区域归属。
 *
 * 深度区间用于卡片上的科普信息；但“哪个区域的鱼”必须稳定到单一区域，
 * 否则一条深度跨度大的鱼会同时出现在暮光区、深海区和深渊区，孩子会误以为
 * 只解锁暮光区却拿到了更深的鱼。`primaryZone` 是内容侧的明确归属；
 * 旧数据没有该字段时才退回深度重叠。
 */
export function zonesForCreature(creature: CreatureContent): ZoneConfig[] {
  if (creature.primaryZone !== undefined) {
    const primary = ZONES.find((zone) => zone.id === creature.primaryZone)
    return primary === undefined ? [] : [primary]
  }
  return ZONES.filter((zone) => overlapsZone(creature, zone))
}

/** 判断一条鱼是否属于指定区域；使用 primaryZone，旧数据回退深度区间。 */
export function belongsToZone(creature: CreatureContent, zone: ZoneConfig): boolean {
  return zonesForCreature(creature).some((candidate) => candidate.id === zone.id)
}
