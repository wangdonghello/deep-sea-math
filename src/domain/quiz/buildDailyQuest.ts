import type {
  DifficultyFallbackEvent,
  Grade,
  QuestCategory,
  Question,
  Session,
  SessionStartedEvent,
  Settings,
  ThemeId,
} from '../model/types'
import {
  computeCurrentDifficulty,
  createDifficultyFallbackEvent,
  isMastered,
  resolveEffectiveDifficulty,
  type DifficultyCounts,
  type DifficultyHistory,
  type MasteryByQuestion,
} from './difficulty'

/**
 * `src/domain/quiz/buildDailyQuest` —— 当日题组生成（design §3 组题）。
 *
 * 按 `settings` 的三类数量从 `pool` 取题，产出题序固定的 {@link Session}。
 * 四条核心规则，各自对应 spec「每日题组生成」的一个 Scenario：
 * 1. **题量**：默认 5 基础 / 3 应用 / 1 探测，数量由家长设置决定；
 * 2. **切池**：按 `question.category`（槽位维度）取题，而非 `type`；
 * 3. **不重复已答对的题**：排除 `masteryByQuestion` 中独立/稳定掌握的题，
 *    池不足时允许重复并记录 `repeatCount`；
 * 4. **选题确定**：同输入的题序由固定排序键决定；`sessionId`、`session-started`
 *    与 `difficulty-fallback` 的 `eventId` 由注入的 `idGenerator` 产生，时间来自
 *    `clock`。未注入时 ID 使用 Web Crypto UUID，不影响选题结果。
 */

/**
 * ⚠️ 与 design §3 取题描述的差异（design 为冻结产物，不可修改，特此记录）：
 *
 * design §3 写「探测题从 `type='probe'` 池取」，但 Task 2 的领域模型已确立
 * **`'probe'` 不是 `QuizType` 的取值**——六类题型（加减法/乘除法/两步应用题/
 * 未知数关系/单位时间路线/规律与数据）里没有探测题；探测题是**题组槽位**
 * 概念，由 `Question.category`（`'basic' | 'applied' | 'probe'`）表达。
 *
 * 因此本模块按 `category` 切池。若按 design 原文的 `type='probe'` 实现，探测
 * 题将永远取不到（没有任何题的 `type` 等于 `'probe'`），题组会静默退化成
 * 8 题、「最后一道探测题作为高潮」的教学设计落空。`type` 与 `category` 是
 * 正交的两个维度：前者是数学题型（错题本筛选、题型级掌握），后者是槽位归属。
 */

/** 槽位取题顺序：基础 → 应用 → 探测。探测题收尾，作为整组的高潮。 */
export const QUEST_SLOT_ORDER: readonly QuestCategory[] = ['basic', 'applied', 'probe']

/** 每类槽位对应的设置字段（数量由家长调整）。 */
const COUNT_BY_CATEGORY: Readonly<Record<QuestCategory, keyof Settings>> = {
  basic: 'basicCount',
  applied: 'appliedCount',
  probe: 'probeCount',
}

/** 生成当日题组的入参。 */
export interface DailyQuestInput {
  /** 档案 ID；事件过滤与难度自适应都按它隔离。 */
  profileId: string
  /** 出题年级；缺省 3 年级（兼容第一版调用）。 */
  grade?: Grade
  /** 主主题；缺省深海（兼容第一版调用）。 */
  themeId?: ThemeId
  /** 家长设置，决定三类槽位的题量与时长上限。 */
  settings: Settings
  /** 难度自适应的历史输入（近 7 天事件），见 {@link DifficultyHistory}。 */
  history: DifficultyHistory
  /** 候选题目池（通常来自 Task 8 的题库）。 */
  pool: readonly Question[]
  /** 题目级掌握状态摘要（Task 6 重放产出）；缺省视为无人掌握。 */
  masteryByQuestion?: MasteryByQuestion
  /** 注入的时钟，产出 `session.startedAt`。缺省 `Date.now`。 */
  clock?: () => number
  /** 注入的 ID 发生器，依次产出 session ID 与组题事件 ID。缺省 `crypto.randomUUID()`。 */
  idGenerator?: () => string
}

/** 当日题组产物。 */
export interface DailyQuest {
  /** 题序固定的当日题组会话。 */
  session: Session
  /** 题目 ID 顺序（`session.questionIds` 的副本，便于直接读取）。 */
  questionIds: string[]
  /** 因池不足而重复取用的**次数**（0 表示没有人为重复；注意是次数不是题目数）。
   *  例：池里只有 2 道同类题却要填 7 个槽位，`repeatCount` 为 5。 */
  repeatCount: number
  /** 本次组题发生的档位回落事件（无回落时为空数组）。 */
  fallbackEvents: DifficultyFallbackEvent[]
  /** 待写入日志的 `session-started` 事件（由调用方决定何时落库）。 */
  sessionStartedEvent: SessionStartedEvent
}

/**
 * 默认时钟注入：宿主当前时间。
 *
 * 之所以可以给默认值而 `difficulty` 的 `now` 不给：这里的时间只落在
 * `session.startedAt` 与回落事件的 `occurredAt` 上，取错不会改变题序与档位；
 * 而难度窗口的 `now` 直接决定哪些事件被纳入统计，默认值会把「同输入必同
 * 输出」的回归锁变成空话。
 *
 * 注入固定时钟时，两处时间戳完全相同；不注入时 `Date.now()` 被调用两次、
 * 可能相差几毫秒——只是展示字段，不影响任何判定。
 */
const defaultClock: () => number = () => Date.now()

/**
 * 默认 ID 注入：Web Crypto 随机 UUID。
 *
 * `crypto` 在**调用时**才解析（而非模块顶层），因此 domain 模块被 import 进
 * 不提供该全局的环境时不会在加载期抛错——只在真的没注入又走到默认分支时
 * 才失败，与 Task 2 `hashPin` 的 `webCryptoDigest` 同一手法。
 */
const defaultIdGenerator: () => string = () => globalThis.crypto.randomUUID()

/**
 * 题目排序键：`(difficulty, id)` 字典序。
 *
 * 为什么必须是这两个字段：**确定性**要求排序键与输入顺序无关、且不含随机
 * 成分。`difficulty` 在前让同档题连续出现（教学上从易到难），`id` 兜底保证
 * 同档题之间也有稳定次序——题库 JSON 的书写顺序一变，题序不该跟着变。
 *
 * 字符串比的是 `<` / `>` 而**不是** `localeCompare`：后者走 `Intl`，排序
 * 结果随宿主的默认区域设置而变（中文 locale 下 `a-b` 与 `ab` 的先后就与
 * C locale 不同）。域层要的是「在任何宿主上排出同一顺序」，码元比较才做得到。
 * 三个分支显式返回 -1/0/1，不省略相等分支——`<` 与 `>` 皆假时是同一个 id
 * （题库不该有重复 id，但排序函数必须对重复输入保持确定性）。
 */
function compareQuestions(left: Question, right: Question): number {
  if (left.difficulty !== right.difficulty) {
    return left.difficulty - right.difficulty
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * 生成当日题组。
 *
 * 取题流程（**单次分区**，不在循环里反复过滤整池）：
 * 1. 按 `category` 把池子切成三份，每份排除已独立掌握的题并排序；
 * 2. 由 {@link computeCurrentDifficulty} 算出目标档，按各类的档位题量决定
 *    是否回落到相邻档；
 * 3. 每类从「回落后的档位」起按排序键取足槽位数，不足则从池头循环取用并
 *    累计 `repeatCount`。
 *
 * 之所以一次分区而不是每类各过滤一次：池子是 60–80 题的量级，三次遍历本身
 * 不慢，但「三类各自过滤 + 各自排序」会让同一份排除逻辑写三遍——排除规则
 * （独立/稳定掌握）一旦调整，漏改一处就会造成某类题静默重复出已掌握的题。
 *
 * @param input 见 {@link DailyQuestInput}。
 * @returns 见 {@link DailyQuest}。返回的 `questionIds` 是**新数组**，
 *   `session.questionIds` 又是它的一份拷贝：调用方事后再改题序，不会反写到
 *   已生成的会话上（刷新后重放得到的结果必须仍与本次一致）。
 */
export function buildDailyQuest(input: DailyQuestInput): DailyQuest {
  const { profileId, settings, pool } = input
  const grade = input.grade ?? 3
  const themeId = input.themeId ?? 'deep-sea'
  const gradePool = pool.filter((question) => question.grade === grade)
  if (gradePool.length === 0) {
    throw new Error(`No questions for grade ${grade}`)
  }
  const clock = input.clock ?? defaultClock
  const idGenerator = input.idGenerator ?? defaultIdGenerator
  const generatedIds = new Set<string>()
  const nextUniqueId = (purpose: string): string => {
    const id = idGenerator()
    if (generatedIds.has(id)) {
      throw new Error(`Duplicate ID generated for ${purpose}: ${id}`)
    }
    generatedIds.add(id)
    return id
  }

  const currentDifficulty = computeCurrentDifficulty(input.history)

  // 单次分区：三类各一份，排除已掌握 + 排序只做一次。
  // 用字面量 record 而不是 Map：三类槽位是编译期已知的有限集合，Map.get()
  // 的 `| undefined` 会逼出一支永远走不到的 `?? []` 兜底分支；而 record 的键
  // 必须写全，`QuestCategory` 将来新增槽位时这里直接编译报错，不会静默漏一类。
  const candidates: Record<QuestCategory, Question[]> = {
    basic: [],
    applied: [],
    probe: [],
  }
  for (const question of gradePool) {
    if (!isMastered(question.id, input.masteryByQuestion)) {
      candidates[question.category].push(question)
    }
  }
  // 每条链排一次序，之后三次取题共用同一份顺序。
  for (const category of QUEST_SLOT_ORDER) {
    candidates[category].sort(compareQuestions)
  }

  const fallbackEvents: DifficultyFallbackEvent[] = []
  const questionIds: string[] = []
  let repeatCount = 0

  // 先取 sessionId：回落事件要挂到所属题组上，而它来自注入的 idGenerator。
  const sessionId = nextUniqueId('session')
  const startedAt = clock()
  const difficultyTrace: number[] = []

  for (const category of QUEST_SLOT_ORDER) {
    const available = candidates[category]
    const needed = settings[COUNT_BY_CATEGORY[category]]
    const counts: DifficultyCounts = {
      1: available.filter((question) => question.difficulty === 1).length,
      2: available.filter((question) => question.difficulty === 2).length,
      3: available.filter((question) => question.difficulty === 3).length,
    }

    const effective = resolveEffectiveDifficulty(currentDifficulty, counts, needed)

    // 只有真的换了档才留痕：目标档就能凑够时 fallback 为 false。
    if (effective.fallback) {
      fallbackEvents.push(
        createDifficultyFallbackEvent({
          eventId: nextUniqueId('difficulty-fallback event'),
          occurredAt: startedAt,
          profileId,
          sessionId: sessionId,
          requestedDifficulty: currentDifficulty,
          actualDifficulty: effective.difficulty,
          category,
        }),
      )
    }

    // 取生效档的题；不足时从池头按同一排序键循环取用（不随机）。
    const atEffectiveTier = available.filter((question) => question.difficulty === effective.difficulty)

    // 该类整个池子都空（题库里没有这个 category 的题）时无题可取：既不能
    // 编一道题，也不能从别的 category 借（那会让「5 基础 / 3 应用」的口径
    // 失真）。跳过该槽位，三类齐全由 Task 8 的题库内容校验保证。
    if (atEffectiveTier.length === 0) {
      difficultyTrace.push(effective.difficulty)
      continue
    }

    for (let index = 0; index < needed; index += 1) {
      const picked = atEffectiveTier[index % atEffectiveTier.length]
      questionIds.push(picked.id)
      // 循环取用的第二次及以后都算重复（index >= 池长即进入第二轮）。
      if (index >= atEffectiveTier.length) {
        repeatCount += 1
      }
    }

    difficultyTrace.push(effective.difficulty)
  }

  // 主题题保障：默认题组至少 2 道带当前主题情境的题；不足时用同年级同槽位
  // 的主题题替换中性题，绝不跨年级或跨主题。
  const themedIds = new Set(
    gradePool.filter((question) => question.themeStories?.[themeId] !== undefined).map((question) => question.id),
  )
  if (questionIds.filter((id) => themedIds.has(id)).length < 2) {
    const selected = new Set(questionIds)
    const byId = new Map(gradePool.map((question) => [question.id, question]))
    for (let index = 0; index < questionIds.length; index += 1) {
      if (questionIds.filter((id) => themedIds.has(id)).length >= 2) break
      const current = byId.get(questionIds[index])
      if (current === undefined || themedIds.has(current.id)) continue
      const replacement = gradePool.find((question) =>
        themedIds.has(question.id) &&
        !selected.has(question.id) &&
        question.category === current.category,
      )
      if (replacement !== undefined) {
        selected.delete(questionIds[index])
        selected.add(replacement.id)
        questionIds[index] = replacement.id
      }
    }
  }

  const session: Session = {
    id: sessionId,
    profileId,
    questionIds: [...questionIds],
    difficultyTrace,
    startedAt,
    grade,
    themeId,
  }

  const sessionStartedEvent: SessionStartedEvent = {
    eventId: nextUniqueId('session-started event'),
    profileId,
    occurredAt: startedAt,
    type: 'session-started',
    sessionId,
    questionIds: [...questionIds],
    difficultyTrace: [...difficultyTrace],
    grade,
    themeId,
  }

  return {
    session,
    questionIds,
    repeatCount,
    fallbackEvents,
    sessionStartedEvent,
  }
}
