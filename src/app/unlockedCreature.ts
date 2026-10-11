/**
 * `src/app/unlockedCreature.ts` —— 观察舱入口的解锁判定（Task 17）。
 *
 * `/observation/:id` 的唯一准入规则（spec `creature-bestiary` §观察舱）：只接受
 * **已解锁**的生物；未解锁一律打回图鉴，且 MUST NOT 泄露名称与学名。因此判定
 * 必须在路由守卫里完成——等视图渲染出来再藏字段，名称早就进了 DOM。
 *
 * 解锁状态取事件重放的 `bestiaryUnlock`（`creature:<id>` 键），不读
 * `bestiaryRepo` 的缓存：按 spec §投影可由事件重建，缓存只是性能优化，
 * 准入判定必须站在权威数据上。
 */

import { CREATURE_BANK } from '@/data/content'
import type { CreatureContent } from '@/data/content/schema'
import { replayProjections } from '@/domain/eventLog/replay'

import type { ProductionStores } from './productionStores'

/**
 * 解析一个已解锁的生物条目。
 *
 * @param stores 已装配的生产存储（只用到事件读能力）。
 * @param profileId 当前档案 id。
 * @param creatureId 路由参数 `:id`。
 * @returns 生物内容对象；**生物不存在或未解锁时返回 `null`**（调用方据此
 *   重定向回图鉴）。
 */
export async function findUnlockedCreature(
  stores: Pick<ProductionStores, 'quiz'>,
  profileId: string,
  creatureId: string,
): Promise<CreatureContent | null> {
  const events = await stores.quiz.listEvents(profileId)
  const unlocked = replayProjections(events, { profileId }).bestiaryUnlock
  if (unlocked[`creature:${creatureId}`] === undefined) return null
  return CREATURE_BANK.creatures.find((creature) => creature.id === creatureId) ?? null
}
