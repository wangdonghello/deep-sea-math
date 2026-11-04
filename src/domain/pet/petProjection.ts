import { resolveLedger } from '@/domain/economy/ledger'
import { petItemById } from '@/data/content/petCatalog'
import { levelFromXp, stageFromLevel, type PetStage } from './growth'
import type { DomainEvent } from '@/domain/model/types'

/**
 * 宠物读模型：由事件重放推导，供 UI 直接消费。
 *
 * `hunger` 是**饱食度**（越高越饱）；要展示「饥饿」用 `100 - hunger`。
 * 购买余额沿用账本口径，可能为负——负数说明日志异常，由命令层在写入前拦截。
 */
export interface PetState {
  readonly adopted: boolean
  readonly hatched: boolean
  readonly petId: string | null
  readonly name: string
  readonly xp: number
  readonly level: number
  readonly stage: PetStage
  readonly points: number
  readonly inventory: Readonly<Record<string, number>>
  readonly owned: readonly string[]
  readonly hunger: number
  readonly mood: number
  readonly lastUpdatedAt: number
}

const MAX_PET_PER_DAY = 5
const MAX_PLAY_PER_DAY = 2

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/** 独立事件重放：不改 v3 的 projection，避免影响现有功能。 */
export function replayPet(events: readonly DomainEvent[], profileId: string, now: number): PetState {
  const scoped = events.filter((event) => event.profileId === profileId)
  const ledger = resolveLedger(scoped, profileId)
  let adopted = false
  let hatched = false
  let petId: string | null = null
  let name = ''
  let xp = 0
  let hunger = 70
  let mood = 70
  let lastUpdatedAt = now
  const inventory: Record<string, number> = {}
  const owned = new Set<string>()
  const petCount = new Map<string, number>()
  const playCount = new Map<string, number>()
  const completedDays = new Set<string>()

  for (const event of scoped) {
    lastUpdatedAt = Math.max(lastUpdatedAt, event.occurredAt)
    if (event.type === 'pet-adopted') {
      adopted = true
      petId = event.petId
      name = event.name
    }
    if (event.type === 'pet-hatched') hatched = true
    if (event.type === 'item-purchased') {
      const item = petItemById(event.itemId)
      if (item?.kind === 'food') inventory[item.id] = (inventory[item.id] ?? 0) + 1
      else owned.add(event.itemId)
    }
    if (event.type === 'pet-fed') {
      const item = petItemById(event.itemId)
      if (item?.kind === 'food' && (inventory[item.id] ?? 0) > 0) {
        inventory[item.id] = (inventory[item.id] ?? 0) - 1
        xp += item.xp
        hunger = Math.min(100, hunger + item.hunger)
        mood = Math.min(100, mood + 10)
      }
    }
    if (event.type === 'pet-petted') {
      const day = dayKey(event.occurredAt)
      const used = petCount.get(day) ?? 0
      if (used < MAX_PET_PER_DAY) {
        petCount.set(day, used + 1)
        xp += 2
        mood = Math.min(100, mood + 8)
      }
    }
    if (event.type === 'pet-played') {
      const day = dayKey(event.occurredAt)
      const used = playCount.get(day) ?? 0
      if (owned.has(event.itemId) && used < MAX_PLAY_PER_DAY) {
        playCount.set(day, used + 1)
        xp += 6
        mood = Math.min(100, mood + 20)
      }
    }
    if (event.type === 'session-completed') {
      const day = dayKey(event.occurredAt)
      if (!completedDays.has(day)) {
        completedDays.add(day)
        xp += 15
      }
    }
  }

  const level = levelFromXp(xp)
  return {
    adopted,
    hatched,
    petId,
    name,
    xp,
    level,
    stage: stageFromLevel(level),
    points: ledger.balance,
    inventory,
    owned: [...owned],
    hunger,
    mood,
    lastUpdatedAt,
  }
}
