import { describe, expect, it } from 'vitest'

import { buildQuestContext } from '@/app/questContext'
import { QUESTION_BANK } from '@/data/content'
import type { DomainEvent, SessionStartedEvent } from '@/domain/model/types'

/**
 * `src/app/questContext.ts` 的行为契约（T17 审查 follow-up：`?session=`）。
 *
 * 锁三件事：
 * 1. **深链题组真正生效**——`/quest?session=<id>` 优先打开该题组，参数不是
 *    摆设（首页「开始下潜」刷新后要回到同一组）；
 * 2. **归属校验**——题组 id 查不到、或属于别的档案时回落当日题组，一个随手
 *    改的 query 绝不能打开别人的题序；
 * 3. **重练优先**——错题本带题进来时与 `session` 参数互不干扰。
 */

const PROFILE_ID = 'p-quest-context'
const OTHER_PROFILE_ID = 'p-other'

/** 固定「现在」：UTC 2026-10-10 02:00。 */
const NOW = Date.UTC(2026, 9, 10, 2, 0, 0)

/** 题库前两题（题序断言只关心"是哪一题"，不关心题面）。 */
const [FIRST, SECOND] = QUESTION_BANK.questions

function sessionStarted(
  sessionId: string,
  questionIds: readonly string[],
  options: { profileId?: string; occurredAt?: number } = {},
): SessionStartedEvent {
  return {
    eventId: `ev-${sessionId}`,
    profileId: options.profileId ?? PROFILE_ID,
    occurredAt: options.occurredAt ?? NOW,
    type: 'session-started',
    sessionId,
    questionIds: [...questionIds],
    difficultyTrace: [1, 1, 1],
  }
}

/** 当日题组（索引先到者胜：就是它）。 */
function dailyEvents(): SessionStartedEvent[] {
  return [sessionStarted('s-daily', [FIRST.id])]
}

describe('buildQuestContext: /quest?session= 深链参数', () => {
  it('指定本档题组 id 时优先打开该题组', () => {
    const events: DomainEvent[] = [
      ...dailyEvents(),
      sessionStarted('s-second', [SECOND.id], { occurredAt: NOW + 1 }),
    ]

    const context = buildQuestContext(PROFILE_ID, events, NOW, { sessionId: 's-second' })

    expect(context.sessionId).toBe('s-second')
    expect(context.questions.map((question) => question.id)).toEqual([SECOND.id])
  })

  it('不传 sessionId 时仍按当日题组索引装配', () => {
    const context = buildQuestContext(PROFILE_ID, dailyEvents(), NOW)

    expect(context.sessionId).toBe('s-daily')
    expect(context.questions.map((question) => question.id)).toEqual([FIRST.id])
  })

  it('别档的题组 id 不采纳：回落当日题组', () => {
    const events: DomainEvent[] = [
      ...dailyEvents(),
      sessionStarted('s-other', [SECOND.id], { profileId: OTHER_PROFILE_ID }),
    ]

    const context = buildQuestContext(PROFILE_ID, events, NOW, { sessionId: 's-other' })

    expect(context.sessionId).toBe('s-daily')
    expect(context.questions.map((question) => question.id)).toEqual([FIRST.id])
  })

  it('查不到的题组 id 不采纳：回落当日题组', () => {
    const context = buildQuestContext(PROFILE_ID, dailyEvents(), NOW, { sessionId: 's-nope' })

    expect(context.sessionId).toBe('s-daily')
    expect(context.questions.map((question) => question.id)).toEqual([FIRST.id])
  })

  it('没有当日题组且深链查不到时 sessionId 为 null（守卫据此打回首页）', () => {
    const context = buildQuestContext(PROFILE_ID, [], NOW, { sessionId: 's-nope' })

    expect(context.sessionId).toBeNull()
    expect(context.questions).toEqual([])
  })

  it('重练优先于深链：错题本带题进来时忽略 session 参数', () => {
    const events: DomainEvent[] = [
      ...dailyEvents(),
      sessionStarted('s-second', [SECOND.id], { occurredAt: NOW + 1 }),
    ]

    const context = buildQuestContext(PROFILE_ID, events, NOW, {
      practiceIds: [FIRST.id],
      sessionId: 's-second',
    })

    expect(context.sessionId).toBe(`practice-${FIRST.id}`)
    expect(context.questions.map((question) => question.id)).toEqual([FIRST.id])
  })
})
