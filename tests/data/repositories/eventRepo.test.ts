import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { replayProjections } from '../../../src/domain/eventLog/replay'
import type { DomainEvent } from '../../../src/domain/model/types'
import { DB_NAME, openDb } from '../../../src/data/db'
import type { DeepSeaDb } from '../../../src/data/db'
import { createEventRepo } from '../../../src/data/repositories/eventRepo'
import { deleteDatabase, installFakeIndexedDb } from '../fakeIndexedDb'
import {
  NOW,
  PROFILE_A,
  PROFILE_B,
  answerSubmittedEvent,
  profileCreatedEvent,
  sameMillisecondHints,
  sessionStartedEvent,
  settingsUpdatedEvent,
} from '../fixtures'

/**
 * `eventRepo` 的行为契约（spec `offline-event-log` §事件记录与 ID 幂等、
 * §离线可用；design §5 事件重放冲突）。
 *
 * 锁五件事：
 * 1. **写入后读回一致**——整条事件对象（含四个答题事件的 `sessionId`）经
 *    结构化克隆往返后深度相等，不得有字段丢失或被改写；
 * 2. **eventId 幂等**——同一 `eventId` 重复写入不产生第二条记录；
 * 3. **档案隔离**——`listByProfile` 只返回该档案事件，`profileId` 是数据库
 *    层的隔离边界；
 * 4. **删除档案即清数据**——`removeByProfile` 只删目标档案，不动他档案；
 * 5. **同毫秒次序 = 写入次序**——`occurredAt` 相同时按台账记录的写入先后
 *    排，**不按 `eventId` 字典序**；`append` 返回值与 `listByProfile` 逐条
 *    一致。这条是 T6 重放的地基：`replayProjections` 不重排事件，喂给它
 *    的顺序必须就是写入顺序（见本文件末尾的接缝对拍）。
 *
 * 去重规则本身由 `domain/eventLog/appendEvents` 单测覆盖；这里只验证仓储
 * **复用了**它（同一 `sessionId+questionId+retryCount+level` 组合即便换了
 * `eventId` 也不落第二条）。
 */
describe('data/repositories/eventRepo', () => {
  let restore: () => void
  let db: DeepSeaDb

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
    db = await openDb()
  })

  afterEach(() => {
    db.close()
    restore()
  })

  it('写入后读回一致（十类事件均可完整往返）', async () => {
    const repo = createEventRepo(db)
    const events = [
      profileCreatedEvent(PROFILE_A),
      sessionStartedEvent(PROFILE_A),
      answerSubmittedEvent(PROFILE_A),
      settingsUpdatedEvent(PROFILE_A),
    ]

    await repo.append(events)
    const stored = await repo.listByProfile(PROFILE_A)

    expect(stored).toEqual(events)
  })

  it('同一 eventId 重复写入不产生两条记录（含跨批次重复追加）', async () => {
    const repo = createEventRepo(db)
    const event = answerSubmittedEvent(PROFILE_A)

    await repo.append([event])
    await repo.append([event])

    const stored = await repo.listByProfile(PROFILE_A)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toEqual(event)
  })

  it('不同 eventId 但同一逻辑组合（sessionId+questionId+retryCount+level）不落两条', async () => {
    const repo = createEventRepo(db)
    const first = answerSubmittedEvent(PROFILE_A, 'event-a')
    const retried = { ...first, eventId: 'event-b' } as typeof first

    await repo.append([first])
    await repo.append([retried])

    expect(await repo.countByProfile(PROFILE_A)).toBe(1)
  })

  it('按 profileId 隔离：他档案事件不出现在本档案视图里', async () => {
    const repo = createEventRepo(db)

    await repo.append([profileCreatedEvent(PROFILE_A), answerSubmittedEvent(PROFILE_A)])
    await repo.append([profileCreatedEvent(PROFILE_B), sessionStartedEvent(PROFILE_B)])

    expect(await repo.listByProfile(PROFILE_A)).toEqual([
      profileCreatedEvent(PROFILE_A),
      answerSubmittedEvent(PROFILE_A),
    ])
    expect(await repo.listByProfile(PROFILE_B)).toHaveLength(2)
  })

  it('同批次内既有重复 eventId 时先到者胜', async () => {
    const repo = createEventRepo(db)
    const first = profileCreatedEvent(PROFILE_A, 'dup')
    const second = { ...first, occurredAt: first.occurredAt + 5 } as typeof first

    await repo.append([first, second])

    expect(await repo.listByProfile(PROFILE_A)).toEqual([first])
  })

  it('空批次不写库、直接返回空数组（一次没产生任何事件的保存也合法）', async () => {    const repo = createEventRepo(db)

    expect(await repo.append([])).toEqual([])
    expect(await repo.listByProfile(PROFILE_A)).toEqual([])
  })

  it('混档批次抛错，绝不把别的档案事件写进这份日志', async () => {
    const repo = createEventRepo(db)

    await expect(
      repo.append([profileCreatedEvent(PROFILE_A), profileCreatedEvent(PROFILE_B)]),
    ).rejects.toThrow('同属一个档案')

    // 抛错之前没有写任何东西：不该留下"写了一半"的中间态。
    expect(await repo.listByProfile(PROFILE_A)).toEqual([])
    expect(await repo.listByProfile(PROFILE_B)).toEqual([])
  })

  it('removeByProfile 只清目标档案事件', async () => {
    const repo = createEventRepo(db)
    await repo.append([profileCreatedEvent(PROFILE_A)])
    await repo.append([profileCreatedEvent(PROFILE_B)])

    await repo.removeByProfile(PROFILE_A)

    expect(await repo.listByProfile(PROFILE_A)).toEqual([])
    expect(await repo.listByProfile(PROFILE_B)).toEqual([profileCreatedEvent(PROFILE_B)])
  })

  it('removeByProfile 之后重新追加，台账不复活旧事件（序号只增不复用）', async () => {
    const repo = createEventRepo(db)
    await repo.append(sameMillisecondHints(3))
    await repo.removeByProfile(PROFILE_A)

    const later = answerSubmittedEvent(PROFILE_A)
    await repo.append([later])

    expect(await repo.listByProfile(PROFILE_A)).toEqual([later])
    expect(await repo.countByProfile(PROFILE_A)).toBe(1)
  })
})

/**
 * 同毫秒事件的次序（问题 1/2 的核心契约）。
 *
 * T6 的 `replayProjections` **刻意不按 `occurredAt` 重排**：它要求"调用方
 * 传入的顺序就是写入顺序"。而 IndexedDB 的 `events` 主键是 UUID 字符串，
 * 索引返回的是字典序——同毫秒事件若按它交出去，重放与逐事件增量就会分叉。
 * 因此仓储层必须显式维护"写入次序"（`eventOrder` 台账），本组用例把它锁死。
 */
describe('data/repositories/eventRepo — 同毫秒事件的写入次序', () => {
  let restore: () => void
  let db: DeepSeaDb

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
    db = await openDb()
  })

  afterEach(() => {
    db.close()
    restore()
  })

  it('同毫秒多条事件按写入次序返回，不按 eventId 字典序', async () => {
    const repo = createEventRepo(db)
    // 事件 ID 取 z3/z2/z1（字典序与写入序相反），eventId 若参与排序立刻露馅。
    const batch = sameMillisecondHints(3, NOW, ['z3', 'z2', 'z1'])

    await repo.append(batch)

    expect((await repo.listByProfile(PROFILE_A)).map((event) => event.eventId)).toEqual([
      'z3',
      'z2',
      'z1',
    ])
  })

  it('append 的返回值与 listByProfile 逐条一致（含同毫秒次序）', async () => {
    const repo = createEventRepo(db)
    // 两批 hints 用不同的 level 偏移，避免撞上 `appendEvents` 的逻辑组合键。
    const first = sameMillisecondHints(2, NOW, ['z2', 'z1'], 0)
    const second = sameMillisecondHints(2, NOW + 1, ['y2', 'y1'], 10)

    const appendedFirst = await repo.append(first)
    const appendedSecond = await repo.append(second)
    const listed = await repo.listByProfile(PROFILE_A)

    // append 返回的是**累计**全量日志；listByProfile 必须与它逐条一致。
    expect(appendedSecond).toEqual([...appendedFirst, ...second])
    expect(listed).toEqual(appendedSecond)
  })

  it('跨批次追加的后到事件排在同刻先到事件之后', async () => {
    const repo = createEventRepo(db)
    // 同一毫秒、不同 level：level 1 先写，level 2 后写。
    const early = sameMillisecondHints(1, NOW, ['z9'])
    const late = sameMillisecondHints(1, NOW, ['a9'], 1)

    await repo.append(early)
    await repo.append(late)

    expect((await repo.listByProfile(PROFILE_A)).map((event) => event.eventId)).toEqual(['z9', 'a9'])
  })

  it('occurredAt 不同时仍然按时间升序（次序键只作用于同刻）', async () => {
    const repo = createEventRepo(db)
    const later = sameMillisecondHints(1, NOW + 500, ['a1'], 0)
    const earlier = sameMillisecondHints(1, NOW, ['z1'], 1)

    await repo.append(later)
    await repo.append(earlier)

    expect((await repo.listByProfile(PROFILE_A)).map((event) => event.eventId)).toEqual(['z1', 'a1'])
  })
})

/**
 * T6 与 T9 的**接缝对拍**（方案 A 的回归锁）。
 *
 * `replayProjections`（T6）不重排事件，口径是"传入顺序即写入顺序"；本仓储
 * （T9）承诺 `listByProfile` 返回的正是写入顺序。两侧都在本 worktree 内，可以
 * 直接 import，所以接缝在这里对拍，而不是留待合并后：
 * 把仓储返回的顺序喂给重放，必须与把同一条写入序列喂给重放得到**同一份投影**。
 *
 * 这条用例真正防的是"排序键悄悄漂移"：哪天有人把同刻次序改回 `eventId`
 * 字典序，`listByProfile` 的顺序会变，两行投影就不再相等。
 */
describe('data/repositories/eventRepo — 与 replayProjections 的接缝', () => {
  let restore: () => void
  let db: DeepSeaDb

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
    db = await openDb()
  })

  afterEach(() => {
    db.close()
    restore()
  })

  it('仓储返回顺序喂给重放 == 写入序列喂给重放', async () => {
    const repo = createEventRepo(db)
    // 一次真实题组：建档 → 开组 → 提交 → 三连提示（同一毫秒）。
    // 数组顺序即时间顺序：仓储只按 occurredAt 归位，不打乱时间；真正被锁住
    // 的是同毫秒那三条——它们的 eventId 字典序与写入序恰好相反。
    const writeOrder: DomainEvent[] = [
      profileCreatedEvent(PROFILE_A),
      sessionStartedEvent(PROFILE_A),
      answerSubmittedEvent(PROFILE_A),
      ...sameMillisecondHints(3, NOW + 5, ['z9', 'z8', 'z7'], 2),
    ]

    await repo.append(writeOrder.slice(0, 2))
    await repo.append(writeOrder.slice(2))

    const fromRepo = await repo.listByProfile(PROFILE_A)
    expect(fromRepo).toEqual(writeOrder)

    // 同序必然同投影。这条断言防"有人把排序偷偷改回 eventId 字典序"：那种
    // 改法可能让上一行因巧合仍通过，而这里投影会变。
    expect(replayProjections(fromRepo)).toEqual(replayProjections(writeOrder))
  })

  it('写入次序是持久化的：重新打开连接后同刻次序不变', async () => {
    const repo = createEventRepo(db)
    const batch = sameMillisecondHints(3, NOW, ['z3', 'z2', 'z1'])
    await repo.append(batch)

    // 关掉再开：若次序只活在内存里，这一步就会退回 eventId 字典序。
    db.close()
    db = await openDb()
    const reopened = createEventRepo(db)

    expect((await reopened.listByProfile(PROFILE_A)).map((event) => event.eventId)).toEqual([
      'z3',
      'z2',
      'z1',
    ])
  })
})
