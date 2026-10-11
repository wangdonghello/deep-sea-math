import type { ProjectionRecord } from '../db'
import { STORE_NAMES } from '../db'
import type { DeepSeaDb } from '../db'

/**
 * `src/data/repositories/bestiaryRepo.ts` —— 图鉴解锁投影的缓存读写。
 *
 * **它不是图鉴的权威状态**：解锁事实来自事件日志（`unlock-granted` /
 * `session-completed` 的 `unlockedCreature`），本仓储存的是把
 * `replayProjections(events).bestiaryUnlock` 折叠出来的缓存。这样做的理由
 * 见 spec `offline-event-log` §投影可由事件重建：缓存可随时清空并从事件
 * 重建，`clear` 不丢任何进度。
 */

/** 图鉴投影缓存（与 {@link ProjectionRecord} 同形，按档案一行）。 */
export type BestiaryCache = ProjectionRecord

/** 图鉴仓储接口（IndexedDB 态与内存态实现同一份契约）。 */
export interface BestiaryRepo {
  /**
   * 读某档案的解锁缓存。
   *
   * @returns 缓存记录；该档案从未写过时返回 `undefined`（首启图鉴页据此走
   *   "重放重建"路径，而不是显示空图鉴）。
   */
  load(profileId: string): Promise<BestiaryCache | undefined>

  /**
   * 覆盖写入某档案的解锁缓存。
   *
   * 主键由记录自带的 `profileId` 决定（keyPath 就是它），因此不存在"用 A
   * 档案主键存 B 档案数据"的写法——调用方把自己构造的记录整体传进来即可。
   *
   * @param cache 必须自带 `profileId`。
   */
  save(cache: BestiaryCache): Promise<void>

  /**
   * 清空某档案的解锁缓存（可由事件重放重建）。
   *
   * @param profileId 档案 ID。
   */
  clear(profileId: string): Promise<void>
}

/**
 * 基于 IndexedDB 的图鉴仓储实现。
 *
 * @param db 已打开并完成迁移的数据库句柄。
 */
export function createBestiaryRepo(db: DeepSeaDb): BestiaryRepo {
  return {
    load(profileId) {
      return db.get(STORE_NAMES.projections, profileId)
    },

    save(cache) {
      return db
        .put(STORE_NAMES.projections, {
          ...cache,
          // 复制一份数组：调用方随后修改自己手里的列表不会顺着引用改到库里。
          unlockedCreatureIds: [...cache.unlockedCreatureIds],
        })
        .then(() => undefined)
    },

    clear(profileId) {
      return db.delete(STORE_NAMES.projections, profileId)
    },
  }
}
