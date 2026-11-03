import { describe, expect, it } from 'vitest'

import { BADGE_CATALOG } from '@/features/badges/badgeCatalog'
import { resolveBadgeSummary } from '@/features/badges/badgeProgress'
import type { DomainEvent, ThemeId } from '@/domain/model/types'

function completedSession(
  index: number,
  themeId: ThemeId = 'deep-sea',
  rewards: readonly string[] = ['quest-complete'],
): DomainEvent[] {
  const sessionId = `s-${themeId}-${index}`
  return [
    {
      eventId: `started-${sessionId}`, profileId: 'p1', occurredAt: index * 2,
      type: 'session-started', sessionId, questionIds: [], difficultyTrace: [], themeId,
    },
    {
      eventId: `completed-${sessionId}`, profileId: 'p1', occurredAt: index * 2 + 1,
      type: 'session-completed', sessionId, rewards: [...rewards],
    },
  ]
}

function practiceAnswer(eventId: string, sessionId: string, questionId: string): DomainEvent {
  return {
    eventId, profileId: 'p1', occurredAt: 100, type: 'answer-submitted',
    sessionId, questionId, submitted: '7', correct: true,
    usedHintLevel: 0, retryCount: 0, ms: 100,
  }
}

describe('resolveBadgeSummary', () => {
  it('没有事件时所有徽章都是未获得', () => {
    const summary = resolveBadgeSummary([], 'p1')
    expect(summary.total).toBe(BADGE_CATALOG.length)
    expect(summary.earned).toBe(0)
    for (const badge of BADGE_CATALOG) {
      expect(summary.states.get(badge.id)?.earned, badge.id).toBe(false)
    }
  })

  it('通关 3 次深海题组：整组徽章可累计，主题徽章按 1/3 关阈值点亮', () => {
    const events = [0, 1, 2].flatMap((index) => completedSession(index))
    const summary = resolveBadgeSummary(events, 'p1')

    expect(summary.states.get('quest-complete')).toMatchObject({ earned: true, count: 3 })
    expect(summary.states.get('deep-sea-twilight')?.earned).toBe(true)
    expect(summary.states.get('deep-sea-midnight')?.earned).toBe(true)
    // 第 6 关的深渊徽章还差 3 组题。
    expect(summary.states.get('deep-sea-abyss')?.earned).toBe(false)
  })

  it('恐龙主题的次数只算恐龙，不会点亮深海徽章', () => {
    const events = [0, 1].flatMap((index) => completedSession(index, 'dinosaur'))
    const summary = resolveBadgeSummary(events, 'p1')

    expect(summary.states.get('dino-fern')?.earned).toBe(true)
    expect(summary.states.get('dino-volcano')?.earned).toBe(true)
    expect(summary.states.get('dino-park')?.earned).toBe(false)
    expect(summary.states.get('deep-sea-twilight')?.earned).toBe(false)
  })

  it('正确率奖励：百发百中徽章按次数累计，可升到金级', () => {
    const events = [0, 1, 2].flatMap((index) =>
      completedSession(index, 'deep-sea', ['quest-complete', 'accuracy-perfect']),
    )
    const summary = resolveBadgeSummary(events, 'p1')

    expect(summary.states.get('accuracy-perfect')).toMatchObject({ earned: true, count: 3 })
  })

  it('坚持奖励：连续 3 天点亮“连续下潜”，断一天则不续上', () => {
    const day = 86_400_000
    const completed = (index: number, dayOffset: number): DomainEvent => ({
      eventId: `completed-${index}`, profileId: 'p1',
      occurredAt: Date.UTC(2026, 0, 1) + dayOffset * day,
      type: 'session-completed', sessionId: `s-${index}`, rewards: ['quest-complete'],
    })

    const threeDays = resolveBadgeSummary([
      completed(0, 0), completed(1, 1), completed(2, 2),
    ], 'p1')
    expect(threeDays.streak).toBe(3)
    expect(threeDays.states.get('streak-3')?.earned).toBe(true)
    expect(threeDays.states.get('streak-7')?.earned).toBe(false)

    const sevenDays = resolveBadgeSummary(
      Array.from({ length: 7 }, (_, index) => completed(index, index)),
      'p1',
    )
    expect(sevenDays.streak).toBe(7)
    expect(sevenDays.states.get('streak-7')?.earned).toBe(true)
    expect(sevenDays.states.get('streak-14')?.earned).toBe(false)

    const broken = resolveBadgeSummary([
      completed(0, 0), completed(1, 1), completed(2, 3),
    ], 'p1')
    expect(broken.streak).toBe(2)
    expect(broken.states.get('streak-3')?.earned).toBe(false)
  })

  it('做一次错题练习就能拿到“知错能改”徽章', () => {
    const summary = resolveBadgeSummary([practiceAnswer('a1', 'practice-q1', 'q1')], 'p1')
    expect(summary.states.get('mistake-practice-1')).toMatchObject({ earned: true, count: 1 })
    expect(summary.states.get('mistake-practice-10')?.earned).toBe(false)
  })

  it('累计独立改对 5 道题同时点亮修复徽章 I', () => {
    const events: DomainEvent[] = []
    for (let index = 0; index < 5; index += 1) {
      events.push(practiceAnswer(`a-${index}-1`, `practice-${index}-1`, `q${index}`))
      events.push(practiceAnswer(`a-${index}-2`, `practice-${index}-2`, `q${index}`))
    }
    const summary = resolveBadgeSummary(events, 'p1')
    expect(summary.states.get('mistake-fix-5')?.earned).toBe(true)
    expect(summary.states.get('mistake-practice-10')?.earned).toBe(true)
  })

  it('其他档案的事件不参与计算', () => {
    const events = completedSession(0).map((event) => ({ ...event, profileId: 'p2' }))
    const summary = resolveBadgeSummary(events, 'p1')
    expect(summary.earned).toBe(0)
  })
})
