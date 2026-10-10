import type { CreatureContent } from '@/data/content/schema'

const meters = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** Formats a creature's documented depth bounds as an interval in meters. */
export function depthRangeLabel(creature: CreatureContent): string {
  return `约 ${meters.format(creature.depthRange.min)}–${meters.format(creature.depthRange.max)} 米`
}
