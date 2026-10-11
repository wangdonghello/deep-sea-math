import { appendEvents } from '../../domain/eventLog/appendEvents'
import type { DomainEvent } from '../../domain/model/types'
import { STORE_NAMES } from '../db'
import type { DeepSeaDb } from '../db'

/**
 * `src/data/repositories/eventRepo.ts` —— 事件日志的持久化读写。
 *
 * 定位：这是事件日志（唯一事实来源）与 IndexedDB 之间**唯一**的通道。
 * spec `offline-event-log` §事件记录与 ID 幂等 要求"同一次逻辑操作 MUST NOT
 * 产生两条语义重复的事件"，去重规则本身由 `domain/eventLog/appendEvents`
 * 实现——本模块**复用它，不另写一套去重**。两套去重规则必然漂移：比如仓储
 * 只按 `eventId` 去重，就漏掉了"重试补发换了 eventId"这条真实路径。
 *
 * 实现立场（Constitution Check·避免循环内 I/O）：
 * 读一次 `getAllFromIndex`（事件）+ 一次 `getAll`（写入次序台账），
 * 去重、排序、合并全在内存里做，循环里没有任何逐条查询；写路径只 put
 * "新增"的那几条，不重写整个日志。
 *
 * 同毫秒事件的次序见 {@link orderEvents}：`occurredAt` 升序，同刻按
 * `eventOrder` 台账记录的写入先后。台账是必需的——`eventId` 是 UUID，不蕴含
 * 时间序，仅靠它排序会让"重放"与"逐事件增量维护"对同一份事件给出不同顺序。
 */

/** 事件日志仓储接口（IndexedDB 态与内存态实现同一份契约）。 */
export interface EventRepo {
  /**
   * 幂等追加事件。
   *
   * 同一 `eventId` 或同一逻辑组合（见 `appendEvents` 的键口径）的重复写入
   * 不会新增记录；先到者胜。
   *
   * @param incoming 待追加事件（只读）；**必须同属一个档案**，否则抛错——
   *   混档批次若按首条事件的档案落库，会把别的孩子的事件写进这份日志。
   * @returns 合并后该档案的全量事件，顺序与 {@link listByProfile} **逐条
   *   一致**：`occurredAt` 升序，同刻按本方法收到的先后（即台账里的写入
   *   次序）。注意"先到者胜"的去重会让返回值可能少于 `incoming` 的长度。
   * @throws {Error} 批次内混有多个 `profileId`。
   */
  append(incoming: readonly DomainEvent[]): Promise<DomainEvent[]>

  /**
   * 取某档案的全量事件，按 `occurredAt` 升序（即时间顺序）。
   *
   * 排序在仓储层做而非交给调用方：索引返回的是 `eventId` 字典序，若每处
   * 调用都自己排一次，迟早有一处忘排，而忘排的那处会悄悄喂给重放一个错序。
   *
   * @param profileId 档案 ID；档案间数据隔离边界。
   */
  listByProfile(profileId: string): Promise<DomainEvent[]>

  /** 数某档案的事件条数（测试与删档前的规模提示用）。 */
  countByProfile(profileId: string): Promise<number>

  /**
   * 删除某档案的全部事件（删档案时调用）。
   *
   * 只删该档案，不动其他档案——`profileId` 是硬边界。
   */
  removeByProfile(profileId: string): Promise<void>
}

/**
 * 按「`occurredAt` 升序 → 同刻按 `rank`（写入次序）升序」排事件。
 *
 * 为什么必须双键：`replayProjections` 规定"调用方传入的顺序就是写入顺序"，
 * 同毫秒内多条事件的次序直接决定重放结果。若同刻退回按 `eventId`（UUID）
 * 排，同一份事件在"重放"与"逐事件增量维护"两条路径上会得到不同顺序，
 * 两者深度相等的断言就会偶发失败。
 *
 * `rank` 来自 `eventOrder` 台账（见 `db.ts` 的 {@link STORE_NAMES.eventOrder}）：
 * 台账里越靠前 = 写入越早。**台账里没有的 `eventId` 记为 `Infinity`**，它们
 * 排在所有有台账记录的事件之后、彼此之间保持传入次序（`sort` 在 V8 稳定）。
 * 这只会在"库由旧版构建留下、没有台账"时发生，那种情况下写入次序已无从
 * 还原，退回稳定序是唯一诚实的做法。
 *
 * @param events 待排序事件。
 * @param rankOf `eventId → 写入次序` 的查找表。
 * @returns 排好序的新数组（入参不被修改）。
 */
function orderEvents(
  events: readonly DomainEvent[],
  rankOf: ReadonlyMap<string, number>,
): DomainEvent[] {
  const rank = (eventId: string): number => rankOf.get(eventId) ?? Number.POSITIVE_INFINITY
  return [...events].sort((left, right) => {
    if (left.occurredAt !== right.occurredAt) {
      return left.occurredAt - right.occurredAt
    }
    // 两条都没有台账记录时返回 0：V8 的 sort 是稳定排序，保持传入次序；
    // 若让 `Infinity - Infinity` 算出 NaN，比较器返回值就成了 undefined 行为。
    return rank(left.eventId) - rank(right.eventId) || 0
  })
}

/**
 * 取某档案的「`eventId` → 写入次序」查找表。
 *
 * 台账一次 `getAll` 取回，再于内存里按档案过滤——**不在循环里逐条查**
 * （Constitution Check·避免循环内 I/O）；台账本身也刻意不给 `profileId`
 * 建索引，因为建了索引就得逐档案开游标，反而多一次 I/O。
 *
 * @param db 数据库句柄。
 * @param profileId 档案 ID。
 */
async function loadWriteRanks(
  db: DeepSeaDb,
  profileId: string,
): Promise<Map<string, number>> {
  const entries = await db.getAll(STORE_NAMES.eventOrder)
  const ranks = new Map<string, number>()
  entries.forEach((entry, index) => {
    // `entries` 的下标就是台账的物理次序（autoIncrement 主键升序返回）。
    if (entry.profileId === profileId && !ranks.has(entry.eventId)) {
      ranks.set(entry.eventId, index)
    }
  })
  return ranks
}

/**
 * 深拷贝一条事件。
 *
 * 读路径（`append` 的返回值与 `listByProfile`）返回副本而不是库里那份的
 * 引用：调用方（重放、投影维护）会把这些事件装进自己的结构，共享引用意味着
 * 任何一处的临时改写都会顺着引用改到下一次读到的数据上。事件是不可变值
 * 对象，拷贝一次的成本远小于排查这类污染的成本。
 */
function clone(event: DomainEvent): DomainEvent {
  return structuredClone(event)
}

/**
 * 基于 IndexedDB 的事件仓储实现。
 *
 * @param db 已打开并完成迁移的数据库句柄。
 */
export function createEventRepo(db: DeepSeaDb): EventRepo {
  return {
    async append(incoming) {
      if (incoming.length === 0) {
        // 空批次也是合法输入（例如一次没产生任何事件的保存动作）：不写库，
        // 直接给回空数组。刻意不去猜 profileId —— 猜错会把他档案日志带出来。
        return []
      }
      // 追加的事件必须同属一个档案：混合批次若按首条的 profileId 落库，会把
      // 别的孩子的事件写进这份日志——档案隔离是硬边界，宁可抛错也不猜。
      const profileId = incoming[0].profileId
      if (!incoming.every((event) => event.profileId === profileId)) {
        throw new Error('eventRepo.append: 一次追加的事件必须同属一个档案')
      }
      const existing = await db.getAllFromIndex(STORE_NAMES.events, 'by_profile', profileId)
      const knownIds = new Set(existing.map((event) => event.eventId))
      const merged = orderEvents(appendEvents(existing, incoming), await loadWriteRanks(db, profileId))

      // 只写入"新增"的那几条，不把整个日志重写一遍：日志随使用天数线性增长，
      // 每次追加都全量 put 会在几个月后变成可感知的写入放大（读一次、写全部）。
      const fresh = merged.filter((event) => !knownIds.has(event.eventId))
      const tx = db.transaction([STORE_NAMES.events, STORE_NAMES.eventOrder], 'readwrite')
      await Promise.all(fresh.map((event) => tx.objectStore(STORE_NAMES.events).put(event)))
      // 台账按「本批次内 incoming 的先后」追加：同毫秒事件的次序由此定下，
      // 之后无论读多少次都还原成同一个顺序。
      await Promise.all(
        fresh.map((event) => tx.objectStore(STORE_NAMES.eventOrder).put({ profileId, eventId: event.eventId })),
      )
      await tx.done

      return merged.map((event) => clone(event))
    },

    async listByProfile(profileId) {
      const [events, ranks] = await Promise.all([
        db.getAllFromIndex(STORE_NAMES.events, 'by_profile', profileId),
        loadWriteRanks(db, profileId),
      ])
      return orderEvents(events, ranks).map((event) => clone(event))
    },

    countByProfile(profileId) {
      return db.countFromIndex(STORE_NAMES.events, 'by_profile', profileId)
    },

    async removeByProfile(profileId) {
      const keys = await db.getAllKeysFromIndex(STORE_NAMES.events, 'by_profile', profileId)
      // 台账里的键也要一起删：`autoIncrement` 主键只增不复用，若只删事件不删
      // 台账，这些键会带着已不存在的事件 ID 永远躺在库里，逐月累积。
      const orderKeys = await db.getAllKeys(STORE_NAMES.eventOrder)
      const orderEntries = await db.getAll(STORE_NAMES.eventOrder)
      const tx = db.transaction([STORE_NAMES.events, STORE_NAMES.eventOrder], 'readwrite')
      await Promise.all(keys.map((key) => tx.objectStore(STORE_NAMES.events).delete(key)))
      // `getAllKeys` 与 `getAll` 都以主键升序返回，两条平行数组按下标对齐。
      await Promise.all(
        orderEntries.flatMap((entry, index) =>
          entry.profileId === profileId ? [tx.objectStore(STORE_NAMES.eventOrder).delete(orderKeys[index])] : [],
        ),
      )
      await tx.done
    },
  }
}
