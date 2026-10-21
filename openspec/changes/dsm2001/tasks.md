# DSM2001 第二版实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `subagent-driven-development`（推荐）或 `executing-plans` 逐任务实现。步骤使用复选框（`- [ ]`）跟踪进度。
>
> **提交格式：** 每个任务一个 commit，必须写成 `[DSM2001] <type>: T<N> - <subject>`，例如 `[DSM2001] feat: T6 - filter daily quests by grade and theme`。

**目标：** 让孩子档案按 1–3 年级和主兴趣主题生成每日任务，题目严格匹配年级，新增选择题与更多应用题，主题图鉴按探索阶段解锁，并支持错题打印。

**架构：** 沿用 `views → router/routes → features → domain` 分层。档案增加 `grade`/`themeId`；题库按年级拆分并由内容校验器守住边界；每日任务按年级硬过滤、按主题选情境题；主题包与通用四阶段替代固定深海图鉴；错题投影补存最后错误答案，打印页复用错题筛选。

**技术栈：** Vue 3、TypeScript、Vite、Pinia、IndexedDB（idb）、Vitest、jsdom、Playwright/CDP（仅浏览器验收）。

## 执行顺序

Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12。Task 11 可与 Task 9/10 并行；Task 12 必须最后执行。

---

### Task 1：领域模型增加年级、主题、题型与档案偏好事件

**文件：**
- 修改：`src/domain/model/types.ts`
- 创建：`src/domain/model/normalize.ts`
- 修改：`src/domain/eventLog/replay.ts`
- 测试：`tests/domain/model/normalize.test.ts`
- 修改：`tests/helpers/profile.ts`（若不存在则创建）

**RED**
- [ ] 步骤 1：写失败测试，覆盖旧档案补默认值、旧题目补默认值、旧题组补快照、选择题答案与 `ProfilePreferencesUpdatedEvent` 类型。

```ts
// tests/domain/model/normalize.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeProfile, normalizeQuestion, normalizeSessionSnapshot } from '@/domain/model/normalize'
import type { Profile, Question } from '@/domain/model/types'

describe('normalizeProfile', () => {
  it('补 3 年级与深海主题', () => {
    const legacy = { id: 'p1', nickname: '小海星', avatarId: 'avatar-1', pinHash: 'h', salt: 's', createdAt: 1 } as Profile
    expect(normalizeProfile(legacy)).toMatchObject({ grade: 3, themeId: 'deep-sea' })
  })
})

describe('normalizeQuestion', () => {
  it('旧题目补 3 年级、开放题型和数值答案', () => {
    const legacy = { id: 'q1', answer: { value: 5 } } as unknown as Question
    expect(normalizeQuestion(legacy)).toMatchObject({ grade: 3, format: 'open' })
  })

  it('选择题保留 optionId', () => {
    const choice = { id: 'q2', grade: 1, format: 'choice', options: [], answer: { value: 0, optionId: 'B' } } as unknown as Question
    expect(normalizeQuestion(choice).answer.optionId).toBe('B')
  })
})

describe('normalizeSessionSnapshot', () => {
  it('旧题组补 3 年级与深海', () => {
    expect(normalizeSessionSnapshot({})).toEqual({ grade: 3, themeId: 'deep-sea' })
  })
})
```

- [ ] 步骤 2：运行测试确认失败。

```bash
npm run test -- --run tests/domain/model/normalize.test.ts
```

预期：FAIL，`normalizeProfile` 尚未导出。

**GREEN**
- [ ] 步骤 3：在 `src/domain/model/types.ts` 增加类型与字段。

```ts
export type Grade = 1 | 2 | 3
export type ThemeId = 'deep-sea' | 'dinosaur' | 'space'
export type QuestionFormat = 'open' | 'choice'
export type ChoiceId = 'A' | 'B' | 'C' | 'D'

export interface ChoiceOption {
  id: ChoiceId
  label: string
}

export interface Answer {
  value: number
  unit?: string
  expression?: string
  /** 仅选择题使用；开放题不得声明。 */
  optionId?: ChoiceId
}

export interface Profile {
  id: string
  nickname: string
  avatarId: string
  pinHash: string
  salt: string
  createdAt: number
  grade: Grade
  themeId: ThemeId
}

// 在现有 Question 接口内追加以下字段，原有字段保持不变
export interface QuestionAdditions {
  grade: Grade
  format: QuestionFormat
  options?: ChoiceOption[]
  themeStories?: Partial<Record<ThemeId, { title: string; body: string }>>
}
```

- [ ] 步骤 4：新增 `profile-preferences-updated` 事件并加入 `EVENT_TYPES`/`DomainEvent`。

```ts
export interface ProfilePreferencesUpdatedEvent extends EventBase {
  type: 'profile-preferences-updated'
  grade: Grade
  themeId: ThemeId
}
```

- [ ] 步骤 5：在 `src/domain/model/normalize.ts` 实现三个规范化函数；旧值缺省为 3 年级/深海/开放题。

```ts
export function normalizeProfile(input: Profile): Profile {
  return { ...input, grade: input.grade ?? 3, themeId: input.themeId ?? 'deep-sea' }
}

export function normalizeSessionSnapshot(input: { grade?: Grade; themeId?: ThemeId }): { grade: Grade; themeId: ThemeId } {
  return { grade: input.grade ?? 3, themeId: input.themeId ?? 'deep-sea' }
}

export function normalizeQuestion(input: Question): Question {
  return { ...input, grade: input.grade ?? 3, format: input.format ?? 'open' }
}
```

- [ ] 步骤 6：在 `replay.ts` 的 switch 中为 `profile-preferences-updated` 加空分支（不改变现有投影），并更新测试夹具 helper。

- [ ] 步骤 7：运行目标测试与类型检查。

```bash
npm run test -- --run tests/domain/model/normalize.test.ts
npm run type-check
```

预期：PASS；若旧测试夹具缺少新字段，统一改用 `tests/helpers/profile.ts` 的 `makeProfile()`。

**REFACTOR**
- [ ] 步骤 8：把重复的默认值收进 `normalize.ts` 常量，删除测试中重复的 `grade: 3, themeId: 'deep-sea'` 字面量；运行全套测试。

```bash
npm run test
```

**Commit**
- [ ] 步骤 9：提交。

```bash
git add src/domain/model/types.ts src/domain/model/normalize.ts src/domain/eventLog/replay.ts tests/domain/model/normalize.test.ts tests/helpers/profile.ts
git commit -m "[DSM2001] feat: T1 - add grade theme and choice fields to domain model"
```

---

### Task 2：题库 schema 校验年级、选择题与主题故事

**文件：**
- 修改：`src/data/content/schema.ts`
- 修改：`src/data/content/index.ts`
- 测试：`tests/data/content/gradeQuestionBank.test.ts`

**RED**
- [ ] 步骤 1：写失败测试，覆盖缺失年级、跨年级相似题、选择题选项数量/唯一正确、主题故事非法键、应用题下限。

```ts
// tests/data/content/gradeQuestionBank.test.ts
import { describe, expect, it } from 'vitest'
import { assertValidQuestionBank } from '@/data/content/schema'

function baseQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1', type: 'add-sub', difficulty: 1, category: 'basic', grade: 1, format: 'open',
    story: { title: 't', body: 'b' }, requiresFiveStep: false, hints: ['h1', 'h2'],
    answer: { value: 3 }, similarQuestionIds: [], tags: [], sources: ['https://example.com'], ...overrides,
  }
}

it('拒绝跨年级相似题', () => {
  expect(() => assertValidQuestionBank({ version: '4.0.0', questions: [
    baseQuestion(), baseQuestion({ id: 'q2', grade: 2, similarQuestionIds: ['q1'] }),
  ] })).toThrow(/跨年级|grade/)
})
```

- [ ] 步骤 2：运行确认失败。

```bash
npm run test -- --run tests/data/content/gradeQuestionBank.test.ts
```

**GREEN**
- [ ] 步骤 3：在 schema 中按 `grade` 分组校验，新增 `validateChoiceQuestion` 与 `validateThemeStories`。

```ts
if (question.format === 'choice') {
  if (question.options?.length !== 4) throw new Error(`${path}: choice requires 4 options`)
  if (new Set(question.options.map((o) => o.id)).size !== 4) throw new Error(`${path}: duplicate option id`)
  if (question.answer.optionId === undefined) throw new Error(`${path}: missing correct option`)
  if (!question.options.some((o) => o.id === question.answer.optionId)) throw new Error(`${path}: correct option not found`)
} else if (question.answer.optionId !== undefined) {
  throw new Error(`${path}: open question must not declare optionId`)
}
```

- [ ] 步骤 4：把 `QUESTION_BANK_LIMITS` 改为按年级检查：每年级 216 题、应用题 ≥72、选择题 ≥72；跨年级相似题直接失败。

- [ ] 步骤 5：在 `index.ts` 中按年级合并题库，导出 `QUESTION_BANK_BY_GRADE`；旧 `QUESTION_BANK` 保留为合并视图。

- [ ] 步骤 6：运行测试与类型检查。

```bash
npm run test -- --run tests/data/content/gradeQuestionBank.test.ts
npm run type-check
```

**REFACTOR**
- [ ] 步骤 7：把重复的“每年级数量”断言抽成 `assertGradeVolume()`，并在测试中复用；运行内容测试。

```bash
npm run test -- --run tests/data/content
```

**Commit**
- [ ] 步骤 8：提交。

```bash
git add src/data/content/schema.ts src/data/content/index.ts tests/data/content/gradeQuestionBank.test.ts
git commit -m "[DSM2001] feat: T2 - validate grade choice and theme question content"
```

---

### Task 3：三年级题库重做并支持选择题

**文件：**
- 修改：`scripts/generate-question-bank.mjs`
- 重命名：`src/data/content/questionBank.json` → `src/data/content/questionBank.grade3.json`
- 修改：`src/data/content/index.ts`
- 测试：`tests/data/content/grade3Bank.test.ts`

**RED**
- [ ] 步骤 1：写失败测试，断言三年级 216 题、选择题 ≥72、应用题 ≥72、无重复题干、每题 `grade === 3`。

```ts
import grade3 from '@/data/content/questionBank.grade3.json'
import type { Question } from '@/domain/model/types'

it('三年级题库达到 216 题并含选择题', () => {
  const bank = grade3 as { questions: Question[] }
  expect(bank.questions).toHaveLength(216)
  expect(bank.questions.every((q) => q.grade === 3)).toBe(true)
  expect(bank.questions.filter((q) => q.format === 'choice').length).toBeGreaterThanOrEqual(72)
  expect(bank.questions.filter((q) => q.category === 'applied').length).toBeGreaterThanOrEqual(72)
})
```

- [ ] 步骤 2：运行确认失败（当前没有 grade3 文件/字段）。

**GREEN**
- [ ] 步骤 3：把现有 `questionBank.json` 移到 `questionBank.grade3.json`，为每条题补 `grade: 3` 和 `format`；给 `index.ts` 增加按年级导入。

- [ ] 步骤 4：扩展生成器，按 `grade` 参数输出文件；三年级新增选择题 builder，覆盖四选一、唯一正确、选项不重复。

```js
const GRADE = Number(process.argv[2] ?? 3)
const questions = buildGrade(GRADE)
writeFileSync(`src/data/content/questionBank.grade${GRADE}.json`, JSON.stringify({ version: '4.0.0', questions }, null, 2))
```

- [ ] 步骤 5：重做三年级应用题情境，至少覆盖购物、时间、长度、运动、动物、班级六类；不得只替换数字。

- [ ] 步骤 6：运行目标测试与内容校验。

```bash
npm run test -- --run tests/data/content/grade3Bank.test.ts
npm run test -- --run tests/data/content
```

**REFACTOR**
- [ ] 步骤 7：抽取题干去重、选项唯一性、应用题下限三个校验函数，删除生成器中的重复断言；重新生成并跑全套。

```bash
node scripts/generate-question-bank.mjs
npm run test
```

**Commit**
- [ ] 步骤 8：提交。

```bash
git add scripts/generate-question-bank.mjs src/data/content/questionBank.grade3.json src/data/content/index.ts tests/data/content/grade3Bank.test.ts
git commit -m "[DSM2001] feat: T3 - rebuild grade 3 bank with choice questions"
```

---

### Task 4：二年级题库

**文件：**
- 创建：`src/data/content/questionBank.grade2.json`
- 修改：`scripts/generate-question-bank.mjs`
- 修改：`src/data/content/index.ts`
- 测试：`tests/data/content/grade2Bank.test.ts`

**RED**
- [ ] 步骤 1：写失败测试，断言 216 题、全部 `grade === 2`、乘法只限口诀范围、除法只限表内除法、相似题同年级。

```ts
import grade2 from '@/data/content/questionBank.grade2.json'
import type { Question } from '@/domain/model/types'

it('二年级不出现三位数乘除', () => {
  const bank = grade2 as { questions: Question[] }
  expect(bank.questions.every((q) => q.grade === 2)).toBe(true)
  expect(bank.questions.filter((q) => q.type === 'mul-div').every((q) => /^[1-9][0-9]?[×÷][1-9]$/.test(q.answer.expression ?? ''))).toBe(true)
})
```

- [ ] 步骤 2：运行确认失败（文件不存在）。

**GREEN**
- [ ] 步骤 3：在生成器中增加二年级 builders：两位数加减、乘法口诀、表内除法、简单两步应用题、未知数、单位/时间、规律。

- [ ] 步骤 4：生成 216 题并补 `format: 'choice'` 至少 72 题；所有 `similarQuestionIds` 只指向 2 年级题。

- [ ] 步骤 5：在 `index.ts` 注册二年级题库；更新 `QUESTION_BANK` 合并数量断言。

- [ ] 步骤 6：运行目标测试。

```bash
node scripts/generate-question-bank.mjs
npm run test -- --run tests/data/content/grade2Bank.test.ts
```

**REFACTOR**
- [ ] 步骤 7：把二年级数值范围抽成 `GRADE2_RANGES`，与生成器/测试共用；跑全套内容测试。

**Commit**
- [ ] 步骤 8：提交。

```bash
git add scripts/generate-question-bank.mjs src/data/content/questionBank.grade2.json src/data/content/index.ts tests/data/content/grade2Bank.test.ts
git commit -m "[DSM2001] feat: T4 - add grade 2 question bank"
```

---

### Task 5：一年级题库与 `number-sense` 题型

**文件：**
- 创建：`src/data/content/questionBank.grade1.json`
- 修改：`src/domain/model/types.ts`（`QuizType` 增加 `number-sense`）
- 修改：`src/shared/quizTypeLabel.ts`
- 修改：`scripts/generate-question-bank.mjs`
- 修改：`src/data/content/index.ts`
- 测试：`tests/data/content/grade1Bank.test.ts`

**RED**
- [ ] 步骤 1：写失败测试，断言 1 年级 216 题、无乘除、`number-sense` 存在、选择题 ≥72、应用题 ≥72。

```ts
import grade1 from '@/data/content/questionBank.grade1.json'
import type { Question } from '@/domain/model/types'

it('一年级不出现乘除法', () => {
  const bank = grade1 as { questions: Question[] }
  expect(bank.questions.some((q) => q.type === 'mul-div')).toBe(false)
  expect(bank.questions.some((q) => q.type === 'number-sense')).toBe(true)
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：在 `QUIZ_TYPES` 与 `QUIZ_TYPE_LABELS` 增加 `number-sense`（“数的认识”），更新所有穷举 switch/测试。

- [ ] 步骤 4：生成一年级题库：20/100 以内加减、数的认识与比较、简单应用题、未知数、单位/时间/位置、规律；禁止乘法/除法/三位数乘除。

- [ ] 步骤 5：在 `index.ts` 注册一年级题库；更新 `QUESTION_BANK` 为 648 题并保留按年级索引。

- [ ] 步骤 6：运行目标测试与全套内容测试。

```bash
node scripts/generate-question-bank.mjs
npm run test -- --run tests/data/content/grade1Bank.test.ts
npm run test -- --run tests/data/content
```

**REFACTOR**
- [ ] 步骤 7：把年级范围抽成 `GRADE_RANGES` 常量，生成器与测试共用；检查报告/错题本对 `number-sense` 标签的显示。

**Commit**
- [ ] 步骤 8：提交。

```bash
git add src/domain/model/types.ts src/shared/quizTypeLabel.ts scripts/generate-question-bank.mjs src/data/content/questionBank.grade1.json src/data/content/index.ts tests/data/content/grade1Bank.test.ts
git commit -m "[DSM2001] feat: T5 - add grade 1 bank and number sense type"
```

---

### Task 6：每日任务按年级过滤、主题选情境、默认 4/4/1

**文件：**
- 修改：`src/domain/quiz/buildDailyQuest.ts`
- 修改：`src/features/home/useHomeQuest.ts`
- 修改：`src/domain/model/types.ts`（`Session`/`SessionStartedEvent` 快照）
- 修改：`src/data/repositories/settingsRepo.ts`
- 修改：`src/features/parentPanel/useParentPanel.ts`
- 测试：`tests/domain/quiz/personalizedQuest.test.ts`

**RED**
- [ ] 步骤 1：写失败测试：1 年级档案不出现 2/3 年级题；主题题至少 2 道；主题不足回退同年级中性题；默认 4/4/1；`session-started` 记录 grade/theme。

```ts
it('按年级硬过滤且至少两道主题题', () => {
  const result = buildDailyQuest({ grade: 1, themeId: 'dinosaur', settings: defaultSettings, history, pool })
  expect(result.session.grade).toBe(1)
  expect(result.session.themeId).toBe('dinosaur')
  expect(result.session.questionIds).toHaveLength(9)
  const themed = result.session.questionIds.filter((id) => pool.find((q) => q.id === id)?.themeStories?.dinosaur)
  expect(themed.length).toBeGreaterThanOrEqual(2)
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：`DailyQuestInput` 增加 `grade`、`themeId`；在切池前执行 `pool.filter((q) => q.grade === grade)`；禁止任何跨年级回退。

- [ ] 步骤 4：增加 `pickThemed()`：优先选 `themeStories[themeId]` 的 applied/probe，缺口用同年级中性题补齐；默认设置改为 `{ basicCount: 4, appliedCount: 4, probeCount: 1 }`，同步 `settingsRepo` 与 `useParentPanel` 的默认值。

- [ ] 步骤 5：`Session`/`SessionStartedEvent` 写 `grade`/`themeId`；`useHomeQuest` 从档案读设置并传入。

- [ ] 步骤 6：运行目标测试与相关回归。

```bash
npm run test -- --run tests/domain/quiz/personalizedQuest.test.ts
npm run test -- --run tests/features/home
```

**REFACTOR**
- [ ] 步骤 7：把“主题题候选 → 补齐 → 排序”抽成纯函数 `selectThemeQuestions`，单测覆盖 0/1/2 道主题题三种情况。

**Commit**
- [ ] 步骤 8：提交。

```bash
git add src/domain/quiz/buildDailyQuest.ts src/features/home/useHomeQuest.ts src/domain/model/types.ts src/data/repositories/settingsRepo.ts src/features/parentPanel/useParentPanel.ts tests/domain/quiz/personalizedQuest.test.ts
git commit -m "[DSM2001] feat: T6 - filter daily quests by grade and theme"
```

---

### Task 7：选择题作答、判题与反馈

**文件：**
- 修改：`src/domain/quiz/answerJudgement.ts`
- 创建：`src/features/quizStage/ChoiceOptions.vue`
- 修改：`src/features/quizStage/QuizStage.vue`
- 修改：`src/features/quizStage/useQuizSession.ts`
- 测试：`tests/domain/quiz/answerJudgement.test.ts`、`tests/features/quizStage/QuizStage.test.ts`

**RED**
- [ ] 步骤 1：写失败测试：选择 `B` 且正确；选择错误选项；开放题声明 `optionId` 被判错；选择题不渲染数字键盘。

```ts
it('选择题按 optionId 判定', () => {
  expect(isCorrect('B', { value: 0, optionId: 'B' })).toBe(true)
  expect(isCorrect('A', { value: 0, optionId: 'B' })).toBe(false)
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：`isCorrect` 先判断 `answer.optionId`，再走原有 numeric/expression 分支；`useQuizSession` 反馈文案显示所选选项与正确选项。

- [ ] 步骤 4：新增 `ChoiceOptions.vue`，用 radio/button 渲染 A–D，`v-model` 写 `draft` 为选项 ID；`QuizStage` 根据 `format` 切换选择题/数字键盘。

```vue
<button v-for="option in question.options" :key="option.id" type="button"
  :data-testid="`choice-${option.id}`" :aria-pressed="modelValue === option.id"
  @click="modelValue = option.id">{{ option.id }}. {{ option.label }}</button>
```

- [ ] 步骤 5：提交后写入 `submitted: 'A'` 等选项 ID；错题/打印按选项 ID 映射文本。

- [ ] 步骤 6：运行目标测试。

```bash
npm run test -- --run tests/domain/quiz/answerJudgement.test.ts
npm run test -- --run tests/features/quizStage
```

**REFACTOR**
- [ ] 步骤 7：把选项 ID → 文本的映射抽成 `choiceLabel(question, id)`，供答题反馈、错题本、打印共用。

**Commit**
- [ ] 步骤 8：提交。

```bash
git add src/domain/quiz/answerJudgement.ts src/features/quizStage/ChoiceOptions.vue src/features/quizStage/QuizStage.vue src/features/quizStage/useQuizSession.ts tests/domain/quiz/answerJudgement.test.ts tests/features/quizStage/QuizStage.test.ts
git commit -m "[DSM2001] feat: T7 - render and judge choice questions"
```

---

### Task 8：档案年级/主题建档、编辑与迁移

**文件：**
- 修改：`src/data/repositories/profileRepo.ts`
- 修改：`src/domain/model/types.ts`（`ProfileCreatedEvent` 补 grade/theme）
- 修改：`src/features/parentPanel/ProfileManageSection.vue`
- 修改：`src/features/parentPanel/useParentPanel.ts`
- 修改：`src/features/profileSelect/ProfileSelectView.vue`
- 修改：`src/views/ParentGateView.vue`（无需改动时跳过）
- 测试：`tests/features/parentPanel/ProfileManageSection.test.ts`、`tests/data/repositories/profileRepo.test.ts`

**RED**
- [ ] 步骤 1：写失败测试：新建档案必须带年级/主题；旧记录读取补默认；家长修改后写 `profile-preferences-updated`；档案卡显示“1 年级 · 恐龙”。

```ts
it('旧档案读取补 3 年级深海', async () => {
  await db.put('profiles', { id: 'p1', nickname: '小海星', avatarId: 'avatar-1', pinHash: 'h', salt: 's', createdAt: 1 })
  expect(await repo.get('p1')).toMatchObject({ grade: 3, themeId: 'deep-sea' })
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：`profileRepo.get/list` 统一调用 `normalizeProfile`；新建档案写入 `grade`/`themeId`，`ProfileCreatedEvent` 同步携带这两个字段（旧事件可选）。

- [ ] 步骤 4：档案管理表单增加年级/主题下拉，`useParentPanel.createProfile` 校验必填并写入；成功文案不变。

- [ ] 步骤 5：新增“学习设置”编辑区或复用设置页，保存时更新档案并 append `profile-preferences-updated`；档案卡显示年级/主题。

- [ ] 步骤 6：第一版档案迁移测试：旧记录打开后显示 3 年级/深海，不丢 PIN/进度。

- [ ] 步骤 7：运行目标测试与家长区回归。

```bash
npm run test -- --run tests/features/parentPanel/ProfileManageSection.test.ts
npm run test -- --run tests/data/repositories/profileRepo.test.ts
```

**REFACTOR**
- [ ] 步骤 8：把年级/主题选项抽成 `PROFILE_GRADES` / `THEME_OPTIONS` 共享常量，家长表单与档案卡共用。

**Commit**
- [ ] 步骤 9：提交。

```bash
git add src/data/repositories/profileRepo.ts src/domain/model/types.ts src/features/parentPanel/ProfileManageSection.vue src/features/parentPanel/useParentPanel.ts src/features/profileSelect/ProfileSelectView.vue tests/features/parentPanel/ProfileManageSection.test.ts tests/data/repositories/profileRepo.test.ts
git commit -m "[DSM2001] feat: T8 - add grade and theme to profile creation and editing"
```

---

### Task 9：三个主题包与深海适配

**文件：**
- 创建：`src/data/content/themePacks.json`
- 创建：`src/data/content/themeSchema.ts`
- 创建：`src/features/bestiary/themeAdapter.ts`
- 修改：`src/data/content/index.ts`
- 测试：`tests/data/content/themePacks.test.ts`、`tests/features/bestiary/themeAdapter.test.ts`

**RED**
- [ ] 步骤 1：写失败测试：3 个主题 ×8 条目、每阶段 2 个、深海 4 个旧条目有 `creatureRef`、每个条目有许可/来源、非法主题键失败。

```ts
it('三个主题各 8 个条目', () => {
  const packs = loadThemePacks()
  expect(packs).toHaveLength(3)
  for (const pack of packs) {
    expect(pack.entries).toHaveLength(8)
    expect([1, 2, 3, 4].every((stage) => pack.entries.filter((e) => e.stage === stage).length === 2)).toBe(true)
  }
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：定义 `ThemePack`/`ThemeEntry` 类型与校验器；`themePacks.json` 写入深海/恐龙/太空 24 个条目。

- [ ] 步骤 4：`themeAdapter.ts` 把深海 4 个 `CREATURE_BANK` 条目映射为 `ThemeEntry`，保留名称、知识卡、来源、模型/照片与许可；新增 4 个深海 2D 条目。

- [ ] 步骤 5：恐龙/太空各 8 个条目使用 `public/themes/<theme>/` 下的 2D 图片；逐条登记 `creditSummary`、`license`、`sourceUrl`。

- [ ] 步骤 6：运行内容/适配器测试。

```bash
npm run test -- --run tests/data/content/themePacks.test.ts
npm run test -- --run tests/features/bestiary/themeAdapter.test.ts
```

**REFACTOR**
- [ ] 步骤 7：把条目许可校验抽成 `assertThemeEntry()`，供主题包与未来内容复用；检查所有图片文件存在且体积 < 500KB。

**Commit**
- [ ] 步骤 8：提交。

```bash
git add src/data/content/themePacks.json src/data/content/themeSchema.ts src/features/bestiary/themeAdapter.ts src/data/content/index.ts tests/data/content/themePacks.test.ts tests/features/bestiary/themeAdapter.test.ts public/themes
git commit -m "[DSM2001] feat: T9 - add three theme packs and deep sea adapter"
```

---

### Task 10：通用四阶段探索与主题图鉴

**文件：**
- 创建：`src/features/bestiary/stageProgress.ts`
- 修改：`src/features/bestiary/useBestiary.ts`
- 修改：`src/features/bestiary/types.ts`
- 修改：`src/views/BestiaryView.vue`
- 修改：`src/views/ObservationView.vue`
- 修改：`src/views/HomeView.vue`、`src/views/MapView.vue`
- 测试：`tests/features/bestiary/stageProgress.test.ts`、`tests/features/bestiary/BestiaryView.test.ts`

**RED**
- [ ] 步骤 1：写失败测试：完成 1 组任务阶段 1、完成 4 组阶段 4、答错不扣、切换主题保留阶段、旧深海解锁保留、阶段 0 全部剪影。

```ts
it('完成四组到达第 4 阶段', () => {
  expect(stageFromCompletedSessions(0)).toBe(0)
  expect(stageFromCompletedSessions(1)).toBe(1)
  expect(stageFromCompletedSessions(4)).toBe(4)
  expect(stageFromCompletedSessions(9)).toBe(4)
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：实现 `stageProgress.ts`：`stage = min(session-completed 数, 4)`；`isEntryUnlocked(entry, stage)`。

- [ ] 步骤 4：`useBestiary` 改为读当前档案 `themeId`，用 `themeAdapter` 取 8 个条目与阶段；旧 `bestiaryUnlock` 的 creature ID 映射到条目并保留解锁。

- [ ] 步骤 5：图鉴页显示当前主题、阶段 0–4、每阶段 2 个条目；未解锁显示剪影与“完成更多任务解锁”；观察页支持 2D 图片与可选 3D。

- [ ] 步骤 6：首页/地图把“深海四区”文案改为通用“探索阶段”，阶段名来自主题包；深海主题保持原四区名。

- [ ] 步骤 7：运行目标测试与用户流程测试。

```bash
npm run test -- --run tests/features/bestiary
npm run test -- --run tests/views 2>/dev/null || npm run test -- --run tests/features
```

**REFACTOR**
- [ ] 步骤 8：删除 `useBestiary` 中深海专用的 zone 逻辑，统一走 `stageProgress`；确保首页与图鉴读同一阶段函数。

**Commit**
- [ ] 步骤 9：提交。

```bash
git add src/features/bestiary/stageProgress.ts src/features/bestiary/useBestiary.ts src/features/bestiary/types.ts src/views/BestiaryView.vue src/views/ObservationView.vue src/views/HomeView.vue src/views/MapView.vue tests/features/bestiary
git commit -m "[DSM2001] feat: T10 - add themed collection and four stage progress"
```

---

### Task 11：错题最后答案投影与打印

**文件：**
- 修改：`src/domain/eventLog/replay.ts`
- 修改：`src/features/mistakeBook/useMistakeBook.ts`
- 修改：`src/features/mistakeBook/MistakeList.vue`
- 创建：`src/views/MistakePrintView.vue`
- 创建：`src/router/routes/MistakesPrintRoute.vue`
- 修改：`src/router/index.ts`
- 创建：`src/styles/print.css`
- 测试：`tests/domain/eventLog/mistakeLastAnswer.test.ts`、`tests/views/MistakePrintView.test.ts`

**RED**
- [ ] 步骤 1：写失败测试：错误提交后 `lastWrongAnswer` 等于提交串；只看答案时为 undefined；打印页包含题干/原答案/正确答案/解析；选择题打印选项；无题时禁用。

```ts
it('记录最后一次错误答案', () => {
  const p = replayProjections([
    answer({ eventId: 'e1', submitted: '7', correct: false }),
  ], { profileId: 'p1' })
  expect(p.mistakeBook.q1.lastWrongAnswer).toBe('7')
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：`MistakeEntry` 增加 `lastWrongAnswer?: string`；在 `answer-submitted` 且 `correct === false` 时更新，保留最后一次。

- [ ] 步骤 4：错题本加“打印错题”按钮，跳转 `/mistakes/print?type=<type>&mastery=<level>`；无结果时禁用。

- [ ] 步骤 5：打印页复用 `useMistakeBook`，题目区 + 答案页；选择题显示选项与所选；解析取题目最后一条提示，没有则显示“暂无解析”。

- [ ] 步骤 6：`print.css` 设置 A4、白底、隐藏导航、`break-inside: avoid`；答案页 `break-before: page`。

- [ ] 步骤 7：运行目标测试。

```bash
npm run test -- --run tests/domain/eventLog/mistakeLastAnswer.test.ts
npm run test -- --run tests/views/MistakePrintView.test.ts
```

**REFACTOR**
- [ ] 步骤 8：把“错题 → 打印块”的映射抽成纯函数，测试覆盖缺失题目、看过答案、选择题四种情况。

**Commit**
- [ ] 步骤 9：提交。

```bash
git add src/domain/eventLog/replay.ts src/features/mistakeBook/useMistakeBook.ts src/features/mistakeBook/MistakeList.vue src/views/MistakePrintView.vue src/router/routes/MistakesPrintRoute.vue src/router/index.ts src/styles/print.css tests/domain/eventLog/mistakeLastAnswer.test.ts tests/views/MistakePrintView.test.ts
git commit -m "[DSM2001] feat: T11 - print filtered mistakes with answers"
```

---

### Task 12：家长区展示、兼容回归、手册与浏览器验收

**文件：**
- 修改：`src/features/parentPanel/FamilyOverviewSection.vue` / `ChildSummaryCard.vue`
- 修改：`src/features/parentPanel/ReportPanel.vue`
- 修改：`docs/parent-guide.md`（v2 章节）
- 修改：`README.md`
- 测试：`tests/features/parentPanel/FamilyOverview.test.ts`、`tests/docs/parentGuideV2.test.ts`
- 验收：无头浏览器脚本（不入库）

**RED**
- [ ] 步骤 1：写失败测试：家长卡显示“年级 · 主题 · 阶段”；报告增加当前主题/阶段；手册 v2 必须包含“年级”“兴趣主题”“错题打印”。

```ts
it('家长卡显示年级主题', () => {
  const child = {
  profileId: 'p1', nickname: '小海星', avatarId: 'avatar-1',
  daysStudied: 3, completedQuestions: 8, averageMs: 48000,
  focusHint: '需要关注：建议多练「乘除法」', grade: 1, themeName: '恐龙', stage: 2,
}
const wrapper = mount(ChildSummaryCard, { props: { child } })
  expect(wrapper.text()).toContain('1 年级 · 恐龙 · 第 2 阶段')
})
```

- [ ] 步骤 2：运行确认失败。

**GREEN**
- [ ] 步骤 3：家长总览卡/报告展示年级、主题、阶段；报告按年级/主题显示当前配置，历史报告仍按题组快照。

- [ ] 步骤 4：更新家长手册 v2：建档选择年级/兴趣、题目匹配规则、主题图鉴与阶段、错题打印步骤、旧档案迁移说明。

- [ ] 步骤 5：更新 README 的阶段范围、题库数量（648）、主题包与打印说明。

- [ ] 步骤 6：跑全套测试、类型检查、构建。

```bash
npm run test
npm run type-check
npm run build
```

- [ ] 步骤 7：无头浏览器验收：1 年级/恐龙建档 → 领题 → 选择题 → 完成 → 阶段 1 解锁 → 切换太空阶段保留 → 错题筛选打印预览；截图保存到 `/tmp`，不提交。

- [ ] 步骤 8：检查旧档案迁移、控制台错误、打印页分页。

**REFACTOR**
- [ ] 步骤 9：删除第一版题库中已迁移的重复内容与过时断言；确认覆盖率 ≥80%，无 `number-sense`/`choice` 未覆盖分支。

**Commit**
- [ ] 步骤 10：提交。

```bash
git add src/features/parentPanel/FamilyOverviewSection.vue src/features/parentPanel/ChildSummaryCard.vue src/features/parentPanel/ReportPanel.vue docs/parent-guide.md README.md tests/features/parentPanel/FamilyOverview.test.ts tests/docs/parentGuideV2.test.ts
git commit -m "[DSM2001] feat: T12 - show personalization in parent area and finish v2 docs"
```

---

## 完成定义

- [ ] 1–3 年级题库各 216 题，共 648 题；所有题带年级，跨年级引用为零。
- [ ] 1 年级不出现乘除；每年级选择题 ≥72、应用题 ≥72。
- [ ] 档案可创建/修改年级与主题；旧档案自动迁移为 3 年级 + 深海。
- [ ] 默认题组 4/4/1；主题题至少 2 道，不足时同年级中性题补齐。
- [ ] 三个主题各 8 个条目，四阶段按完成组数推进，切换主题保留阶段。
- [ ] 错题打印按筛选输出题干/原答案/正确答案/解析，答案单独成页。
- [ ] 第一版 768 用例全部通过，新增用例覆盖 v2，`type-check`/`build` 通过。
- [ ] 家长手册 v2 与 README 更新，浏览器验收截图通过。
