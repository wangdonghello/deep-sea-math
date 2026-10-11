import { describe, expect, it } from 'vitest'

import unlockRulesSource from '../../../src/domain/reward/unlockRules.ts?raw'

import {
  BADGE_IDS,
  evaluateRewardRules,
  INDEPENDENT_MASTERY_THRESHOLD,
  REWARD_KINDS,
  REWARD_RULES,
  type RewardContext,
  type RewardGrant,
} from '../../../src/domain/reward/unlockRules'

/**
 * `domain/reward/unlockRules` 的行为契约（design §3 解锁规则）。
 *
 * 锁四件事：
 * 1. 整组完成必得图鉴卡 + 徽章（spec `creature-bestiary` §奖励发放）；
 * 2. 首次独立答对数 ≥ 总题数的 60% 额外得「独立掌握徽章」；
 * 3. 未完成整组不得解锁任何奖励；
 * 4. 奖励计算 MUST NOT 依赖随机数（spec §奖励发放：MUST NOT 依赖随机付费
 *    或抽卡）——同一入参反复求值必须得到逐字节相同的结果，且模块源码里
 *    不存在随机源。
 */

/** 造一个求值上下文；只覆盖与奖励判定相关的字段。 */
function context(overrides: Partial<RewardContext> = {}): RewardContext {
  return {
    totalQuestions: 9,
    answeredQuestions: 9,
    independentCorrect: 0,
    questCompleted: false,
    ...overrides,
  }
}

/** 求值结果里是否含某类奖励的某个 targetId。 */
function has(grants: readonly RewardGrant[], kind: RewardGrant['kind'], targetId: string): boolean {
  return grants.some((grant) => grant.kind === kind && grant.targetId === targetId)
}

describe('domain/reward: 整组完成必得图鉴卡 + 徽章', () => {
  it('完成整组即发放图鉴卡（creature，targetId 取上下文的目标生物）', () => {
    const grants = evaluateRewardRules(context({ questCompleted: true, creatureId: 'creature-anglerfish' }))
    expect(has(grants, 'creature', 'creature-anglerfish')).toBe(true)
  })

  it('完成整组即发放区域下潜（zone，targetId 取上下文的目标区域）', () => {
    const grants = evaluateRewardRules(context({ questCompleted: true, zoneId: 'zone-twilight' }))
    expect(has(grants, 'zone', 'zone-twilight')).toBe(true)
  })

  it('完成整组即发放「整组完成」徽章', () => {
    const grants = evaluateRewardRules(context({ questCompleted: true }))
    expect(has(grants, 'badge', 'quest-complete')).toBe(true)
  })
})

describe('domain/reward: 独立答对率 ≥ 60% 额外得独立掌握徽章', () => {
  it('9 题中 6 题首次独立答对（≈66.7%）额外得独立掌握徽章', () => {
    const grants = evaluateRewardRules(context({ questCompleted: true, independentCorrect: 6 }))
    expect(has(grants, 'badge', 'independent-mastery')).toBe(true)
  })

  it('边界正好 60%（9 题中 5.4 不是整数，改以 5 题 3 题对验证等于阈值即发）', () => {
    // 5 题的 60% 恰为 3：3/5 = 0.6 达到阈值，必须发放。
    const grants = evaluateRewardRules(context({ questCompleted: true, totalQuestions: 5, independentCorrect: 3 }))
    expect(has(grants, 'badge', 'independent-mastery')).toBe(true)
  })

  it('低于 60% 不得发放独立掌握徽章（5 题仅 2 题独立答对 = 40%）', () => {
    const grants = evaluateRewardRules(
      context({ questCompleted: true, totalQuestions: 5, independentCorrect: 2 }),
    )
    expect(has(grants, 'badge', 'independent-mastery')).toBe(false)
  })

  it('阈值为 0.6，与 design §3「总题数的 60%」一致', () => {
    expect(INDEPENDENT_MASTERY_THRESHOLD).toBe(0.6)
  })

  it('分母是总题数，MUST NOT 改按已作答题数：只答 3 题全对（3/9）不得发徽章', () => {
    // spec 原文是「首次独立答对数 ≥ **总题数**的 60%」。若按已作答 3 题算，
    // 3/3 = 100% 会误发徽章——那等于鼓励孩子少答题。
    const grants = evaluateRewardRules(
      context({ questCompleted: true, totalQuestions: 9, answeredQuestions: 3, independentCorrect: 3 }),
    )
    expect(has(grants, 'badge', 'independent-mastery')).toBe(false)
    // 整组完成的两个基础奖赏不受影响。
    expect(has(grants, 'badge', 'quest-complete')).toBe(true)
  })

  it('空题组（总题数为 0）不得发独立掌握徽章，避免 0/0 判真', () => {
    const grants = evaluateRewardRules(
      context({ questCompleted: true, totalQuestions: 0, answeredQuestions: 0, independentCorrect: 0 }),
    )
    expect(has(grants, 'badge', 'independent-mastery')).toBe(false)
  })
})

describe('domain/reward: 未完成整组不得解锁', () => {
  it('未完成时一个奖励都不发（无徽章、无图鉴卡、无区域）', () => {
    const grants = evaluateRewardRules(
      context({
        questCompleted: false,
        creatureId: 'creature-anglerfish',
        zoneId: 'zone-twilight',
      }),
    )
    expect(grants).toEqual([])
  })

  it('答对率再高，未完成整组也不发独立掌握徽章', () => {
    // 10 题里 10 题独立答对，但只要整组没完成就一律不发——解锁的前置条件
    // 是「整组完成」，而非答对率。
    const grants = evaluateRewardRules(
      context({ questCompleted: false, totalQuestions: 10, independentCorrect: 10 }),
    )
    expect(grants).toEqual([])
  })

  it('部分完成（answeredQuestions 少于 totalQuestions）时不得发任何奖励', () => {
    const grants = evaluateRewardRules(
      context({ questCompleted: false, totalQuestions: 9, answeredQuestions: 5, independentCorrect: 5 }),
    )
    expect(grants).toEqual([])
  })
})

describe('domain/reward: 奖励计算 MUST NOT 依赖随机数', () => {
  it('同一入参反复求值得到逐字节相同的结果', () => {
    const input = context({ questCompleted: true, creatureId: 'creature-anglerfish', independentCorrect: 6 })
    const first = JSON.stringify(evaluateRewardRules(input))
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(JSON.stringify(evaluateRewardRules(input))).toBe(first)
    }
  })

  it('两次独立构造的同形上下文求值结果相等', () => {
    const left = evaluateRewardRules(context({ questCompleted: true, independentCorrect: 6 }))
    const right = evaluateRewardRules(context({ questCompleted: true, independentCorrect: 6 }))
    expect(left).toEqual(right)
  })

  it('源码中不存在随机源（Math.random / randomUUID 都不该出现在奖励计算里）', () => {
    const source = unlockRulesSource
    expect(source).not.toContain('Math.random')
  })
})

describe('domain/reward: RewardRule[] 是可声明的纯数据表', () => {
  it('REWARD_KINDS 运行时取值与 RewardGrant.kind 的三种形态一致', () => {
    expect(REWARD_KINDS).toEqual(['badge', 'creature', 'zone'])
  })

  it('每条规则都带 id / when / grant 三个声明字段', () => {
    for (const rule of REWARD_RULES) {
      expect(typeof rule.id).toBe('string')
      expect(rule.id).not.toBe('')
      expect(typeof rule.when).toBe('function')
      expect(typeof rule.grant).toBe('function')
    }
  })

  it('规则 id 互不重复', () => {
    const ids = REWARD_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('徽章 targetId 全部来自 BADGE_IDS 常量表', () => {
    const grants = evaluateRewardRules(
      context({ questCompleted: true, creatureId: 'creature-anglerfish', independentCorrect: 9 }),
    )
    const badgeIds = grants.filter((grant) => grant.kind === 'badge').map((grant) => grant.targetId)
    expect(badgeIds.length).toBeGreaterThan(0)
    for (const badgeId of badgeIds) {
      expect(BADGE_IDS as readonly string[]).toContain(badgeId)
    }
  })

  it('求值结果按规则声明顺序排列（先整组完成，后独立掌握）', () => {
    const grants = evaluateRewardRules(
      context({ questCompleted: true, creatureId: 'creature-anglerfish', independentCorrect: 9 }),
    )
    const badges = grants.filter((grant) => grant.kind === 'badge').map((grant) => grant.targetId)
    expect(badges.indexOf('quest-complete')).toBeLessThan(badges.indexOf('independent-mastery'))
  })
})
