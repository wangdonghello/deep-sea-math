/**
 * `src/domain/model/` —— 领域基础模型。
 *
 * 这里只放**值对象与类型**，没有任何业务规则实现（判等在 `quiz/`、掌握状态
 * 迁移在 `mastery/`、投影重放在 `eventLog/`）。之所以把模型单独抽出来：
 * 六类题型、四档掌握状态、九类事件是**跨层共用的词汇表**，`data/` 的内容
 * JSON、`features/` 的组件、`eventLog/` 的重放都要引用同一份定义，避免各处
 * 手写字符串字面量后漂移。
 *
 * 本文件零依赖：不 import Vue、不触碰任何浏览器/Node 全局，因此可在 Node
 * 下被纯单测覆盖。
 */

/**
 * 六类题型（spec `daily-math-quest` §题型与难度覆盖）。
 *
 * 作为 `const` 元组而非手写 union，是为了让「运行时取值表」与「编译期类型」
 * 共享同一处真源：`QuizType` 由 `QUIZ_TYPES` 推导，题库校验、错题本筛选、
 * 组题分类都只引用这一个数组。
 */
export const QUIZ_TYPES = [
  /** 加减法：多位数加减、差值、连续计算 */
  'add-sub',
  /** 乘除法：乘法表、乘除关系、平均分、已学的余数问题 */
  'mul-div',
  /** 两步应用题：需要两步及以上运算的文字题，走五步引导 */
  'two-step-app',
  /** 未知数关系：逆向求原数、总数、每份数、份数及相关简单等式 */
  'unknown-relation',
  /** 单位、时间与路线：长度、质量、金额、经过时间、下潜距离 */
  'unit-time-route',
  /** 规律与数据：属性表比较、找规律和简单条件推理 */
  'pattern-data',
] as const

/** 六类题型的编译期类型，与 {@link QUIZ_TYPES} 一一对应。 */
export type QuizType = (typeof QUIZ_TYPES)[number]

/** 三档难度：1 见习训练师 / 2 深海训练师 / 3 探险大师。 */
export type Difficulty = 1 | 2 | 3

/**
 * 每日题组的三个槽位类别（spec `daily-math-quest` §每日题组生成）。
 *
 * 默认 5 基础 + 3 应用 + 1 探测，数量由家长在设置中调整。与 {@link QuizType}
 * 是**正交的两个维度**：`QuizType` 描述这题是什么数学题型（六类），`category`
 * 描述这题被排进题组的哪个槽位。
 *
 * 特别注意「探测题」不是 `QuizType` 的一种 —— 六类数学题型里没有它，它纯粹
 * 是槽位维度的概念。早期 design 草稿里出现过的 `type: 'probe'` 写法已由本
 * 常量取代，避免把两个维度压成一个字段后无法同时表达。
 */
export const QUEST_CATEGORIES = ['basic', 'applied', 'probe'] as const

/** 题组槽位类别，与 {@link QUEST_CATEGORIES} 一一对应。 */
export type QuestCategory = (typeof QUEST_CATEGORIES)[number]

/** 五步思考引导的五个步骤（`fiveStepMachine` 的合法迁移链）。 */
export type FiveStepType = 'known' | 'unknown' | 'relation' | 'expression' | 'answer'

/**
 * 五步引导中的单一步骤模板。
 *
 * 只声明「这一步是什么」与「引导语」，不声明该步的交互形态——点选/单选/输入
 * 由 `FiveStepType` 决定（KNOWN/UNKNOWN 点选、RELATION 单选关系式、
 * EXPRESSION 与 ANSWER 小输入），形态属于表现层，放这里会污染模型。
 */
export interface FiveStep {
  /** 步骤类型，固定顺序 known → unknown → relation → expression → answer。 */
  type: FiveStepType
  /** 该步向孩子展示的引导语，MUST NOT 含责备措辞。 */
  prompt: string
}

/** 题干答案的三种等价形态之一，判等规则见 `quiz/answerJudgement`。 */
export interface Answer {
  /** 数值答案，取整后比对。 */
  value: number
  /** 带单位答案的单位（如「颗」），归一化后比对。 */
  unit?: string
  /** 算式答案（如「24÷4」），按 token 序列比对。 */
  expression?: string
}

/**
 * 一道题目的完整内容模型。
 *
 * `requiresFiveStep` 与 `similarQuestionIds` 之所以有默认值，是因为它们在
 * 题库 JSON 里大量重复：绝大多数题目不需要五步、绝大多数题目暂时没有关联
 * 相似题。默认值让题库作者只写有意义的字段。
 *
 * 反之 `category` **必填、没有默认值**：它决定这道题会被 `buildDailyQuest`
 * 从哪个池子里取出来填「5 基础 / 3 应用 / 1 探测」的槽位。若给它一个默认值
 * （无论默认成哪一个），题库作者漏写时会静默落进错误的池子 —— 基础题池
 * 恰好是最大的那个，漏写会被 pools 数量的巧合掩盖，直到某天 5/3/1 配比
 * 悄悄失调才暴露。因此这里选择在构造期/JSON 校验期就失败，而不是运行时
 * 静默错配。
 */
export interface Question {
  /** 题目标识，全库唯一（`similarQuestionIds` 以此为外键）。 */
  id: string
  type: QuizType
  difficulty: Difficulty
  /**
   * 题组槽位归属，与 {@link QuizType} 正交。
   *
   * 组题（`quiz/buildDailyQuest`）按此字段把题库切成 basic/applied/probe
   * 三个池；`type` 则仍用于错题本筛选、题型级掌握状态等数学维度。
   */
  category: QuestCategory
  /** 深海宠物任务包装：把裸数学题放进一个冒险情境。 */
  story: {
    title: string
    body: string
  }
  /** 是否需要五步引导（应用题 / 探测题为 true，基础题直答）。 */
  requiresFiveStep: boolean
  /** 五步模板，`requiresFiveStep` 为 true 时必有。 */
  steps?: FiveStep[]
  /** 固定 5 层提示链，顺序即规格：审题 → 已知/未知 → 数量关系 → 算式 → 讲解示例。 */
  hints: string[]
  answer: Answer
  /** 关联的相似题目 ID，答错订正后追加练习用。 */
  similarQuestionIds: string[]
  /** 自由标签（题型、难度、知识点），供筛选与报告分组。 */
  tags: string[]
  /** 关联的图鉴生物 ID，题目包装里的主角。 */
  creatureRef?: string
  /** 内容核验来源链接，MUST NOT 为空。 */
  sources: string[]
}

/**
 * {@link Question} 的构造输入。
 *
 * 与 `Question` 的唯一差别是 `requiresFiveStep` / `similarQuestionIds` 可选
 * —— 这两个字段的高频取值（false / []）不值得在 60+ 条题库记录里重复书写。
 * `Omit` 后再补可选版本，保证「输入可省」与「产物必有」不靠约定而是靠类型。
 *
 * `category` 刻意**不**在这个可选名单里：它决定组题时的槽位归属（见
 * {@link Question.category} 的说明），漏写的代价是静默错配而非编译错误。
 */
export type QuestionInput = Omit<Question, 'requiresFiveStep' | 'similarQuestionIds'> & {
  requiresFiveStep?: boolean
  similarQuestionIds?: string[]
}

/**
 * 补全 {@link Question} 的缺省字段，产出类型完整的题目对象。
 *
 * 选工厂函数而非类构造函数，理由：
 * 1. `domain/` 要零依赖，且产物要能被结构化克隆整段落 IndexedDB；工厂函数
 *    返回纯数据对象，类实例的方法与原型链在这里纯属负担；
 * 2. 领域模型本质是**值对象**，只需要数据与构造期补缺，不需要身份与方法，
 *    而 `erasableSyntaxOnly` 编译选项下类语法（如参数属性）反而受限；
 * 3. 后续题库内容校验、组题、投影重放都能复用同一个构造入口，默认值规则
 *    只有一处，不会在 JSON 解析与运行时构造之间漂移。
 *
 * 只补两个字段：`requiresFiveStep` → `false`，`similarQuestionIds` → 新空数组
 * （每次调用都新建，两个题目绝不共享同一个数组实例）。其余字段（含
 * `category`）原样透传——它们的取值必须由题库作者显式决定。
 *
 * @throws {Error} 当 `id` 为空字符串时 —— 空 ID 会在 `similarQuestionIds`
 *   外键与 `mistakeBook` 投影里造成无法定位的悬空引用，宁可在构造期炸掉。
 */
export function createQuestion(input: QuestionInput): Question {
  if (input.id.trim() === '') {
    throw new Error('createQuestion: 题目 id 不能为空')
  }

  return {
    ...input,
    requiresFiveStep: input.requiresFiveStep ?? false,
    // `[...]` 而不是直接透传引用：题库 JSON 解析出的对象会被组件反复读取、
    // 也可能被投影逻辑临时改写，共享引用会让「默认空数组」这类字面量在
    // 多处被意外 push 后互相污染。
    similarQuestionIds: [...(input.similarQuestionIds ?? [])],
  }
}

/**
 * 掌握状态四态（spec `daily-math-quest` §掌握状态判定）。
 *
 * `unmastered` 是缺省态：新题/新题型在投影里没有记录时即视为未掌握，不需要
 * 显式写入一条记录。
 */
export const MASTERY_LEVELS = ['unmastered', 'hinted', 'independent', 'stable'] as const

/** 掌握状态等级，题目级与题型级共用同一套四态。 */
export type MasteryLevel = (typeof MASTERY_LEVELS)[number]

/**
 * 单个维度的掌握状态。
 *
 * `independentStreak` 是「连续独立答对次数」，题型级累计到 3 次即进入
 * `stable`。它必须与 `level` 放在一起而不是拆成两张表，因为答错/看答案会
 * 打断连续计数——两者是同一次迁移的产物。
 */
export interface MasteryState {
  level: MasteryLevel
  /** 连续独立答对次数，用于题型级「稳定掌握」判定（答错或看答案归零）。 */
  independentStreak: number
}

/**
 * 一个孩子档案。
 *
 * `pinHash` 与 `salt` 是 PIN 安全的全部落点：**只存哈希，只比对哈希**
 * （Constitution Check §1）。`pinHash` 由 `domain/crypto/hashPin` 产出，
 * 本模型里没有任何字段能反推出 PIN 明文。
 */
export interface Profile {
  id: string
  nickname: string
  /** 头像标识（本地素材键，不采集中任何个人信息）。 */
  avatarId: string
  /** PIN 的 SHA-256 十六进制哈希，MUST NOT 存明文。 */
  pinHash: string
  /** 该档案专属的哈希盐，重置 PIN 时必须一并换新。 */
  salt: string
  /** 建档时间（Unix 毫秒），由注入的 `clock` 提供。 */
  createdAt: number
}

/** 图鉴生物条目（`data/content/creatures.json` 的同构类型）。 */
export interface BestiaryEntry {
  id: string
  /** 中文常用名。 */
  name: string
  /** 学名或分类信息；低于种级时写「灯笼鱼科 Myctophidae」这类科属表述。 */
  scientificName: string
  /** 活动深度范围，教学用区域范围，MUST NOT 写成唯一固定深度。 */
  depthRange: { min: number; max: number }
  /** 栖息环境说明。 */
  habitat: string
  /** 适龄知识卡，3–5 条。 */
  knowledgeCards: string[]
  /** 可追溯的来源链接，MUST NOT 为空。 */
  sources: string[]
  /** 原创 2D 插画素材键。 */
  illustrationRef?: string
}

/**
 * 当日题组会话（`session-started` 的产物）。
 *
 * 同一天内同一档案的 `sessionId` 与题序固定，刷新不重抽 —— 这就是
 * `dailyQuestIndex` 投影存在的理由。
 */
export interface Session {
  id: string
  profileId: string
  /** 当日题组的题目 ID 顺序。 */
  questionIds: string[]
  /** 组题时的难度档位轨迹（升/降档依据，回落时留痕）。 */
  difficultyTrace: number[]
  /** 生成时间（Unix 毫秒），由注入的 `clock` 提供。 */
  startedAt: number
}

/** 家长设置（`settings-updated` 事件载荷的同构类型）。 */
export interface Settings {
  /** 基础题数量，默认 5。 */
  basicCount: number
  /** 应用题数量，默认 3。 */
  appliedCount: number
  /** 探测题数量，默认 1。 */
  probeCount: number
  /** 每日学习时长上限（分钟）。 */
  maxMinutes: number
}

/**
 * 事件类型全集（design §2 事件表）。
 *
 * 事件是唯一事实来源：刷新后的档案状态由事件重放得出，而不是反过来由投影
 * 反推事件。因此这个表的每一项都必须能被 `eventLog/replay` 消费。
 *
 * 注意表里**没有**「撤销/删除」类事件：答错绝不回退已解锁内容，所有解锁
 * 事件都是追加型（design §3 解锁规则）。
 */
export const EVENT_TYPES = [
  'profile-created',
  'session-started',
  'answer-submitted',
  'hint-used',
  'answer-revealed',
  'correction-done',
  'session-completed',
  'unlock-granted',
  'settings-updated',
] as const

/** 事件类型字面量，与 {@link EVENT_TYPES} 一一对应。 */
export type EventType = (typeof EVENT_TYPES)[number]

/**
 * 全部事件的公共字段（spec `offline-event-log` §同步预留字段）。
 *
 * `eventId` 是幂等键：同一逻辑操作重复写入只保留一条。
 * `questionVersion` 为阶段二跨设备同步预留——同一道题的内容修订后，
 * 重放过期事件时能识别出版本差异。
 */
export interface EventBase {
  /** 全局唯一事件 ID（`crypto.randomUUID()`），写入前去重。 */
  eventId: string
  /** 所属档案；档案间数据隔离的边界。 */
  profileId: string
  /** 客户端时间戳（Unix 毫秒），由注入的 `clock` 提供。 */
  occurredAt: number
  /** 题目内容版本，供阶段二同步识别过期事件。 */
  questionVersion?: string
}

/** 建档：昵称、头像与加盐 PIN 哈希一次性落定。 */
export interface ProfileCreatedEvent extends EventBase {
  type: 'profile-created'
  nickname: string
  avatarId: string
  pinHash: string
  salt: string
}

/** 开始当日题组：题序当场固定，刷新不重抽。 */
export interface SessionStartedEvent extends EventBase {
  type: 'session-started'
  sessionId: string
  questionIds: string[]
  /** 出题时的难度档位轨迹，回落时供家长报告解释。 */
  difficultyTrace: number[]
}

/** 提交一次答案（含重试）。 */
export interface AnswerSubmittedEvent extends EventBase {
  type: 'answer-submitted'
  /**
   * 所属当日题组。
   *
   * 两个用途，都不可或缺：
   * 1. **Task 6 的复合去重键**：design §2 规定「同一次逻辑操作 MUST NOT
   *    产生两条语义重复的事件」，其判据是
   *    `sessionId + questionId + retryCount + level`——没有这个字段，
   *    去重键根本无法字面构成，只能靠反查推导同一天的 session。
   * 2. **投影消歧**：Task 4 允许题库不足时重复出同一题（`repeatCount > 0`），
   *    此时只凭 `questionId` 无法区分「本轮会话的作答」与「上一轮会话的
   *    作答」，`questProgress` 会把两轮进度串成一条。
   */
  sessionId: string
  questionId: string
  /** 孩子提交的原始输入，未归一化前的内容。 */
  submitted: string
  correct: boolean
  /** 展开到的提示层级 0–5；0 表示未用提示（决定是否计「独立掌握」）。 */
  usedHintLevel: number
  retryCount: number
  /** 本题用时（毫秒）。 */
  ms: number
}

/** 展开一层提示。 */
export interface HintUsedEvent extends EventBase {
  type: 'hint-used'
  /** 所属当日题组，用途见 {@link AnswerSubmittedEvent.sessionId}。 */
  sessionId: string
  questionId: string
  /** 提示层级 1–5。 */
  level: number
}

/** 直接看答案：该题 MUST NOT 计为独立掌握。 */
export interface AnswerRevealedEvent extends EventBase {
  type: 'answer-revealed'
  /** 所属当日题组，用途见 {@link AnswerSubmittedEvent.sessionId}。 */
  sessionId: string
  questionId: string
}

/** 订正答对并完成相似题。 */
export interface CorrectionDoneEvent extends EventBase {
  type: 'correction-done'
  /** 所属当日题组，用途见 {@link AnswerSubmittedEvent.sessionId}。 */
  sessionId: string
  questionId: string
  similarQuestionId: string
}

/** 整组完成：发放奖励并推进下潜深度。 */
export interface SessionCompletedEvent extends EventBase {
  type: 'session-completed'
  sessionId: string
  rewards: string[]
  /** 新解锁区域（未解锁新区域时可省略）。 */
  unlockedZone?: string
  /** 新解锁生物（图鉴卡）。 */
  unlockedCreature?: string
}

/** 解锁发放：追加型，无对应撤销事件。 */
export interface UnlockGrantedEvent extends EventBase {
  type: 'unlock-granted'
  targetId: string
  kind: 'creature' | 'zone'
  /** 解锁原因（sessionId）。 */
  reason: string
}

/** 家长改设置：自下一次生成题组起生效。 */
export interface SettingsUpdatedEvent extends EventBase {
  type: 'settings-updated'
  basicCount: number
  appliedCount: number
  probeCount: number
  maxMinutes: number
}

/**
 * 答题流程事件 union——驱动掌握状态、错题本与题目进度的四个事件。
 *
 * 之所以先从九类事件里切出这四类：掌握状态机的输入只有它们（`design §3`
 * 的迁移箭头全部由「答对 / 用了提示 / 看答案 / 订正答对」触发），把输入
 * 类型收窄后，Task 5 的状态机函数签名不必再背负建档与设置事件。
 */
export type AnswerEvent =
  | AnswerSubmittedEvent
  | HintUsedEvent
  | AnswerRevealedEvent
  | CorrectionDoneEvent

/**
 * 事件日志可接受的全部事件 union（design §2 事件表的类型化）。
 *
 * 用 `type` 做判别属性，`eventLog/appendEvents` 与 `replay` 的 switch 因此
 * 可在编译期穷尽；新增事件类型而漏改重放逻辑会直接报错，不会静默丢事件。
 */
export type DomainEvent =
  | AnswerEvent
  | ProfileCreatedEvent
  | SessionStartedEvent
  | SessionCompletedEvent
  | UnlockGrantedEvent
  | SettingsUpdatedEvent
