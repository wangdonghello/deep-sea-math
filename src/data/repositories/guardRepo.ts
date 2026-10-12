import type { GuardRecord } from '../db'
import { STORE_NAMES } from '../db'
import type { DeepSeaDb } from '../db'

/**
 * `src/data/repositories/guardRepo.ts` —— 家长 PIN 的持久化读写。
 *
 * 家长 PIN 与**任何孩子档案无关**（它是家长区的门禁，不是某个档案的凭据），
 * 因此不能塞进 `settings`（其 keyPath 是 `profileId`，按档案一行）。单独一个
 * `guard` 对象库、**全场唯一一条**记录（`id` 固定 `'parent'`），`put` 天然覆盖。
 *
 * 安全底线（Constitution §1）：库里只有 `pinHash` 与 `salt`，**没有 PIN 明文**；
 * 本模块只透传这个模型，不做任何哈希/比对 —— 那是 `domain/crypto` 的职责。
 */

/** 家长 PIN 仓储接口（IndexedDB 态与内存态实现同一份契约）。 */
export interface GuardRepo {
  /**
   * 读取家长 PIN 记录。
   *
   * @returns 记录；从未设置过时返回 `undefined`（门禁页据此进入"设置家长
   *   密码"模式，而不是把"没设过"当成"密码错了"）。
   */
  load(): Promise<GuardRecord | undefined>

  /**
   * 覆盖写入家长 PIN 记录（首次设置与重置都走这一条路径）。
   *
   * @param record 必须自带 `id: 'parent'`（keyPath 就是它）。
   */
  save(record: GuardRecord): Promise<void>

  /**
   * 清除家长 PIN（家长重置用）。
   *
   * 幂等：本就没有记录时同样不抛错。
   */
  clear(): Promise<void>
}

/**
 * 基于 IndexedDB 的家长 PIN 仓储实现。
 *
 * @param db 已打开并完成迁移的数据库句柄。
 */
export function createGuardRepo(db: DeepSeaDb): GuardRepo {
  return {
    load() {
      return db.get(STORE_NAMES.guard, 'parent')
    },

    save(record) {
      return db.put(STORE_NAMES.guard, record).then(() => undefined)
    },

    clear() {
      return db.delete(STORE_NAMES.guard, 'parent')
    },
  }
}
