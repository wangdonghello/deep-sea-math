import type { Profile } from '../../domain/model/types'
import { normalizeProfile } from '../../domain/model/normalize'
import { STORE_NAMES } from '../db'
import type { DeepSeaDb } from '../db'

/**
 * `src/data/repositories/profileRepo.ts` —— 孩子档案的持久化读写。
 *
 * 安全底线（Constitution §1）：`Profile` 里只有 `pinHash` 与 `salt`，**没有
 * PIN 明文**，本模块也只透传这个模型——它没有任何"改 PIN"的入口，PIN 的
 * 变更由 Task 11/16 在 `hashPin` 之后整体覆盖写入档案记录。
 */

/** 档案仓储接口（IndexedDB 态与内存态实现同一份契约）。 */
export interface ProfileRepo {
  /**
   * 写入或覆盖档案。
   *
   * `profiles` 库以 `id` 为主键，因此同 `id` 二次 `save` 是覆盖而非新增：
   * 改昵称、换头像、重置 PIN 都走这一条路径，不会留下改名前的残影。
   *
   * @param profile 待写入档案。
   */
  save(profile: Profile): Promise<void>

  /**
   * 按 ID 读档案。
   *
   * @returns 档案；不存在时返回 `undefined`（调用方据此判断档案选择页要不要
   *   显示这张卡，不抛异常）。
   */
  get(id: string): Promise<Profile | undefined>

  /** 列全部档案（档案选择页用，一次取回）。 */
  list(): Promise<Profile[]>

  /**
   * 删除档案记录本身。
   *
   * 只删这一条档案；该档案的事件、设置与投影缓存由调用方按档案分别清理
   * （Task 16 删档案流程），本方法不越界代劳——否则"删档"的三段清理会在两处
   * 各写一遍，漏一段就是数据残留。
   *
   * @param id 档案 ID。
   */
  remove(id: string): Promise<void>
}

/**
 * 基于 IndexedDB 的档案仓储实现。
 *
 * @param db 已打开并完成迁移的数据库句柄。
 */
export function createProfileRepo(db: DeepSeaDb): ProfileRepo {
  return {
    save(profile) {
      return db.put(STORE_NAMES.profiles, profile).then(() => undefined)
    },

    get(id) {
      return db.get(STORE_NAMES.profiles, id).then((profile) => profile === undefined ? undefined : normalizeProfile(profile))
    },

    list() {
      // 一次 getAll 取回，不做逐条 get（档案数量是个位数，但仍保持同一习惯：
      // 批量读只在仓储层发生一次）。
      return db.getAll(STORE_NAMES.profiles).then((profiles) => profiles.map(normalizeProfile))
    },

    remove(id) {
      return db.delete(STORE_NAMES.profiles, id)
    },
  }
}
