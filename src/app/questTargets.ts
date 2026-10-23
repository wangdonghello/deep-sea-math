/**
 * `src/app/questTargets.ts` —— 当日题组奖励目标的推导（装配层纯函数）。
 *
 * 为什么在装配层而不是 `domain/reward`：`grantRewards` 的 `creatureId` /
 * `zoneId` 由**调用方**决定（缺省就少发一条奖励通道），而 `session-started`
 * 事件本身不携带这两个标识。把推导放在装配层，是为了让「这一组做完解锁谁、
 * 下潜到哪一区」只有一个出处，且**不引入随机、不依赖运行期状态**——同一份
 * 输入反复推导必得同一目标（否则同一题组重进会换奖励目标，spec
 * §刷新页面不换题 就被绕过去了）。
 *
 * 两个口径都取内容事实，不写死任何 id：
 * 1. **生物**：题组内第一道带 `creatureRef` 的题目 —— 题目包装里的主角
 *    （`Question.creatureRef` 的语义）。题目是题库内容生物的唯一权威映射，
 *    比按深度区间猜更贴近课程设计；
 * 2. **区域**：深度顺序上第一个尚未解锁的区域（`ZONES` 的顺序即下潜顺序，
 *    见 `features/home/zones.ts`）。四区全部解锁后不再给区域奖励。
 */

import type { Question } from '@/domain/model/types'
import { CREATURE_BANK } from '@/data/content'

import type { ZoneConfig } from '@/features/home/zones'
import { ZONES } from '@/features/home/zones'
import { zonesForCreature } from '@/features/bestiary/zoneFilter'

/** 当日题组的奖励目标；缺省表示该通道本次不发奖励。 */
export interface QuestTargets {
  /** 完成后解锁的生物 id；本组题目没有主角时为 `undefined`。 */
  readonly creatureId?: string
  /** 完成后下潜到的区域 id；无待解锁区域时为 `undefined`。 */
  readonly zoneId?: string
}

/**
 * 题组对应的图鉴生物。
 *
 * 默认取题组内第一道带 `creatureRef` 的题目；若同时给了目标区域，优先选
 * 该区域里尚未解锁的物种，避免“解锁暮光区却发了一条深海鱼”这种区域与
 * 卡片错位。所有区域物种都已解锁时退回题目主角。
 */
export function deriveCreatureTarget(
  questions: readonly Question[],
  zone?: ZoneConfig,
  unlockedCreatureIds?: ReadonlySet<string>,
): string | undefined {
  const refs = questions.flatMap((question) => question.creatureRef === undefined ? [] : [question.creatureRef])
  if (zone !== undefined) {
    const zoneCreatures = CREATURE_BANK.creatures.filter((creature) => zonesForCreature(creature).some((candidate) => candidate.id === zone.id))
    const fromQuestions = zoneCreatures.find((creature) =>
      refs.includes(creature.id) && !(unlockedCreatureIds?.has(creature.id) ?? false),
    )
    if (fromQuestions !== undefined) return fromQuestions.id
    const fallback = zoneCreatures.find((creature) => !(unlockedCreatureIds?.has(creature.id) ?? false))
    if (fallback !== undefined) return fallback.id
  }
  return refs[0]
}

/** 深度顺序上第一个尚未解锁的区域。 */
export function deriveZoneTarget(unlockedZoneIds: ReadonlySet<string>): ZoneConfig | undefined {
  return ZONES.find((zone) => !unlockedZoneIds.has(zone.id))
}

/**
 * 由题组内容与解锁状态推导当日题组的奖励目标。
 *
 * @param questions 当日题组的题目（顺序与 `session-started.questionIds` 一致）。
 * @param unlockedZoneIds 已解锁的区域 id 集合（重放投影的 `zone:*` 解锁项）。
 */
export function deriveQuestTargets(
  questions: readonly Question[],
  unlockedZoneIds: ReadonlySet<string>,
  unlockedCreatureIds?: ReadonlySet<string>,
): QuestTargets {
  const zone = deriveZoneTarget(unlockedZoneIds)
  return {
    creatureId: deriveCreatureTarget(questions, zone, unlockedCreatureIds),
    zoneId: zone?.id,
  }
}
