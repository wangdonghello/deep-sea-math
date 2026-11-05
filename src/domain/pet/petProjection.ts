import { resolveLedger } from '@/domain/economy/ledger'
import { petItemById } from '@/data/content/petCatalog'
import { levelFromXp, stageFromLevel, type PetStage } from './growth'
import type { DomainEvent } from '@/domain/model/types'

/**
 * 宠物读模型：由事件重放推导，供 UI 直接消费。
 *
 * `hunger` 是**饱食度**（越高越饱）；要展示「饥饿」用 `100 - hunger`。
 * `xp` 与 `points` 只结算领养之后的事件：v3 历史里的答题/整组完成是旧版本
 * 的奖励，迁移时不能因为补上宠物再补发一遍。
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
  /** 盲盒券：完成过的天数减去已开盒次数。 */
  readonly tickets: number
  /** 已拥有的动物伙伴 id（每种唯一）。 */
  readonly ownedAnimals: readonly string[]
  /** 主宠物 id：进入房间时默认展示。 */
  readonly mainPetId: string
  /**
   * 饱食度：**越高越饱、越低越饿**（不是饥饿值）。
   * 展示「饥饿」进度时用 `100 - hunger`。
   */
  readonly hunger: number
  readonly mood: number
  /**
   * 最近一条**真正生效的**宠物状态事件（领养/孵化/喂食/抚摸/玩耍）时间；
   * 展示层用它与 `now` 计算饱食度衰减。购买、答题、整组完成，以及缺货或
   * 超出每日上限的无效操作都不推进锚点。该档案没有任何宠物状态事件时
   * 退回本次重放的 `now`。
   */
  readonly lastUpdatedAt: number
}

/** 每日喂食上限：与动作层（`usePet`）共用，避免两处各写一个 3。 */
export const MAX_FEED_PER_DAY = 3
/** 每日抚摸上限。 */
export const MAX_PET_PER_DAY = 5
/** 每日玩耍上限。 */
export const MAX_PLAY_PER_DAY = 2

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/**
 * 事件排序：先按发生时间升序，同一时刻用 `eventId` 字典序打破平局。
 *
 * 重放必须与日志写入顺序无关（旧日志、合并导入都可能乱序），否则
 * 「先喂食还是先购买」会得到不同结果。`eventId` 全局唯一，排序完全确定。
 */
function compareEvents(a: DomainEvent, b: DomainEvent): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt - b.occurredAt
  if (a.eventId === b.eventId) return 0
  return a.eventId < b.eventId ? -1 : 1
}

/**
 * 独立事件重放：不改 v3 的 projection，避免影响现有功能。
 *
 * `now` 不参与事件时间的推导（否则 `lastUpdatedAt` 恒等于 `now`，展示层的
 * 饱食度衰减会失效），只在该档案没有任何宠物状态事件时作为衰减起点兜底。
 */
export function replayPet(events: readonly DomainEvent[], profileId: string, now: number): PetState {
  const sorted = [...events].sort(compareEvents)
  // 迁移水位线：本档案第一次领养之前的事件属于 v3 历史，不参与 XP/积分结算。
  const adoption = sorted.find((event) => event.profileId === profileId && event.type === 'pet-adopted')
  const adoptedAt = adoption?.occurredAt ?? null
  const active = adoptedAt === null ? [] : sorted.filter((event) => event.occurredAt >= adoptedAt)
  // resolveLedger 自己会按 profileId 过滤，这里只负责按水位线裁剪。
  const ledger = resolveLedger(active, profileId)
  const scoped = active.filter((event) => event.profileId === profileId)
  let adopted = false
  let hatched = false
  let petId: string | null = null
  let name = ''
  let xp = 0
  let hunger = 70
  let mood = 70
  let lastUpdatedAt = 0
  let hasPetStateEvent = false
  const inventory: Record<string, number> = {}
  const owned = new Set<string>()
  const ownedAnimals = new Set<string>()
  let openedBoxes = 0
  let mainPetId = 'baby-whale'
  const feedCount = new Map<string, number>()
  const petCount = new Map<string, number>()
  const playCount = new Map<string, number>()
  const completedDays = new Set<string>()
  const correctionDays = new Map<string, number>()

  /** 只有真正改变了宠物状态的操作才推进衰减锚点。 */
  const markPetEvent = (at: number): void => {
    lastUpdatedAt = Math.max(lastUpdatedAt, at)
    hasPetStateEvent = true
  }

  for (const event of scoped) {
    if (event.type === 'pet-adopted') {
      adopted = true
      petId = event.petId
      name = event.name
      markPetEvent(event.occurredAt)
    } else if (event.type === 'pet-hatched') {
      hatched = true
      markPetEvent(event.occurredAt)
    } else if (event.type === 'item-purchased') {
      const item = petItemById(event.itemId)
      if (item?.kind === 'food') {
        inventory[item.id] = (inventory[item.id] ?? 0) + 1
      } else if (item?.kind === 'toy' || item?.kind === 'decor') {
        // 未知商品 id 直接忽略：既不入库存，也不进拥有列表。
        if (!owned.has(item.id)) {
          // 第一次买下玩具/装饰也算“布置新家”，给一笔成长值。
          owned.add(item.id)
          xp += item.kind === 'toy' ? 10 : 20
          mood = Math.min(100, mood + (item.kind === 'toy' ? 15 : 10))
        }
      }
    } else if (event.type === 'main-pet-set') {
      mainPetId = event.petId
    } else if (event.type === 'blind-box-opened') {
      openedBoxes += 1
      if (event.rewardKind === 'snack') {
        inventory[event.rewardId] = (inventory[event.rewardId] ?? 0) + 1
      } else if (event.rewardKind === 'xp') {
        xp += 25
      } else if (event.rewardKind === 'animal') {
        ownedAnimals.add(event.rewardId)
      }
    } else if (event.type === 'pet-fed') {
      const item = petItemById(event.itemId)
      const day = dayKey(event.occurredAt)
      const used = feedCount.get(day) ?? 0
      if (item?.kind === 'food' && used < MAX_FEED_PER_DAY && (inventory[item.id] ?? 0) > 0) {
        inventory[item.id] = (inventory[item.id] ?? 0) - 1
        feedCount.set(day, used + 1)
        xp += item.xp
        hunger = Math.min(100, hunger + item.hunger)
        mood = Math.min(100, mood + 10)
        markPetEvent(event.occurredAt)
      }
    } else if (event.type === 'pet-petted') {
      const day = dayKey(event.occurredAt)
      const used = petCount.get(day) ?? 0
      if (used < MAX_PET_PER_DAY) {
        petCount.set(day, used + 1)
        xp += 2
        mood = Math.min(100, mood + 8)
        markPetEvent(event.occurredAt)
      }
    } else if (event.type === 'correction-done') {
      const day = dayKey(event.occurredAt)
      const used = correctionDays.get(day) ?? 0
      if (used < 5) {
        correctionDays.set(day, used + 1)
        xp += 5
      }
    } else if (event.type === 'pet-played') {
      const day = dayKey(event.occurredAt)
      const used = playCount.get(day) ?? 0
      // 必须已拥有**玩具**：装饰虽然也在 owned 里，但不能拿来玩耍。
      const item = petItemById(event.itemId)
      if (item?.kind === 'toy' && owned.has(item.id) && used < MAX_PLAY_PER_DAY) {
        playCount.set(day, used + 1)
        xp += 6
        mood = Math.min(100, mood + 20)
        markPetEvent(event.occurredAt)
      }
    } else if (event.type === 'session-completed') {
      const day = dayKey(event.occurredAt)
      if (!completedDays.has(day)) {
        completedDays.add(day)
        xp += 15
      }
    }
  }

  // 没有任何宠物状态事件时没有衰减起点，退回 now。
  if (!hasPetStateEvent) lastUpdatedAt = now

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
    owned: [...owned].sort(),
    tickets: Math.max(0, completedDays.size - openedBoxes),
    ownedAnimals: [...ownedAnimals].sort(),
    mainPetId,
    hunger,
    mood,
    lastUpdatedAt,
  }
}
