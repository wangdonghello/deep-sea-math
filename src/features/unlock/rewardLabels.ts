/**
 * `src/features/unlock/rewardLabels.ts` —— 奖励标识 → 给孩子看的展示名。
 *
 * 为什么需要这一层：`unlock-granted` / `session-completed` 事件里只有**标识**
 * （`quest-complete`、生物 id、区域 id），而解锁反馈（{@link UnlockOverlay}）
 * 与家长报告要展示的是名字。标识到名字的映射因此必须有一处单一出处。
 *
 * 但 `domain/reward/unlockRules.ts` 的展示名常量是模块私有的（`RewardGrant.label`
 * 只在求值那一刻存在，事件里并不落名）。这里按 `BADGE_IDS` 逐一给出对应文案，
 * 并由 `tests/features/unlock/rewardLabels.test.ts` 钉住「徽章id 与文案一一对应」
 * —— 将来 domain 新增一种徽章而这里漏配，测试立刻红，而不是让孩子看到一个
 * 光秃秃的 id。
 *
 * 生物与区域的名字**不在这里**：它们来自内容库（`CREATURE_BANK` / `ZONES`），
 * 那是内容的真相，不是文案的真相。
 */

import { CREATURE_BANK } from '@/data/content'
import { BADGE_IDS } from '@/domain/reward/unlockRules'
import type { RewardKind } from '@/domain/reward/unlockRules'

import { ZONES } from '@/features/home/zones'

/** 徽章 id → 展示名（与 `unlockRules` 的私有常量逐字对齐）。 */
const BADGE_LABELS: Readonly<Record<string, string>> = {
  'quest-complete': '整组完成徽章',
  'independent-mastery': '独立掌握徽章',
}

/** 生物 id → 物种名（未收录的 id 回退为"图鉴卡"，绝不泄露未收录内容）。 */
export function creatureLabel(creatureId: string): string {
  return CREATURE_BANK.creatures.find((creature) => creature.id === creatureId)?.name ?? '深海图鉴卡'
}

/** 区域 id → 区域名（未收录的 id 回退为"深海区域"）。 */
export function zoneLabel(zoneId: string): string {
  return ZONES.find((zone) => zone.id === zoneId)?.name ?? '深海区域'
}

/**
 * 取一条奖励的展示名。
 *
 * @param kind 发放通道（徽章 / 图鉴卡 / 区域）。
 * @param targetId 奖励标识（徽章 id、生物 id 或区域 id）。
 */
export function rewardLabel(kind: RewardKind, targetId: string): string {
  if (kind === 'creature') return creatureLabel(targetId)
  if (kind === 'zone') return zoneLabel(targetId)
  return BADGE_LABELS[targetId] ?? '徽章'
}

/** 已配置文案的徽章 id 集合（测试用它断言"没有漏配的徽章"）。 */
export function badgeLabels(): Readonly<Record<string, string>> {
  return BADGE_LABELS
}

/** 全部徽章 id（供测试与家长报告遍历）。 */
export function allBadgeIds(): readonly string[] {
  return BADGE_IDS
}
