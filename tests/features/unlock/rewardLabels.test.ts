import { describe, expect, it } from 'vitest'

import { allBadgeIds, badgeLabels, creatureLabel, rewardLabel, zoneLabel } from '@/features/unlock/rewardLabels'

/**
 * `features/unlock/rewardLabels` 的契约（Task 17）。
 *
 * 只锁一件事：**每种徽章都有文案**。`domain/reward/unlockRules` 的展示名是模块
 * 私有常量、不落事件，因此这里按 `BADGE_IDS` 逐一配文案；将来 domain 新增
 * 一种徽章而这里漏配，本测试立刻红——否则孩子会在解锁浮层里看到一个光秃秃的
 * id（`quest-complete`），那既是文案缺失也是"内部标识泄露到 UI"。
 */

describe('unlock: rewardLabels', () => {
  it('每种徽章 id 都有展示文案', () => {
    const labels = badgeLabels()
    for (const badgeId of allBadgeIds()) {
      expect(labels[badgeId], `徽章 ${badgeId} 缺少文案`).toBeTypeOf('string')
      expect(labels[badgeId].length).toBeGreaterThan(0)
    }
  })

  it('徽章文案与 domain 规则表逐字对齐', () => {
    expect(rewardLabel('badge', 'quest-complete')).toBe('整组完成徽章')
    expect(rewardLabel('badge', 'independent-mastery')).toBe('独立掌握徽章')
  })

  it('生物与区域文案走内容库，不写死名字', () => {
    expect(creatureLabel('johnson-anglerfish')).toBe('约翰逊鮟鱇鱼')
    expect(zoneLabel('twilight')).toBe('暮光区')
  })

  it('未知标识回退为通用文案，绝不泄露 id', () => {
    expect(rewardLabel('badge', 'not-a-badge')).toBe('徽章')
    expect(creatureLabel('not-a-creature')).toBe('深海图鉴卡')
    expect(zoneLabel('not-a-zone')).toBe('深海区域')
  })
})
