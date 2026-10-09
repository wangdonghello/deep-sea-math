import { describe, expect, it } from 'vitest'

import type { Difficulty, DomainEvent, Question, QuestCategory, Settings } from '../../../src/domain/model/types'
import { createQuestion } from '../../../src/domain/model/types'
import { buildDailyQuest } from '../../../src/domain/quiz/buildDailyQuest'

/**
 * `domain/quiz/buildDailyQuest` 的行为契约。
 *
 * 锁 spec「每日题组生成」的四条硬规则：默认 5 基础 / 3 应用 / 1 探测共 9 题、
 * 已独立掌握的题被排除、池不足时允许重复（`repeatCount > 0`）、以及**确定性**
 * （注入固定 `idGenerator` 与 `clock` 后两次调用结果完全一致）。
 *
 * 另锁两条实现约定：按 `category` 切池而非 design §3 原文的 `type='probe'`,
 * 以及题序为「基础 → 应用 → 探测」槽位顺序、槽位内按 `(difficulty, id)` 升序。
 */

/** 固定时钟，两次调用的返回值完全相同才能证明确定性不依赖隐式时间。 */
const FIXED_NOW = 1_700_000_000_000

/** 固定 ID 发生器：每次调用返回同一个 sessionId。 */
const FIXED_ID = 'session-fixed-1'
const fixedIdGenerator = () => FIXED_ID

/** 固定时钟注入。 */
const fixedClock = () => FIXED_NOW

/** 默认设置 5 基础 / 3 应用 / 1 探测（spec 默认值）。 */
function defaultSettings(): Settings {
  return { basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 }
}

/**
 * 造一道题的最小输入。
 *
 * `category` 与 `difficulty` 是组题的唯二输入维度，`type` 刻意给一个与探测题
 * 相关的真实题型（`unknown-relation`）——用来证明探测题是按 `category` 而不是
 * 按 `type='probe'` 选中的（六类题型里根本没有 `probe`）。
 */
function question(
  id: string,
  category: QuestCategory,
  difficulty: Difficulty,
  type: Question['type'] = 'add-sub',
): Question {
  return createQuestion({
    id,
    type,
    difficulty,
    category,
    story: { title: `${id} 任务`, body: '深海探险需要你的计算。' },
    hints: ['审题', '已知未知', '数量关系', '列算式', '看示例'],
    answer: { value: 6, unit: '颗' },
    tags: [`difficulty-${difficulty}`],
    sources: ['https://example.com/curriculum'],
  })
}

/**
 * 造一个 60 题的池：每个 category × difficulty 组合各 5 题。
 *
 * 60 题 = 3 category × 3 difficulty × 5 题/组合，保证默认 5/3/1 下每类
 * 都有足够题量，且每类都有三档难度可供 clamp 与回落测试。
 */
function buildPool(): Question[] {
  const pool: Question[] = []
  for (const category of ['basic', 'applied', 'probe'] as const) {
    for (const difficulty of [1, 2, 3] as const) {
      for (let index = 0; index < 5; index += 1) {
        pool.push(question(`${category}-d${difficulty}-${index}`, category, difficulty))
      }
    }
  }
  return pool
}

describe('domain/quiz: buildDailyQuest — 题量与题序', () => {
  it('给定 60 题池与 settings(5/3/1)，返回 9 题', () => {
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.questionIds).toHaveLength(9)
    expect(quest.session.id).toBe(FIXED_ID)
    expect(quest.session.startedAt).toBe(FIXED_NOW)
  })

  it('按 category 切池：5 基础 + 3 应用 + 1 探测', () => {
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    // 题序按槽位分组数出来，而不是靠 id 前缀猜：探测题即使 id 不含 probe
    // 也必须因为 category='probe' 而排在最后（见下面一条差异测试）。
    const pools = buildPool()
    const byId = new Map(pools.map((item) => [item.id, item]))
    const categories = quest.questionIds.map((id) => byId.get(id)?.category)

    expect(categories.filter((item) => item === 'basic')).toHaveLength(5)
    expect(categories.filter((item) => item === 'applied')).toHaveLength(3)
    expect(categories.filter((item) => item === 'probe')).toHaveLength(1)
    expect(categories).toEqual([
      'basic',
      'basic',
      'basic',
      'basic',
      'basic',
      'applied',
      'applied',
      'applied',
      'probe',
    ])
  })

  it('题序为「基础×N → 应用×M → 探测×1」，槽位内按 (difficulty, id) 升序', () => {
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    // 默认档位 1（无历史）：三类都应取 1 档题，槽位内按 id 升序。
    // id 形如 `basic-d1-0..4`，字典序即数字序（0..4 单位数）。
    expect(quest.questionIds).toEqual([
      'basic-d1-0',
      'basic-d1-1',
      'basic-d1-2',
      'basic-d1-3',
      'basic-d1-4',
      'applied-d1-0',
      'applied-d1-1',
      'applied-d1-2',
      'probe-d1-0',
    ])
  })

  it('探测题按 category 选，不按 type="probe"（design §3 与本模型的差异）', () => {
    // 六类题型里没有 'probe'：若实现按 type='probe' 取题，探测题永远取不到，
    // 题组会少最后一道高潮题。这里让探测题挂一个普通题型 unknown-relation。
    const pool = [
      question('a-1', 'basic', 1),
      question('b-1', 'applied', 1, 'two-step-app'),
      question('p-1', 'probe', 1, 'unknown-relation'),
    ]

    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool,
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.questionIds).toContain('p-1')
    expect(quest.questionIds[quest.questionIds.length - 1]).toBe('p-1')
  })

})

describe('domain/quiz: buildDailyQuest — 难度档位', () => {
  it('无历史时档位为 1，difficultyTrace 记录该档', () => {
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    // trace 按槽位顺序（基础→应用→探测）各记一个生效档；无回落时三者相同。
    expect(quest.session.difficultyTrace).toEqual([1, 1, 1])
  })

  it('连续 3 次独立答对后升到 2 档取题', () => {
    const events = [0, 1, 2].map((index) => ({
      eventId: `e-${index}`,
      profileId: 'p-1',
      occurredAt: FIXED_NOW,
      type: 'answer-submitted' as const,
      sessionId: 's-old',
      questionId: `q-${index}`,
      submitted: '6',
      correct: true,
      usedHintLevel: 0,
      retryCount: 0,
      ms: 900,
    }))

    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events, now: FIXED_NOW },
      pool: buildPool(),
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.session.difficultyTrace).toEqual([2, 2, 2])
    expect(quest.questionIds.slice(0, 5)).toEqual([
      'basic-d2-0',
      'basic-d2-1',
      'basic-d2-2',
      'basic-d2-3',
      'basic-d2-4',
    ])
  })
})

describe('domain/quiz: buildDailyQuest — 排除已掌握与重复', () => {
  it('已独立掌握的题被排除，其余按排序键补齐', () => {
    // 基础池给 10 道 1 档题：排除 2 道后仍剩 8 道（≥ 5），足以在不换档、
    // 不重复的前提下验证「排除」这一条规则本身。
    const pool = [
      ...Array.from({ length: 10 }, (_, index) => question(`basic-d1-${index}`, 'basic', 1)),
      ...buildPool().filter((item) => item.category !== 'basic'),
    ]

    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool,
      masteryByQuestion: {
        'basic-d1-0': { level: 'independent', independentStreak: 1 },
        'basic-d1-1': { level: 'stable', independentStreak: 3 },
      },
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.questionIds).not.toContain('basic-d1-0')
    expect(quest.questionIds).not.toContain('basic-d1-1')
    // 排除 2 题后从剩余 8 题里按 (difficulty, id) 升序取前 5 道。
    expect(quest.questionIds.slice(0, 5)).toEqual([
      'basic-d1-2',
      'basic-d1-3',
      'basic-d1-4',
      'basic-d1-5',
      'basic-d1-6',
    ])
    // 剩余题量充足：不重复、不换档、不产生回落事件。
    expect(quest.repeatCount).toBe(0)
    expect(quest.session.difficultyTrace).toEqual([1, 1, 1])
    expect(quest.fallbackEvents).toEqual([])
  })

  it('已掌握题把该档余量压到不足所需题数时，换到能凑够的相邻档', () => {
    // 1 档基础题原有 5 道，2 道已掌握 → 只剩 3 道（< 5 个基础槽位）。
    // spec「高档位题量不足回落」判据是「不足**所需题数**」：此时从相邻档
    // 补齐，而不是把 3 道题重复着填满 5 个槽位（孩子会连做 5 遍同类题）。
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
      masteryByQuestion: {
        'basic-d1-0': { level: 'independent', independentStreak: 1 },
        'basic-d1-1': { level: 'stable', independentStreak: 3 },
      },
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.questionIds).not.toContain('basic-d1-0')
    expect(quest.questionIds).not.toContain('basic-d1-1')
    expect(quest.questionIds.slice(0, 5)).toEqual([
      'basic-d2-0',
      'basic-d2-1',
      'basic-d2-2',
      'basic-d2-3',
      'basic-d2-4',
    ])
    expect(quest.repeatCount).toBe(0)
    expect(quest.fallbackEvents).toHaveLength(1)
    expect(quest.fallbackEvents[0].category).toBe('basic')
    expect(quest.fallbackEvents[0].requestedDifficulty).toBe(1)
    expect(quest.fallbackEvents[0].actualDifficulty).toBe(2)
  })

  it('提示后掌握（hinted）与未掌握的题仍可进入题组', () => {
    // hinted 说明孩子还需要提示——正是要再练的题，排除它会把最需要练习的
    // 题藏起来，与规格「不重复已答对的题」只针对 独立/稳定掌握 相悖。
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
      masteryByQuestion: {
        'basic-d1-0': { level: 'hinted', independentStreak: 0 },
        'basic-d1-1': { level: 'unmastered', independentStreak: 0 },
      },
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.questionIds).toContain('basic-d1-0')
    expect(quest.questionIds).toContain('basic-d1-1')
    expect(quest.repeatCount).toBe(0)
  })

  it('池不足时 repeatCount > 0', () => {
    // 基础题只有 2 道可用，却要取 5 个基础槽位 → 重复 3 次。
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: [question('b-0', 'basic', 1), question('b-1', 'basic', 1)],
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.repeatCount).toBeGreaterThan(0)
    expect(quest.questionIds.filter((id) => id === 'b-0' || id === 'b-1')).toHaveLength(5)
  })

  it('池完全枯竭时按固定顺序循环取用，不随机、不报错', () => {
    // 只有 1 道基础题却要 5 个基础槽位：重复 4 次，且顺序确定。
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: [question('only-basic', 'basic', 1)],
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.questionIds.slice(0, 5)).toEqual(Array(5).fill('only-basic'))
    expect(quest.repeatCount).toBe(4)
  })

  it('某类整个池子为空时跳过该槽位，不编题也不借题', () => {
    // 题库里只有基础题：应用与探测槽位无题可取。宁可得一个 5 题的短题组，
    // 也不能把基础题塞进应用槽位——那会让「5 基础 / 3 应用」的口径失真，
    // 家长报告里的题量统计失去意义。
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: [question('b-0', 'basic', 1), question('b-1', 'basic', 1)],
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.questionIds).toEqual(['b-0', 'b-1', 'b-0', 'b-1', 'b-0'])
    expect(quest.questionIds).toHaveLength(5)
  })
})

describe('domain/quiz: buildDailyQuest — 确定性', () => {
  /** 组题入参工厂：每次调用产出结构等价的新对象，避免共享引用造成的假确定性。 */
  function args(pool: Question[]) {
    return {
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [] as DomainEvent[], now: FIXED_NOW },
      pool,
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    }
  }

  it('注入固定 clock 与 idGenerator 后，两次调用结果完全一致', () => {
    const first = buildDailyQuest(args(buildPool()))
    const second = buildDailyQuest(args(buildPool()))

    // 整对象深比较：questionIds、session、repeatCount、difficultyTrace
    // 全部一致才算锁定，只比题序会漏掉 sessionId / startedAt 的漂移。
    expect(second).toEqual(first)
  })

  it('打乱 pool 传入顺序，结果仍然一致（排序键脱离插入顺序）', () => {
    const pool = buildPool()
    const shuffled = [...pool].reverse()

    const fromOrdered = buildDailyQuest(args(pool))
    const fromShuffled = buildDailyQuest(args(shuffled))

    expect(fromShuffled).toEqual(fromOrdered)
  })

  it('产出的 session-started 事件与 session 内容一致', () => {
    const quest = buildDailyQuest(args(buildPool()))

    // 这个事件是 Task 6 落库的入口，字段必须与 session 对齐，否则重放出来的
    // 题组与生成时不一致——「刷新不换题」就断了。
    expect(quest.sessionStartedEvent.type).toBe('session-started')
    expect(quest.sessionStartedEvent.sessionId).toBe(quest.session.id)
    expect(quest.sessionStartedEvent.questionIds).toEqual(quest.session.questionIds)
    expect(quest.sessionStartedEvent.difficultyTrace).toEqual(quest.session.difficultyTrace)
    expect(quest.sessionStartedEvent.profileId).toBe('p-1')
    expect(quest.sessionStartedEvent.occurredAt).toBe(FIXED_NOW)
  })

  it('session.questionIds 是返回数组的副本，改写题序不反写会话', () => {
    const quest = buildDailyQuest(args(buildPool()))

    quest.questionIds.push('injected')

    expect(quest.session.questionIds).not.toContain('injected')
    expect(quest.session.questionIds).toHaveLength(9)
  })

  it('不注入 clock / idGenerator 时走默认实现，产出合法的 session', () => {
    // 默认路径是生产形态：clock 回落 Date.now、idGenerator 回落 randomUUID。
    // 这条用例保证两个默认值在 Node 环境下真的可用（而不是只在注释里存在）。
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
    })

    expect(typeof quest.session.startedAt).toBe('number')
    expect(Number.isFinite(quest.session.startedAt)).toBe(true)
    expect(quest.session.id).not.toBe('')
    expect(quest.sessionStartedEvent.eventId).not.toBe('')
    // 题序与注入时完全一致：默认注入只影响 id/时间，不影响选题。
    const withInjection = buildDailyQuest(args(buildPool()))
    expect(quest.questionIds).toEqual(withInjection.questionIds)
  })
})

describe('domain/quiz: buildDailyQuest — 档位回落', () => {
  it('目标档题量不足时回落相邻档，并产出 difficulty-fallback 事件', () => {
    // 2 档基础题只剩 1 道（要取 5 个基础槽位），1 档有 5 道 → 基础回落到 1 档；
    // 应用题与探测题的 2 档题量充足，不回落。
    const pool = [...buildPool(), question('basic-d2-scarce', 'basic', 2)]
    const scarce = pool.filter((item) => !(item.category === 'basic' && item.difficulty === 2 && item.id !== 'basic-d2-scarce'))

    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW, baseDifficulty: 2 },
      pool: scarce,
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    // trace 按槽位记生效档：基础回落 2→1，应用题与探测题照原档。
    expect(quest.session.difficultyTrace).toEqual([1, 2, 2])
    expect(quest.questionIds).not.toContain('basic-d2-scarce')
    expect(quest.repeatCount).toBe(0)

    expect(quest.fallbackEvents).toHaveLength(1)
    const [fallback] = quest.fallbackEvents
    expect(fallback.type).toBe('difficulty-fallback')
    expect(fallback.requestedDifficulty).toBe(2)
    expect(fallback.actualDifficulty).toBe(1)
    expect(fallback.category).toBe('basic')
    expect(fallback.reason).toContain('2 档')
    expect(fallback.reason).toContain('1 档')
  })

  it('回落事件挂上 sessionId，刷新后能追溯到是哪一组', () => {
    const pool = buildPool().filter((item) => !(item.category === 'probe' && item.difficulty === 1))

    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW, baseDifficulty: 1 },
      pool,
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    // 1 档探测题全被抽走 → 探测槽位回落到 2 档，事件必须带本次 sessionId。
    expect(quest.fallbackEvents).toHaveLength(1)
    expect(quest.fallbackEvents[0].sessionId).toBe(FIXED_ID)
    expect(quest.fallbackEvents[0].category).toBe('probe')
    expect(quest.questionIds[quest.questionIds.length - 1]).toBe('probe-d2-0')
  })

  it('不同 sessionId 产生不同 eventId（跨日不被去重吞掉）', () => {
    // F-1 回归锁定：同档案同 category 在 day1 与 day2 都会回落，若 eventId
    // 只由 (profileId, category) 拼出，两天会拿到同一个 ID，Task 6 的 eventId
    // 去重会把 day2 的回落判成 day1 的重放而静默丢弃——家长报告少一条记录。
    // sessionId 每次组题都不同，所以 eventId 必须带上它。
    const pool = buildPool().filter((item) => !(item.category === 'probe' && item.difficulty === 1))

    const args = {
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [] as DomainEvent[], now: FIXED_NOW, baseDifficulty: 1 as const },
      pool,
      clock: fixedClock,
    }

    const day1 = buildDailyQuest({ ...args, idGenerator: () => 'session-day1' })
    const day2 = buildDailyQuest({ ...args, idGenerator: () => 'session-day2' })

    expect(day1.fallbackEvents).toHaveLength(1)
    expect(day2.fallbackEvents).toHaveLength(1)
    // 同档案、同 category、同 pool、同历史——唯一差别是 sessionId。
    expect(day1.fallbackEvents[0].eventId).not.toBe(day2.fallbackEvents[0].eventId)
    expect(day1.fallbackEvents[0].eventId).toContain('session-day1')
    expect(day2.fallbackEvents[0].eventId).toContain('session-day2')
  })

  it('各档题量充足时不产出回落事件', () => {
    const quest = buildDailyQuest({
      profileId: 'p-1',
      settings: defaultSettings(),
      history: { profileId: 'p-1', events: [], now: FIXED_NOW },
      pool: buildPool(),
      clock: fixedClock,
      idGenerator: fixedIdGenerator,
    })

    expect(quest.fallbackEvents).toEqual([])
  })
})
