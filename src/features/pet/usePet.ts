/**
 * `features/pet/usePet.ts` —— 宠物页的动作层：读写事件、重放读模型、拦截无效操作。
 *
 * 数据流（与 design「事件是唯一事实来源」一致）：
 * ```
 * store.listEvents ──► replayPet ──► state（PetState）
 * store.appendEvents ◄── buy / feed / pet / play（校验通过后才落事件）
 * ```
 * 组件只消费 `state` 与这里的动作，不自己拼宠物状态；所有写操作都在**落事件
 * 之前**校验余额、库存与每日上限，避免把注定被投影忽略的事件写进日志。
 *
 * 迁移水位线：首次加载时若本档案没有领养记录，自动补一条 `pet-adopted`，
 * 时间取当前时钟——v3 历史事件因此全部落在领养之前，`replayPet` 不会为老档案
 * 补发 XP/积分。孵化同理只看**领养之后**的 `session-completed`，否则老档案
 * 一进宠物页就会立刻孵化。
 */

import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { petItemById } from '@/data/content/petCatalog'
import { replayPet, type PetState } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

/** 宠物页与存储层之间的窄接口（生产装配见 `productionStores`，测试注入内存态 fake）。 */
export interface PetStore {
  /** 读该档案的全量事件（重放的唯一输入）。 */
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
  /** 幂等追加事件；返回合并后的全量事件。 */
  appendEvents(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

/** UTC 日期键：每日上限按 UTC 日统计，与 `replayPet` 的口径一致。 */
function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/**
 * 宠物动作的组合式逻辑。
 *
 * 事件 ID 全部由「动作 + 参数 + 时钟 + 当前事件数」推导，不用随机数：
 * 同一秒内的连续操作也能区分开，测试结果可复现；重复写入由存储层按
 * `eventId` 幂等去重。
 */
export function usePet(options: {
  store: PetStore
  profileId: MaybeRefOrGetter<string | null>
  clock?: () => number
  name?: string
}) {
  const clock = options.clock ?? (() => Date.now())
  const events = ref<readonly DomainEvent[]>([])
  const loading = ref(false)
  const error = ref('')
  const state = computed<PetState>(() => replayPet(events.value, toValue(options.profileId) ?? '', clock()))

  function base(): { profileId: string; occurredAt: number } {
    const profileId = toValue(options.profileId)
    if (profileId === null) throw new Error('没有选择档案')
    return { profileId, occurredAt: clock() }
  }

  function countToday(type: DomainEvent['type']): number {
    const profileId = toValue(options.profileId)
    if (profileId === null) return 0
    const day = utcDay(clock())
    return events.value.filter(
      (event) => event.profileId === profileId && event.type === type && utcDay(event.occurredAt) === day,
    ).length
  }

  async function append(incoming: readonly DomainEvent[]): Promise<void> {
    await options.store.appendEvents(incoming)
    events.value = [...events.value, ...incoming]
  }

  /**
   * 读事件 → 重放 → 补齐领养/孵化。
   *
   * 领养只补一次：日志里已有 `pet-adopted` 就不再写，否则每次进页面都会多一条。
   * 孵化只认领养之后的 `session-completed`；没有领养记录时 `adoptedAt` 退回当前
   * 时钟，等价于「老档案今天才领养」，不会误判 v3 历史为已完成。
   */
  async function load(): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) return
    loading.value = true
    error.value = ''
    try {
      events.value = await options.store.listEvents(profileId)
      if (!events.value.some((event) => event.profileId === profileId && event.type === 'pet-adopted')) {
        await append([{
          eventId: `adopt-${profileId}`, profileId, occurredAt: clock(),
          type: 'pet-adopted', petId: 'baby-whale', name: options.name ?? '小蓝',
        }])
      }
      const adoption = events.value.find((event) => event.profileId === profileId && event.type === 'pet-adopted')
      const adoptedAt = adoption?.occurredAt ?? clock()
      const hatched = events.value.some((event) => event.profileId === profileId && event.type === 'pet-hatched')
      const learnedSinceAdoption = events.value.some(
        (event) => event.profileId === profileId && event.type === 'session-completed' && event.occurredAt >= adoptedAt,
      )
      if (!hatched && learnedSinceAdoption) {
        await append([{
          eventId: `hatch-${profileId}`, profileId, occurredAt: clock(), type: 'pet-hatched',
        }])
      }
    } catch {
      error.value = '宠物暂时打不开，请稍后再试'
    } finally {
      loading.value = false
    }
  }

  /** 购买：食物进背包、玩具/装饰进拥有列表；余额不足或已拥有非食物商品时拦截。 */
  async function buy(itemId: string): Promise<void> {
    const item = petItemById(itemId)
    if (item === undefined) throw new Error('商品不存在')
    if (!state.value.adopted) throw new Error('还没有宠物')
    if (item.kind !== 'food' && state.value.owned.includes(itemId)) throw new Error('已经拥有')
    if (state.value.points < item.price) throw new Error('积分不足')
    await append([{
      ...base(), eventId: `buy-${itemId}-${clock()}-${events.value.length}`,
      type: 'item-purchased', itemId, price: item.price,
    }])
  }

  /** 喂食：每天最多 3 次，且背包里必须有该食物。 */
  async function feed(itemId: string): Promise<void> {
    if (countToday('pet-fed') >= 3) throw new Error('今天已经喂过 3 次了')
    if ((state.value.inventory[itemId] ?? 0) <= 0) throw new Error('背包里没有这个食物')
    await append([{
      ...base(), eventId: `feed-${itemId}-${clock()}-${events.value.length}`,
      type: 'pet-fed', itemId,
    }])
  }

  /** 抚摸：每天最多 5 次。 */
  async function pet(): Promise<void> {
    if (countToday('pet-petted') >= 5) throw new Error('今天已经摸过很多次了')
    await append([{ ...base(), eventId: `pet-${clock()}-${events.value.length}`, type: 'pet-petted' }])
  }

  /** 玩耍：必须已拥有该玩具，且每天最多 2 次。 */
  async function play(itemId: string): Promise<void> {
    if (!state.value.owned.includes(itemId)) throw new Error('还没有这个玩具')
    if (countToday('pet-played') >= 2) throw new Error('今天已经玩过 2 次了')
    await append([{
      ...base(), eventId: `play-${itemId}-${clock()}-${events.value.length}`,
      type: 'pet-played', itemId,
    }])
  }

  watch(() => toValue(options.profileId), () => { void load() }, { immediate: true })
  return { events, state, loading, error, load, buy, feed, pet, play }
}
