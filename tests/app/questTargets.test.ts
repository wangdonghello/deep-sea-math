import { describe, expect, it } from 'vitest'

import { buildQuestContext } from '@/app/questContext'
import { deriveCreatureTarget, deriveQuestTargets, deriveZoneTarget } from '@/app/questTargets'
import { CREATURE_BANK, QUESTION_BANK } from '@/data/content'
import type { Question } from '@/domain/model/types'
import type { DomainEvent, SessionStartedEvent } from '@/domain/model/types'

/**
 * `src/app/questTargets` / `src/app/questContext` 的契约（Task 17 装配层）。
 *
 * 锁四件事：
 * 1. **生物目标来自题目包装里的主角**（`Question.creatureRef`），不按深度猜；
 * 2. **区域目标是深度顺序上第一个未解锁区域**，全部解锁后不再给区域奖励
 *    （不重复发放同一通道，spec §答错绝不回退 的追加型语义）；
 * 3. **当日题组的题序唯一权威是 `session-started.questionIds`**——装配层
 *    重新抽题会打破"刷新页面不换题"；
 * 4. **重练带题号进答题页**且不进当日题组（错题本是孩子挑题，不是日历）。
 */

const PROFILE_ID = 'profile-targets'

/** 固定"今天"：与事件日期键对齐，避免依赖真实时钟。 */
const NOW = Date.UTC(2026, 9, 10, 2, 0, 0)

/** 取题库里第一道带 `creatureRef` 的题目（内容库的真实主角映射）。 */
function questionWithCreatureRef(): Question {
  const question = QUESTION_BANK.questions.find((candidate) => candidate.creatureRef !== undefined)
  if (question === undefined) throw new Error('题库里没有任何带 creatureRef 的题目')
  return question
}

/** 造一条当日 `session-started` 事件（题序即点名顺序）。 */
function sessionStarted(questionIds: readonly string[]): SessionStartedEvent {
  return {
    eventId: 'ev-start',
    profileId: PROFILE_ID,
    occurredAt: NOW,
    type: 'session-started',
    sessionId: 'session-today',
    questionIds: [...questionIds],
    difficultyTrace: [1, 1, 1],
  }
}

describe('app: questTargets', () => {
  it('生物目标取题组内第一道带 creatureRef 的题目', () => {
    const hero = questionWithCreatureRef()
    expect(deriveCreatureTarget([hero])).toBe(hero.creatureRef)
  })

  it('题目没有主角时不给图鉴卡（不凭空编生物）', () => {
    const plain = QUESTION_BANK.questions.find((question) => question.creatureRef === undefined)
    if (plain === undefined) return
    expect(deriveCreatureTarget([plain])).toBeUndefined()
    expect(deriveCreatureTarget([])).toBeUndefined()
  })

  it('区域目标是第一个未解锁区域，顺序按 ZONES 的下潜顺序', () => {
    expect(deriveZoneTarget(new Set())?.id).toBe('twilight')
    expect(deriveZoneTarget(new Set(['twilight']))?.id).toBe('midnight')
    expect(deriveZoneTarget(new Set(['twilight', 'midnight']))?.id).toBe('abyss')
    expect(deriveZoneTarget(new Set(['twilight', 'midnight', 'abyss']))?.id).toBe('hadal')
  })

  it('四区全部解锁后不再给区域奖励', () => {
    expect(deriveZoneTarget(new Set(['twilight', 'midnight', 'abyss', 'hadal']))).toBeUndefined()
    expect(deriveQuestTargets([], new Set(['twilight', 'midnight', 'abyss', 'hadal'])).zoneId)
      .toBeUndefined()
  })

  it('目标区域与题目主角不一致时，改发该区域里未解锁的鱼', () => {
    const deepSeaQuestion = QUESTION_BANK.questions.find((question) => question.creatureRef === 'giant-cusk-eel')
    expect(deepSeaQuestion).toBeDefined()
    const target = deriveQuestTargets([deepSeaQuestion!], new Set(), new Set())
    expect(target.zoneId).toBe('twilight')
    const targetCreature = CREATURE_BANK.creatures.find((creature) => creature.id === target.creatureId)
    expect(targetCreature).toBeDefined()
    expect(targetCreature!.depthRange.min).toBeLessThanOrEqual(1000)
    expect(target.creatureId).not.toBe('giant-cusk-eel')
  })

  it('当前区域里所有鱼都已解锁时不重复发同一张卡', () => {
    const allZoneCreatureIds = new Set(
      CREATURE_BANK.creatures
        .filter((creature) => creature.depthRange.min <= 1000 && creature.depthRange.max >= 200)
        .map((creature) => creature.id),
    )
    const target = deriveQuestTargets([], new Set(), allZoneCreatureIds)
    expect(target.creatureId).toBeUndefined()
  })

  it('纯函数：同一输入重复推导结果一致', () => {
    const hero = questionWithCreatureRef()
    const first = deriveQuestTargets([hero], new Set(['twilight']))
    const second = deriveQuestTargets([hero], new Set(['twilight']))
    expect(first).toEqual(second)
  })
})

describe('app: questContext', () => {
  it('当日题序照搬 session-started，不重新抽题', () => {
    const ids = QUESTION_BANK.questions.slice(2, 5).map((question) => question.id)
    const context = buildQuestContext(PROFILE_ID, [sessionStarted(ids)], NOW)

    expect(context.sessionId).toBe('session-today')
    expect(context.questions.map((question) => question.id)).toEqual(ids)
  })

  it('题库里没有的题号被跳过，不留空槽', () => {
    const real = QUESTION_BANK.questions[0].id
    const context = buildQuestContext(PROFILE_ID, [sessionStarted([real, 'ghost-id'])], NOW)

    expect(context.questions.map((question) => question.id)).toEqual([real])
  })

  it('相似题池收录本组题目引到的题', () => {
    const hero = questionWithCreatureRef()
    const context = buildQuestContext(PROFILE_ID, [sessionStarted([hero.id])], NOW)
    const expected = hero.similarQuestionIds.filter((id) =>
      QUESTION_BANK.questions.some((question) => question.id === id),
    )

    expect(context.similarQuestionPool.map((question) => question.id)).toEqual(expected)
  })

  it('没有当日题组时不给上下文（路由据此打回首页）', () => {
    expect(buildQuestContext(PROFILE_ID, [], NOW).sessionId).toBeNull()
  })

  it('错题重练带题号进答题页，且不进当日题组', () => {
    const target = QUESTION_BANK.questions[1]
    const events: DomainEvent[] = [sessionStarted([QUESTION_BANK.questions[0].id])]
    const context = buildQuestContext(PROFILE_ID, events, NOW, { practiceIds: [target.id] })

    expect(context.sessionId).toBe(`practice-${target.id}`)
    expect(context.questions.map((question) => question.id)).toEqual([target.id])
  })

  it('家长导入的自定义错题也能被重练题号取到', () => {
    const custom: Question = {
      id: 'custom-a',
      grade: 2,
      format: 'open',
      type: 'add-sub',
      difficulty: 1,
      category: 'basic',
      story: { title: '家长导入错题', body: '3+4=?' },
      requiresFiveStep: false,
      hints: ['读题'],
      answer: { value: 7 },
      similarQuestionIds: [],
      tags: ['imported'],
      sources: ['local-parent-import'],
    }
    const context = buildQuestContext(PROFILE_ID, [], NOW, {
      practiceIds: ['custom-a'],
      customQuestions: [custom],
      grade: 2,
    })

    expect(context.sessionId).toBe('practice-custom-a')
    expect(context.questions.map((question) => question.id)).toEqual(['custom-a'])
  })
})
