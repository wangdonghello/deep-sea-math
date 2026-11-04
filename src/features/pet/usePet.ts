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
import {
  MAX_FEED_PER_DAY,
  MAX_PET_PER_DAY,
  MAX_PLAY_PER_DAY,
  replayPet,
  type PetState,
} from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

/** 宠物页与存储层之间的窄接口（生产装配见 `productionStores`，测试注入内存态 fake）。 */
export interface PetStore {
  /** 读该档案的全量事件（重放的唯一输入）。 */
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
  /**
   * 幂等追加事件，返回**合并去重后的全量日志**。
   *
   * 与生产 `EventRepo.append` 的返回语义对齐：调用方必须用这个返回值覆盖本地
   * 视角，而不是自己 `[...events, ...incoming]` 拼接——后者会绕过事件去重，
   * 同一 `eventId` 的重复事件会在内存里堆起来，而库里只有一条。
   */
  appendEvents(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

/** UTC 日期键：每日上限按 UTC 日统计，与 `replayPet` 的口径一致。 */
function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

const LOAD_FAILED = '宠物暂时打不开，请稍后再试'

/**
 * 宠物动作的组合式逻辑。
 *
 * 事件 ID 全部由「事件类型 + 时钟 + 实例内单调序号」推导，不用随机数：
 * 同一毫秒内的连续操作也能区分开，测试结果可复现；重复写入由存储层按
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

  /**
   * 各档案进行中的加载。
   *
   * `watch(..., { immediate: true })` 会在创建时立刻加载一次，调用方通常还会再
   * `await load()`：两路并发读同一份事件，都判定「没有领养」，就会各补一条
   * `pet-adopted`（孵化同理）。这里把**同一档案**的并发加载折叠成一次。
   *
   * 按 `profileId` 分键而不是只留一个 pending：切换档案时要加载新档案的日志，
   * 复用旧档案的进行中加载会让新档案看到别人的事件。
   */
  const pending = new Map<string, Promise<void>>()

  /**
   * 写操作串行队列。
   *
   * 校验（余额、库存、每日上限）与落事件之间 MUST NOT 有别的写操作插队：
   * 两个并发的 `buy` 若都先读到旧余额，就会双双通过校验、把余额买成负数。
   * 队列让每个动作在上一次动作**结束之后**才读状态。
   *
   * `queue` 自身永远不 reject（失败只传给调用方的返回 Promise），否则一次
   * 校验失败会把后续所有动作都变成同一个错误。
   */
  let queue: Promise<unknown> = Promise.resolve()

  /** 实例内单调序号：同一毫秒内的多次操作也能得到不同 `eventId`。 */
  let seq = 0

  function nextEventId(type: DomainEvent['type']): string {
    seq += 1
    return `${type}-${clock()}-${seq}`
  }

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

  /** 追加事件：以 store 返回的合并去重日志为准，不做本地拼接。 */
  async function append(incoming: readonly DomainEvent[]): Promise<void> {
    const merged = await options.store.appendEvents(incoming)
    // 追加期间切换了档案：旧档案的合并日志不能覆盖新档案的状态。
    const owner = incoming[0]?.profileId
    if (owner !== undefined && toValue(options.profileId) !== owner) return
    events.value = merged
  }

  /** 写操作串行化：前一次结束（无论成功失败）后才执行下一次。 */
  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = queue.then(run)
    queue = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * 读事件 → 重放 → 补齐领养/孵化（真正的加载逻辑，由 `load` 去重后按档案调用）。
   *
   * 领养只补一次：日志里已有 `pet-adopted` 就不再写，否则每次进页面都会多一条。
   * 孵化只认领养之后的 `session-completed`；没有领养记录时 `adoptedAt` 退回当前
   * 时钟，等价于「老档案今天才领养」，不会误判 v3 历史为已完成。
   *
   * 失败只写 `error` 文案，不向上抛：`watch` 里的调用是 `void load()`，抛出会
   * 变成未处理的 Promise rejection。
   */
  async function runLoad(profileId: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const loaded = await options.store.listEvents(profileId)
      // 加载期间切换了档案：这份结果已经没有归属，丢弃。
      if (toValue(options.profileId) !== profileId) return
      events.value = loaded
      if (!loaded.some((event) => event.profileId === profileId && event.type === 'pet-adopted')) {
        await append([{
          eventId: `adopt-${profileId}`, profileId, occurredAt: clock(),
          type: 'pet-adopted', petId: 'baby-whale', name: options.name ?? '小蓝',
        }])
        if (toValue(options.profileId) !== profileId) return
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
      error.value = LOAD_FAILED
    } finally {
      loading.value = false
    }
  }

  /** 加载入口：同一档案的并发调用折叠到同一个进行中的加载，结束后清空。 */
  function load(): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) return Promise.resolve()
    const running = pending.get(profileId)
    if (running !== undefined) return running
    const started = runLoad(profileId).finally(() => { pending.delete(profileId) })
    pending.set(profileId, started)
    return started
  }

  /**
   * 购买：食物进背包、玩具/装饰进拥有列表；余额不足或已拥有非食物商品时拦截。
   *
   * 校验与追加都在队列里，避免两笔并发购买各自读到同一份旧余额。
   */
  function buy(itemId: string): Promise<void> {
    return enqueue(async () => {
      const item = petItemById(itemId)
      if (item === undefined) throw new Error('商品不存在')
      if (!state.value.adopted) throw new Error('还没有宠物')
      if (item.kind !== 'food' && state.value.owned.includes(itemId)) throw new Error('已经拥有')
      if (state.value.points < item.price) throw new Error('积分不足')
      await append([{
        ...base(), eventId: nextEventId('item-purchased'), type: 'item-purchased', itemId, price: item.price,
      }])
    })
  }

  /** 喂食：每天最多 `MAX_FEED_PER_DAY` 次，且背包里必须有该食物。 */
  function feed(itemId: string): Promise<void> {
    return enqueue(async () => {
      if (countToday('pet-fed') >= MAX_FEED_PER_DAY) throw new Error('今天已经喂过 3 次了')
      if ((state.value.inventory[itemId] ?? 0) <= 0) throw new Error('背包里没有这个食物')
      await append([{
        ...base(), eventId: nextEventId('pet-fed'), type: 'pet-fed', itemId,
      }])
    })
  }

  /** 抚摸：每天最多 `MAX_PET_PER_DAY` 次，且必须先有宠物。 */
  function pet(): Promise<void> {
    return enqueue(async () => {
      if (!state.value.adopted) throw new Error('还没有宠物')
      if (countToday('pet-petted') >= MAX_PET_PER_DAY) throw new Error('今天已经摸过很多次了')
      await append([{ ...base(), eventId: nextEventId('pet-petted'), type: 'pet-petted' }])
    })
  }

  /** 玩耍：必须是已拥有的玩具（装饰也算 owned，但不能拿来玩），且每天最多 `MAX_PLAY_PER_DAY` 次。 */
  function play(itemId: string): Promise<void> {
    return enqueue(async () => {
      if (petItemById(itemId)?.kind !== 'toy') throw new Error('这不是玩具')
      if (!state.value.owned.includes(itemId)) throw new Error('还没有这个玩具')
      if (countToday('pet-played') >= MAX_PLAY_PER_DAY) throw new Error('今天已经玩过 2 次了')
      await append([{
        ...base(), eventId: nextEventId('pet-played'), type: 'pet-played', itemId,
      }])
    })
  }

  watch(() => toValue(options.profileId), () => { void load() }, { immediate: true })
  return { events, state, loading, error, load, buy, feed, pet, play }
}
