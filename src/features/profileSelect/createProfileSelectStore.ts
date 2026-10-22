/**
 * 把 Task 9 的 `ProfileRepo` 适配成档案选择所需的 `ProfileStore`。
 *
 * **这个文件为什么必须存在**：T9 的 `ProfileRepo` 只有 `save/get/list/remove`，
 * 没有 `verify()` —— 而这正是它该有的样子：PIN 的哈希与比对属于
 * `domain/crypto`（Task 2）的职责，仓储层只负责存取，不应懂凭据语义。
 * 因此「列出档案」与「校验 PIN」这两件事的拼接发生在**本功能的边界上**，
 * 而不是在仓储里长出一个 `verify`。
 *
 * 结构式依赖（不 import T9 文件）：下面只用 `get` / `list` 两个成员声明适配
 * 面。T9 的 `profileRepo` 拥有这两个方法及更多，结构上满足本接口，因此 T17
 * 装配时一行即可接线：
 * ```ts
 * import { profileRepo } from '@/data/repositories/profileRepo'
 * import { createProfileSelectStore } from '@/features/profileSelect/createProfileSelectStore'
 *
 * useProfileSelect({ store: createProfileSelectStore(profileRepo) })
 * ```
 * 之所以**不**直接 `import type { ProfileRepo }`：T11 与 T9 是并行开发的，
 * 直接 import 会让本 worktree 在 T9 合并前无法编译。用结构式最小面描述适配
 * 面，两边各自落地、各自编译，合并时也不会产生文件冲突。
 */
import type { Profile } from '@/domain/model/types'
import { verifyPin, type DigestFn } from '@/domain/crypto/hashPin'

import type { ProfileStore } from './types'

/** T9 档案仓储中本适配器真正用到的两个只读成员（`save` / `remove` 与此无关）。 */
export interface ProfileRepoForSelect {
  /** 列全部档案（档案选择页用，一次取回）。 */
  list(): Promise<Profile[]>
  /**
   * 按 ID 读档案；不存在时返回 `undefined`（T9 的约定：不抛异常）。
   *
   * 与 T9 的 `ProfileRepo.get` 签名逐字一致，含 `undefined` 而非 `null`。
   */
  get(id: string): Promise<Profile | undefined>
}

/** {@link createProfileSelectStore} 的可选注入。 */
export interface CreateProfileSelectStoreOptions {
  /**
   * 摘要算法注入。缺省走 `verifyPin` 的默认分支（Web Crypto）。
   *
   * 单测注入同步 SHA-256：jsdom 不提供 `crypto.subtle`。
   */
  digest?: DigestFn
}

/**
 * 用 T9 的仓储 + Task 2 的 `verifyPin` 组合出 `ProfileStore`。
 *
 * 两个安全相关的取舍：
 * 1. **`list()` 只返回 `ProfileSummary`**：`pinHash` 与 `salt` 被就地剥掉，
 *    不往上传递。哈希与盐一旦流出本模块，就可能被带进日志或被序列化到
 *    某个调试出口，而它们与 PIN 明文合起来等价于口令。
 * 2. **`verify()` 走 `get(id)` 而非 `list()`**：只读一条记录，不把全部档案的
 *    盐与哈希一次性拉进内存再挑选。同时「档案不存在」由 `get` 的
 *    `undefined` 表达，与「PIN 不匹配」合并为同一个 `false`。
 */
export function createProfileSelectStore(
  repo: ProfileRepoForSelect,
  options: CreateProfileSelectStoreOptions = {},
): ProfileStore {
  return {
    async list() {
      const rows = await repo.list()
      // 就地投影：只带展示所需字段，pinHash / salt 一律不出去。
      return rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        avatarId: row.avatarId,
        ...(row.grade === undefined ? {} : { grade: row.grade }),
        ...(row.themeId === undefined ? {} : { themeId: row.themeId }),
      }))
    },

    async verify(profileId, pin) {
      const profile = await repo.get(profileId)
      // 档案不存在与 PIN 不匹配对 UI 是同一种结果：都只说"再试一次"。
      if (profile === undefined) return false
      // digest 为 undefined 时 verifyPin 走默认注入（Web Crypto）。
      return verifyPin(pin, profile.salt, profile.pinHash, options.digest)
    },
  }
}
