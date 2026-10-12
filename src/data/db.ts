import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase, IDBPTransaction } from 'idb'

import type { Profile, Settings, DomainEvent } from '../domain/model/types'

import { createMemoryBestiaryRepo, createMemoryEventRepo, createMemoryGuardRepo, createMemoryProfileRepo, createMemorySettingsRepo } from './memoryFallback'
import { createBestiaryRepo } from './repositories/bestiaryRepo'
import { createEventRepo } from './repositories/eventRepo'
import { createGuardRepo } from './repositories/guardRepo'
import { createProfileRepo } from './repositories/profileRepo'
import { createSettingsRepo } from './repositories/settingsRepo'
import type { BestiaryRepo } from './repositories/bestiaryRepo'
import type { EventRepo } from './repositories/eventRepo'
import type { GuardRepo } from './repositories/guardRepo'
import type { ProfileRepo } from './repositories/profileRepo'
import type { SettingsRepo } from './repositories/settingsRepo'

/**
 * `src/data/db.ts` —— IndexedDB 连接、schema 定义、版本迁移与存储门面解析。
 *
 * 三个职责分层清楚：
 * 1. **schema 与迁移**（{@link STORE_NAMES} / {@link DeepSeaSchema} /
 *    {@link openDb}）：v1 schema 的六个对象库，以及从"旧版构建留下的库"升级
 *    时**保留既有事件**的迁移步骤（详见 {@link openDb} 的版本阶梯说明）。
 * 2. **存储门面解析**（{@link resolveStorage}）：探测 IndexedDB 可用性，
 *    不可用时返回内存态门面并置降级标记——spec `offline-event-log`
 *    §存储降级与家长提示要求家长区展示醒目提示，MUST NOT 静默丢弃数据。
 * 3. **仓储装配**：把六个仓储接口的 IndexedDB 实现装到门面上；实现本身在
 *    `repositories/`，内存态替换在 `memoryFallback.ts`，两边同接口可互换。
 *
 * 全部 API 都返回 Promise：读写不得阻塞渲染线程（Constitution Check
 * ·异步非阻塞）。
 */

/** 本地库名。同一 origin 下唯一；换名等于丢历史进度，不可随意改。 */
export const DB_NAME = 'deep-sea-math'

/**
 * 六个对象库的名字。
 *
 * 作为运行时真源导出：仓储与测试都引用它，而不是各自写字面量——`'events'`
 * 拼错一个字母会得到一个"查了却总是空"的库，这种静默失败很难排查。
 */
export const STORE_NAMES = {
  /** 事件日志：append-only，`eventId` 为主键，按 `profileId` 建索引。 */
  events: 'events',
  /** 档案：`id` 为主键。PIN 只以哈希形态存在（Constitution §1）。 */
  profiles: 'profiles',
  /** 图鉴解锁投影缓存：`profileId` 为主键，内容可由事件重放重建。 */
  projections: 'projections',
  /** 家长设置：`profileId` 为主键。 */
  settings: 'settings',
  /**
   * 家长 PIN：`id` 为主键，全场唯一一条（`'parent'`）。
   *
   * 与 `settings` 分开的理由：家长 PIN 是**家长区门禁**，不与任何孩子档案
   * 绑定，而 `settings` 的 keyPath 是 `profileId`（按档案一行），塞进去会被
   * 迫编造一个假档案 ID。
   */
  guard: 'guard',
  /**
   * 事件写入次序台账（`autoIncrement` 主键）。
   *
   * `events` 的主键是 `eventId`（UUID），它**不蕴含时间序**：`getAll` /
   * 索引返回的是字典序。而 `replayProjections` 要求"调用方传入的顺序就是
   * 写入顺序"，同毫秒的多条事件若按 UUID 序交给重放，重放结果就和答题当时
   * 的逐事件增量维护分叉。本台账把"第几条写入"显式落库，让同刻事件的次序
   * 可被稳定还原（见 `repositories/eventRepo.ts` 的双键排序）。
   */
  eventOrder: 'eventOrder',
} as const

/**
 * `eventOrder` 对象库的一条记录。
 *
 * 主键由 IndexedDB 的 `autoIncrement` 生成，**单调递增且删除不复用**——
 * 因此台账的物理顺序就是事件写入的顺序，删档之后再追加也不会让新旧事件
 * 的序号互相穿插。
 *
 * 这里冗余存 `profileId` 是为了能在一次 `getAll` 之后于内存里按档案过滤；
 * 若改成给 `profileId` 建索引再逐档案取，反而多一次游标查询。
 */
export interface EventOrderRecord {
  /** 该事件所属档案（过滤用，非键）。 */
  profileId: string
  /** 对应 `events` 库里的 `eventId`。 */
  eventId: string
}

/**
 * `settings` 对象库的一条记录。
 *
 * 外键 `profileId` 提到值对象顶层（而不是只在嵌套 `settings` 里），是为了让
 * keyPath 直接就是它 —— 每个档案一行，`put` 天然覆盖。
 */
export interface SettingsRecord {
  /** 档案 ID，与 `Profile.id` 对应。 */
  profileId: string
  /**
   * 该档案的家长设置（对应最近一次 `settings-updated` 事件的内容）。
   *
   * 注意 `replayProjections` 的六张投影表里**没有**设置——它不是派生状态，
   * 而是家长的配置输入。单独存一份是因为组题每次都要读它，为一条配置去
   * 重放全部事件是纯浪费。
   */
  settings: Settings
}

/**
 * `projections` 对象库的一条记录：图鉴解锁投影的可重建缓存。
 *
 * 依据 spec `offline-event-log` §投影可由事件重建——本记录**不是**权威状态，
 * `bestiaryRepo` 的清空与写入都只是缓存维护。其中 `unlockedCreatureIds`
 * 对应 `replayProjections(events).bestiaryUnlock` 里 `kind === 'creature'`
 * 的 `targetId` 集合（区域解锁不进这里：图鉴页只展示生物）。
 *
 * 这张表刻意只存"生物已解锁"这一个投影，而不是把六张投影一并缓存：
 * 掌握状态、错题本这些**每次答题都在变**，缓存它们等于多一份需要防漂移的
 * 真相；而图鉴解锁一旦发生就不再变化（解锁是追加型，见 design §3），缓存
 * 收益最大、漂移风险最小。
 */
export interface ProjectionRecord {
  /** 档案 ID。 */
  profileId: string
  /** 已解锁的生物 ID 列表（对应 `unlock-granted` 的 `targetId`）。 */
  unlockedCreatureIds: string[]
}

/**
 * `guard` 对象库的唯一一条记录：家长 PIN。
 *
 * 全场只有 `'parent'` 一条 —— 家长 PIN 是家长区的门禁，不与任何孩子档案绑定。
 */
export interface GuardRecord {
  /** 固定为 `'parent'`：家长 PIN 全场只有一条。 */
  id: 'parent'
  /** PIN 的 SHA-256 十六进制哈希，MUST NOT 存明文。 */
  pinHash: string
  /** 该 PIN 专属的加盐值。 */
  salt: string
}

/** 本应用的 IndexedDB schema（供 `idb` 的泛型推断出强类型仓储调用）。 */
export interface DeepSeaSchema extends DBSchema {
  events: {
    key: string
    value: DomainEvent
    indexes: { by_profile: string }
  }
  profiles: {
    key: string
    value: Profile
  }
  projections: {
    key: string
    value: ProjectionRecord
  }
  settings: {
    key: string
    value: SettingsRecord
  }
  eventOrder: {
    // autoIncrement 主键：IndexedDB 自增分配，删除不复用。
    key: number
    value: EventOrderRecord
  }
  guard: {
    key: string
    value: GuardRecord
  }
}

/** 打开后的强类型数据库句柄。 */
export type DeepSeaDb = IDBPDatabase<DeepSeaSchema>

/**
 * 当前 schema 的 IDB 数字版本号（= 4）。
 *
 * **表意版本 v1 / 数字版本 4**：本 schema 仍是应用的第一版 schema（v1），
 * 但数字版本号被推进过三次，三次都不是"表意版本升级"：
 * - **1 → 2**：引入四库 schema（`events` / `profiles` / `settings` /
 *   `projections`）。IndexedDB 规范与 `fake-indexeddb` 都不允许 version 0
 *   （`open(name, 0)` 直接抛 `TypeError`），所以"无 schema 的旧状态"在数字上
 *   只能落在 1；要让那次升级真的触发 `onupgradeneeded`，当前 schema 必须
 *   占用更高的数字版本。
 * - **2 → 3**：新增 `eventOrder` 台账（同毫秒事件的写入次序）。新增对象库
 *   只能通过版本跳变完成——若不跳版本，已装过的库里根本没有这个库，写入会
 *   一直 `NotFoundError`。
 * - **3 → 4**：新增 `guard` 库（家长 PIN，全场唯一一条）。同样是"新增对象库
 *   必须跳版本"——旧库里没有 `guard`，不跳版本的话门禁读不到、也写不进，
 *   表现为"家长 PIN 永远设置不上"。
 *
 * 若把当前 schema 停在任何早于"旧库实际版本"的数字上，`upgradeneeded` 不会
 * 触发，缺库/缺索引的状态会被永久保留，而它只在用户"装过旧版又升级"时出现，
 * 本地开发永远碰不到。
 */
export const DB_VERSION = 4

/**
 * 把库升级到当前 schema。
 *
 * 每一步都先 `contains` 判断再创建，因为两条真实升级路径的状态不同：
 * - **全新安装**（此前无库）：六个库一次建齐；
 * - **旧版库**（`LEGACY_VERSION`，只有一个 `events` 库）：`events` 已有
 *   内容，**绝不能重建**（重建等于清空历史进度），只补其余库与
 *   `by_profile` 索引——`createIndex` 只是给存量行补一份键值映射，
 *   不触碰行数据本身。
 *
 * 注意「已是当前版本的库再次打开」**不会触发本函数**：IndexedDB 只在版本号
 * 变化时派发 `upgradeneeded`，reopen 无副作用是"版本号没变"的结果，不是这些
 * `contains` 判断的功劳。把这些判断理解成"幂等开关"会看错它们真正在防的
 * 东西——它们防的是"库已在、别重建"。
 *
 * @param db 升级事务中的数据库句柄。
 * @param transaction 升级事务（`idb` `upgrade` 回调的第四个参数）。
 */
function applyMigrations(
  db: DeepSeaDb,
  transaction: IDBPTransaction<
    DeepSeaSchema,
    ArrayLike<'events' | 'profiles' | 'projections' | 'settings' | 'eventOrder' | 'guard'>,
    'versionchange'
  >,
): void {
  if (!db.objectStoreNames.contains(STORE_NAMES.events)) {
    // keyPath 取 `eventId`：仓储层据此做主键幂等（同一 eventId 重复 put 覆盖）。
    db.createObjectStore(STORE_NAMES.events, { keyPath: 'eventId' })
  }

  // 档案索引：`listByProfile` 靠它一次取回某档案全量事件（不在循环里逐条查）。
  const events = transaction.objectStore(STORE_NAMES.events)
  if (!events.indexNames.contains('by_profile')) {
    events.createIndex('by_profile', 'profileId', { unique: false })
  }

  if (!db.objectStoreNames.contains(STORE_NAMES.profiles)) {
    db.createObjectStore(STORE_NAMES.profiles, { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains(STORE_NAMES.settings)) {
    db.createObjectStore(STORE_NAMES.settings, { keyPath: 'profileId' })
  }
  if (!db.objectStoreNames.contains(STORE_NAMES.projections)) {
    db.createObjectStore(STORE_NAMES.projections, { keyPath: 'profileId' })
  }

  // 写入次序台账：不指定 keyPath，靠 autoIncrement 自增分配主键。
  if (!db.objectStoreNames.contains(STORE_NAMES.eventOrder)) {
    db.createObjectStore(STORE_NAMES.eventOrder, { autoIncrement: true })
  }

  // 家长 PIN：keyPath 取 `id`（固定 `'parent'`），全场唯一一条，`put` 天然覆盖。
  if (!db.objectStoreNames.contains(STORE_NAMES.guard)) {
    db.createObjectStore(STORE_NAMES.guard, { keyPath: 'id' })
  }
}

/**
 * `blocked` 之后最长等待多久就放弃打开（毫秒）。
 *
 * 只在打不开时才有意义：另一个标签页持有旧版本连接且迟迟不关时，
 * `indexedDB.open` 既不成功也不失败——无限挂着比明确失败更糟（界面永远
 * 转圈，而数据本可以走内存态继续用）。给孩子用的手机浏览器多开标签是真实
 * 场景，因此这个上限是**功能**不是补丁。
 */
export const OPEN_BLOCKED_TIMEOUT_MS = 3000

/**
 * 打开本地数据库，必要时执行版本迁移。
 *
 * 两类失败都往外抛，由 `resolveStorage` 统一捕获并降级：
 * 1. `open` 直接失败（隐私模式、存储超限、用户拒绝）；
 * 2. `blocked` 后等待超过 {@link OPEN_BLOCKED_TIMEOUT_MS}（别的标签页
 *    攥着旧版本连接不放手）。
 *
 * 为什么不把"blocked"本身当失败：按规范，别的连接关闭后升级会继续进行、
 * 最终仍能成功——一 blocked 就降级会把正常的多标签升级误判成存储不可用。
 * 所以这里只设等待上限，超时才算失败。
 *
 * @param blockedTimeoutMs {@link OPEN_BLOCKED_TIMEOUT_MS} 的可覆盖值，供测试
 *   用很小的上限验证超时路径，不必真等默认时长。
 * @returns 已升级到当前 schema 的数据库句柄。
 */
export function openDb(blockedTimeoutMs: number = OPEN_BLOCKED_TIMEOUT_MS): Promise<DeepSeaDb> {
  let failBlocked: ((error: Error) => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const opening = openDB<DeepSeaSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      applyMigrations(db, transaction)
    },
    blocked() {
      timer = setTimeout(() => {
        failBlocked?.(
          new Error(
            `IndexedDB 打开被阻塞：另一个标签页仍持有旧版本连接，等待 ${blockedTimeoutMs}ms 仍未释放`,
          ),
        )
        // 放弃之后底层那个 open 请求可能还会成功（旧标签页终于关了）。
        // 必须把迟到的连接关掉：没人持有它，它会一直占着库，让后续的
        // deleteDatabase 与版本升级全部被 blocked。
        void opening.then((db) => db.close()).catch(() => undefined)
      }, blockedTimeoutMs)
    },
  })

  const blockedGate = new Promise<never>((_resolve, reject) => {
    failBlocked = reject
  })

  // 无论最终成功还是失败，都要清掉等待定时器，否则它会一直被挂到进程结束。
  // `.finally()` 会派生出一个新 promise：原 promise 失败时它同样失败，若没人
  // 接就是 unhandled rejection（原 promise 的失败由下面的 race 负责接）。
  opening
    .finally(() => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    })
    .catch(() => undefined)

  return Promise.race([opening, blockedGate])
}

/**
 * 存储门面：上层（features / views）唯一触碰存储的入口。
 *
 * 只暴露类型 + 四个仓储 + 降级标记，**不暴露 `idb` 或 IndexedDB 的任何
 * 类型**——这样上层代码不用关心背后是库还是内存， Task 16 的警示条也只需读
 * `degraded` / `degradedReason` 两个字段。
 */
export interface StorageFacade {
  /** 当前存储介质。 */
  readonly kind: 'indexeddb' | 'memory'
  /** 是否已降级（家长区警示条的判据）。 */
  readonly degraded: boolean
  /** 降级原因；未降级为 `null`。MUST NOT 为空却降级（静默降级违反 spec）。 */
  readonly degradedReason: string | null
  /** 档案仓储。 */
  readonly profiles: ProfileRepo
  /** 事件日志仓储。 */
  readonly events: EventRepo
  /** 设置仓储。 */
  readonly settings: SettingsRepo
  /** 图鉴投影缓存仓储。 */
  readonly bestiary: BestiaryRepo
  /** 家长 PIN 仓储（家长区门禁）。 */
  readonly guard: GuardRepo
  /** 释放底层资源（IndexedDB 连接 / 无操作）。 */
  close(): Promise<void>
}

/** 把未知异常收敛成一句可读原因（不泄露堆栈，也不吞掉原文）。 */
function degradedReasonFrom(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message === '' ? 'IndexedDB 打开失败' : message
}

/**
 * 解析当前可用的存储门面。
 *
 * 探测策略（spec §存储降级与家长提示；design §5）：
 * 1. 正常打开成功 → IndexedDB 态门面，`degraded = false`；
 * 2. `indexedDB` 缺失、`open` 同步抛错（隐私模式常见表现）或打开失败
 *    （error 事件：存储超限 / 用户拒绝）→ 内存态门面，`degraded = true`
 *    且 `degradedReason` 带上具体原因。**不缓存探测结论**：家长退出隐私
 *    模式后再次调用即可回到 IndexedDB 态（spec §退出隐私模式后恢复）。
 *
 * 降级不等于丢数据：内存态在本会话内完整可用，家长区据此提示"进度不会被
 * 保存，请退出隐私模式"。
 *
 * @returns 存储门面；永不因存储不可用而 reject。
 */
export async function resolveStorage(): Promise<StorageFacade> {
  try {
    const db = await openDb()
    return {
      kind: 'indexeddb',
      degraded: false,
      degradedReason: null,
      profiles: createProfileRepo(db),
      events: createEventRepo(db),
      settings: createSettingsRepo(db),
      bestiary: createBestiaryRepo(db),
      guard: createGuardRepo(db),
      close: async () => {
        db.close()
      },
    }
  } catch (error) {
    return {
      kind: 'memory',
      degraded: true,
      degradedReason: degradedReasonFrom(error),
      profiles: createMemoryProfileRepo(),
      events: createMemoryEventRepo(),
      settings: createMemorySettingsRepo(),
      bestiary: createMemoryBestiaryRepo(),
      guard: createMemoryGuardRepo(),
      close: async () => undefined,
    }
  }
}
