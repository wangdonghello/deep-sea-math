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
import { randomUuid } from '@/domain/crypto/randomUuid'
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
 * 事件 ID：动作事件用 `randomUuid()`（全局唯一，同一毫秒内的连续操作也不会
 * 撞 id）；`pet-adopted` / `pet-hatched` 保留确定性的 `<动作>-<profileId>`，
 * 这样重复加载可以用同一 id 幂等去重。
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

  /** 按捕获的档案重放本地日志：动作校验只看自己档案的状态。 */
  function snapshot(profileId: string): PetState {
    return replayPet(events.value, profileId, clock())
  }

  function base(profileId: string): { profileId: string; occurredAt: number } {
    return { profileId, occurredAt: clock() }
  }

  function countToday(type: DomainEvent['type'], profileId: string): number {
    const day = utcDay(clock())
    return events.value.filter(
      (event) => event.profileId === profileId && event.type === type && utcDay(event.occurredAt) === day,
    ).length
  }

  /**
   * 追加事件：以 store 返回的合并去重日志为准，不做本地拼接。
   *
   * `profileId` 是**动作入口捕获**的档案：写库永远写它；但只有当界面当前仍停在
   * 这个档案时才刷新本地视角，否则旧档案的日志会盖住新档案的界面状态。
   */
  async function append(incoming: readonly DomainEvent[], profileId: string): Promise<void> {
    const merged = await options.store.appendEvents(incoming)
    if (toValue(options.profileId) !== profileId) return
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
   * 补写走写队列，避免和用户动作（购买/喂养）互相覆盖本地视角；入队后**再次**
   * 确认档案没变，防止排队期间切档案把旧档案的领养/孵化事件写到新档案界面上。
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
        await enqueue(async () => {
          if (toValue(options.profileId) !== profileId) return
          await append([{
            eventId: `adopt-${profileId}`, profileId, occurredAt: clock(),
            type: 'pet-adopted', petId: 'baby-whale', name: options.name ?? '小蓝',
          }], profileId)
        })
        if (toValue(options.profileId) !== profileId) return
      }
      const adoption = events.value.find((event) => event.profileId === profileId && event.type === 'pet-adopted')
      const adoptedAt = adoption?.occurredAt ?? clock()
      const hatched = events.value.some((event) => event.profileId === profileId && event.type === 'pet-hatched')
      const learnedSinceAdoption = events.value.some(
        (event) => event.profileId === profileId && event.type === 'session-completed' && event.occurredAt >= adoptedAt,
      )
      // 从 v3 导入的档案，历史完成记录早于领养事件；这些孩子已经学过很多组，
      // 不能让他们对着一个永远不破壳的蛋。历史完成只用于「破壳」，不补发 XP
      // 或积分（水位线仍在 replayPet 里生效）。
      const hasHistoricalCompletion = events.value.some(
        (event) => event.profileId === profileId && event.type === 'session-completed',
      )
      if (!hatched && (learnedSinceAdoption || hasHistoricalCompletion)) {
        await enqueue(async () => {
          if (toValue(options.profileId) !== profileId) return
          await append([{
            eventId: `hatch-${profileId}`, profileId, occurredAt: clock(), type: 'pet-hatched',
          }], profileId)
        })
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
   * 档案在**入口**捕获并一路传给校验与写入：动作排队期间切换档案，也不会把
   * 这次操作写到新档案上。
   */
  function buy(itemId: string): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) throw new Error('没有选择档案')
    return enqueue(async () => {
      const current = snapshot(profileId)
      const item = petItemById(itemId)
      if (item === undefined) throw new Error('商品不存在')
      if (!current.adopted) throw new Error('还没有宠物')
      if (item.kind !== 'food' && current.owned.includes(itemId)) throw new Error('已经拥有')
      if (current.points < item.price) throw new Error('积分不足')
      await append([{
        ...base(profileId), eventId: randomUuid(), type: 'item-purchased', itemId, price: item.price,
      }], profileId)
    })
  }

  /** 喂食：每天最多 `MAX_FEED_PER_DAY` 次，且背包里必须有该食物。 */
  function feed(itemId: string): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) throw new Error('没有选择档案')
    return enqueue(async () => {
      if (countToday('pet-fed', profileId) >= MAX_FEED_PER_DAY) {
        throw new Error(`今天已经喂过 ${MAX_FEED_PER_DAY} 次了`)
      }
      if ((snapshot(profileId).inventory[itemId] ?? 0) <= 0) throw new Error('背包里没有这个食物')
      await append([{
        ...base(profileId), eventId: randomUuid(), type: 'pet-fed', itemId,
      }], profileId)
    })
  }

  /** 抚摸：每天最多 `MAX_PET_PER_DAY` 次，且必须先有宠物。 */
  function pet(): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) throw new Error('没有选择档案')
    return enqueue(async () => {
      if (!snapshot(profileId).adopted) throw new Error('还没有宠物')
      if (countToday('pet-petted', profileId) >= MAX_PET_PER_DAY) throw new Error('今天已经摸过很多次了')
      await append([{ ...base(profileId), eventId: randomUuid(), type: 'pet-petted' }], profileId)
    })
  }

  /** 玩耍：必须是已拥有的玩具（装饰也算 owned，但不能拿来玩），且每天最多 `MAX_PLAY_PER_DAY` 次。 */
  function play(itemId: string): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) throw new Error('没有选择档案')
    return enqueue(async () => {
      if (petItemById(itemId)?.kind !== 'toy') throw new Error('这不是玩具')
      if (!snapshot(profileId).owned.includes(itemId)) throw new Error('还没有这个玩具')
      if (countToday('pet-played', profileId) >= MAX_PLAY_PER_DAY) {
        throw new Error(`今天已经玩过 ${MAX_PLAY_PER_DAY} 次了`)
      }
      await append([{
        ...base(profileId), eventId: randomUuid(), type: 'pet-played', itemId,
      }], profileId)
    })
  }

  watch(() => toValue(options.profileId), () => { void load() }, { immediate: true })
  return { events, state, loading, error, load, buy, feed, pet, play }
}
