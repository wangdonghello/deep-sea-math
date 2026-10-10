import type { CreatureContent } from '@/data/content/schema'
import type { ZoneConfig } from '@/features/home/zones'

/** Whether a creature's documented depth interval intersects a teaching zone. */
export function overlapsZone(
  creature: Pick<CreatureContent, 'depthRange'>,
  zone: Pick<ZoneConfig, 'min' | 'max'>,
): boolean {
  const zoneMin = zone.min ?? -Infinity
  const zoneMax = zone.max ?? Infinity
  return creature.depthRange.min <= zoneMax && creature.depthRange.max >= zoneMin
}
