import type { Settings } from '../../domain/model/types'
import { STORE_NAMES } from '../db'
import type { DeepSeaDb } from '../db'

/**
 * `src/data/repositories/settingsRepo.ts` —— 家长设置的持久化读写。
 *
 * 语义（spec `daily-math-quest` §每日题组生成）：默认 5 基础 / 3 应用 / 1
 * 探测；家长改设置后**自下一次生成题组起生效**，因此这里存的是"最近一次
 * 生效值"，存量题组进度不会被追溯修改。
 */

/** 默认设置：spec 的 5 基础 / 3 应用 / 1 探测，时长上限取 15 分钟。 */
export const DEFAULT_SETTINGS: Settings = {
  basicCount: 5,
  appliedCount: 3,
  probeCount: 1,
  maxMinutes: 15,
}

/** 设置仓储接口（IndexedDB 态与内存态实现同一份契约）。 */
export interface SettingsRepo {
  /**
   * 读某档案的设置。
   *
   * **没写过就返回默认值**而不是 `undefined`：组题（`buildDailyQuest`）需要
   * 一组确定的题量，让每个调用方各自兜一份默认值必然漂移——某天只改一处，
   * 新装用户和改了设置的用户就会走上不同的配比。
   *
   * @param profileId 档案 ID。
   */
  get(profileId: string): Promise<Settings>

  /**
   * 覆盖写入某档案的设置。
   *
   * @param profileId 档案 ID。
   * @param settings 家长设置。
   */
  save(profileId: string, settings: Settings): Promise<void>

  /**
   * 删除某档案的设置行。
   *
   * 区别于 {@link SettingsRepo.save} 写回默认值：删档后 `get()` 会因无记录而
   * 回落默认值，但库里不会残留一条属于已删档案的孤立行——"删档要清干净关联
   * 数据"（spec `child-profiles` §删除档案）包含这一条。
   *
   * @param profileId 档案 ID；档案不存在时无操作（IndexedDB delete 本就幂等）。
   */
  remove(profileId: string): Promise<void>
}

/**
 * 基于 IndexedDB 的设置仓储实现。
 *
 * @param db 已打开并完成迁移的数据库句柄。
 */
export function createSettingsRepo(db: DeepSeaDb): SettingsRepo {
  return {
    async get(profileId) {
      const record = await db.get(STORE_NAMES.settings, profileId)
      return record?.settings ?? { ...DEFAULT_SETTINGS }
    },

    save(profileId, settings) {
      // 每次返回新对象：调用方拿到的设置不会被后续写入别名污染。
      return db
        .put(STORE_NAMES.settings, { profileId, settings: { ...settings } })
        .then(() => undefined)
    },

    remove(profileId) {
      return db.delete(STORE_NAMES.settings, profileId).then(() => undefined)
    },
  }
}
