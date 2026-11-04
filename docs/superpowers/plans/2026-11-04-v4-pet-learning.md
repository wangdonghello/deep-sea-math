# v4.0 宠物养成与积分商店 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 v4 分支上，用现有数学题库 + 一只深海小鲸鱼，跑通“做题赚积分 → 商店买食物/玩具 → 喂养互动 → 升级变形”的每日循环。

**架构：** 沿用 v3 的事件日志；新增 `pet-*` / `item-purchased` 事件，用一个**独立的宠物读模型**（不改 v3 的 `replayProjections`）从事件推导积分、XP、背包与状态；UI 新增宠物房间与商店两个路由，宠物用内联 SVG 绘制。

**技术栈：** Vue 3、TypeScript、Vite、Vitest、IndexedDB（复用 v3 `StorageFacade`）、CSS/SVG。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/domain/model/types.ts` | 追加宠物与经济事件类型 |
| `src/data/content/petCatalog.ts` | 宠物物种、名字候选、食物/玩具/装饰、价格与效果 |
| `src/domain/economy/ledger.ts` | 积分推导（答题/整组/订正/消费）与余额校验 |
| `src/domain/pet/growth.ts` | XP 曲线、阶段、饥饿/心情衰减、每日次数上限 |
| `src/domain/pet/petProjection.ts` | 事件 → `PetState` 的独立读模型 |
| `src/features/pet/usePet.ts` | 加载事件、执行领养/孵化/喂食/抚摸/玩耍/购买 |
| `src/features/pet/PetAvatar.vue` | 程序化 SVG 宠物与动画 |
| `src/views/PetRoomView.vue` | 宠物房间（首页） |
| `src/views/ShopView.vue` | 商店 + 背包 |
| `src/router/routes/PetRoute.vue` | 宠物房间路由封装 |
| `src/router/routes/ShopRoute.vue` | 商店路由封装 |
| `src/router/index.ts` | 新增 `/pet`、`/shop`；学习首页改 `/learn` |
| `src/router/nextRoute.ts` | 登录后落点改为 `/pet` |
| `src/views/HomeView.vue` | 保留为学习首页（`/learn`） |
| `tests/domain/economy/ledger.test.ts` | 积分规则与防刷 |
| `tests/domain/pet/growth.test.ts` | 升级曲线、衰减、上限 |
| `tests/domain/pet/petProjection.test.ts` | 事件重放 |
| `tests/features/pet/usePet.test.ts` | 动作与错误 |
| `tests/views/PetRoomView.test.ts` | 房间交互 |
| `tests/views/ShopView.test.ts` | 购买与余额不足 |

---

### 任务 1：追加宠物与经济事件

**文件：**
- 修改：`src/domain/model/types.ts`（`EVENT_TYPES` 与文件末尾的 `DomainEvent` 联合类型）

- [ ] **步骤 1：编写失败的测试**

创建 `tests/domain/model/petEvents.test.ts`：

```ts
import { describe, expect, it } from 'vitest'

import { EVENT_TYPES, type DomainEvent } from '@/domain/model/types'

describe('pet events', () => {
  it('事件类型表包含宠物与经济事件', () => {
    for (const type of ['pet-adopted', 'pet-hatched', 'pet-fed', 'pet-petted', 'pet-played', 'item-purchased']) {
      expect(EVENT_TYPES).toContain(type)
    }
  })

  it('宠物事件可赋给 DomainEvent 联合类型', () => {
    const events: DomainEvent[] = [
      { eventId: 'e1', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { eventId: 'e2', profileId: 'p1', occurredAt: 2, type: 'pet-hatched' },
      { eventId: 'e3', profileId: 'p1', occurredAt: 3, type: 'pet-fed', itemId: 'seaweed-cookie' },
      { eventId: 'e4', profileId: 'p1', occurredAt: 4, type: 'pet-petted' },
      { eventId: 'e5', profileId: 'p1', occurredAt: 5, type: 'pet-played', itemId: 'glow-ball' },
      { eventId: 'e6', profileId: 'p1', occurredAt: 6, type: 'item-purchased', itemId: 'glow-ball', price: 30 },
    ]
    expect(events).toHaveLength(6)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/domain/model/petEvents.test.ts -v`
预期：FAIL，`EVENT_TYPES` 不含 `pet-adopted`，`DomainEvent` 不接受该类型。

- [ ] **步骤 3：编写最少实现代码**

在 `EVENT_TYPES` 末尾追加：

```ts
  'pet-adopted',
  'pet-hatched',
  'pet-fed',
  'pet-petted',
  'pet-played',
  'item-purchased',
```

在 `SettingsUpdatedEvent` 之后、`DifficultyFallbackEvent` 之前追加：

```ts
/** 领养宠物蛋：孩子在 v4 首次进入时自动落一条。 */
export interface PetAdoptedEvent extends EventBase {
  type: 'pet-adopted'
  /** 物种标识（v4.0 固定 `baby-whale`）。 */
  petId: string
  /** 孩子从候选里选的名字。 */
  name: string
}

/** 蛋孵化：完成第一组每日题后落一条。 */
export interface PetHatchedEvent extends EventBase {
  type: 'pet-hatched'
}

/** 喂食：消耗一份食物。 */
export interface PetFedEvent extends EventBase {
  type: 'pet-fed'
  itemId: string
}

/** 抚摸：每天有次数上限。 */
export interface PetPettedEvent extends EventBase {
  type: 'pet-petted'
}

/** 玩耍：需要已拥有的玩具。 */
export interface PetPlayedEvent extends EventBase {
  type: 'pet-played'
  itemId: string
}

/** 购买：价格以事件为准，重放时不看当前目录价。 */
export interface ItemPurchasedEvent extends EventBase {
  type: 'item-purchased'
  itemId: string
  price: number
}
```

在文件末尾的 `DomainEvent` 联合类型中追加这六个接口（保留原有成员）：

```ts
  | PetAdoptedEvent
  | PetHatchedEvent
  | PetFedEvent
  | PetPettedEvent
  | PetPlayedEvent
  | ItemPurchasedEvent
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/domain/model/petEvents.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/model/types.ts tests/domain/model/petEvents.test.ts
git commit -m "feat(v4): add pet and economy events"
```

---

### 任务 2：宠物目录（物种、名字、商品、价格）

**文件：**
- 创建：`src/data/content/petCatalog.ts`
- 测试：`tests/data/content/petCatalog.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { describe, expect, it } from 'vitest'

import { DECOR_ITEMS, FOOD_ITEMS, PET_NAMES, SHOP_ITEMS, petItemById } from '@/data/content/petCatalog'

describe('pet catalog', () => {
  it('食物按价格升序且效果递增', () => {
    expect(FOOD_ITEMS.map((item) => item.price)).toEqual([5, 10, 20])
    expect(FOOD_ITEMS.map((item) => item.xp)).toEqual([8, 18, 40])
    expect(FOOD_ITEMS.map((item) => item.hunger)).toEqual([30, 45, 60])
  })

  it('商品 id 唯一，且能按 id 查到', () => {
    const ids = SHOP_ITEMS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(petItemById('glow-ball')?.kind).toBe('toy')
    expect(petItemById('missing')).toBeUndefined()
  })

  it('名字候选为 5 个且不含空白', () => {
    expect(PET_NAMES).toHaveLength(5)
    for (const name of PET_NAMES) expect(name.trim()).not.toBe('')
  })

  it('共 9 件商品，kind 与所属分类一致', () => {
    expect(SHOP_ITEMS).toHaveLength(9)
    expect(SHOP_ITEMS.filter((item) => item.kind === 'food')).toHaveLength(3)
    expect(SHOP_ITEMS.filter((item) => item.kind === 'toy')).toHaveLength(3)
    expect(SHOP_ITEMS.filter((item) => item.kind === 'decor')).toHaveLength(3)
  })

  it('装饰带联合类型样式值', () => {
    expect(DECOR_ITEMS.map((item) => item.decor)).toEqual(['nest', 'lamp', 'coral'])
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/data/content/petCatalog.test.ts -v`
预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最少实现代码**

```ts
/** 宠物目录：商品、价格、效果与名字候选的唯一真源。 */
export type PetItemKind = 'food' | 'toy' | 'decor'
export type DecorStyleId = 'nest' | 'lamp' | 'coral'

export interface PetItem {
  readonly id: string
  readonly kind: PetItemKind
  readonly name: string
  readonly icon: string
  readonly price: number
  /** 食物：喂食获得的 XP；其他品类为 0。 */
  readonly xp: number
  /** 食物：回复的饥饿值；其他品类为 0。 */
  readonly hunger: number
  /** 宠物房间里的装饰样式标识（decor 专用）。 */
  readonly decor?: DecorStyleId
}

export const PET_NAMES = ['小蓝', '泡泡', '阿潮', '星星', '豆豆'] as const

export const FOOD_ITEMS: readonly PetItem[] = [
  { id: 'seaweed-cookie', kind: 'food', name: '海藻饼干', icon: '🍪', price: 5, xp: 8, hunger: 30 },
  { id: 'krill-pudding', kind: 'food', name: '磷虾布丁', icon: '🍮', price: 10, xp: 18, hunger: 45 },
  { id: 'deep-sea-cake', kind: 'food', name: '深海蛋糕', icon: '🎂', price: 20, xp: 40, hunger: 60 },
]

export const TOY_ITEMS: readonly PetItem[] = [
  { id: 'glow-ball', kind: 'toy', name: '发光球', icon: '🎾', price: 30, xp: 0, hunger: 0 },
  { id: 'coral-rattle', kind: 'toy', name: '珊瑚摇铃', icon: '🔔', price: 45, xp: 0, hunger: 0 },
  { id: 'bubble-maker', kind: 'toy', name: '气泡机', icon: '🫧', price: 60, xp: 0, hunger: 0 },
]

export const DECOR_ITEMS: readonly PetItem[] = [
  { id: 'seaweed-nest', kind: 'decor', name: '海草窝', icon: '🌿', price: 40, xp: 0, hunger: 0, decor: 'nest' },
  { id: 'shell-lamp', kind: 'decor', name: '贝壳灯', icon: '🐚', price: 55, xp: 0, hunger: 0, decor: 'lamp' },
  { id: 'coral-backdrop', kind: 'decor', name: '珊瑚背景', icon: '🪸', price: 80, xp: 0, hunger: 0, decor: 'coral' },
]

export const SHOP_ITEMS: readonly PetItem[] = [...FOOD_ITEMS, ...TOY_ITEMS, ...DECOR_ITEMS]

export function petItemById(id: string): PetItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id)
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/data/content/petCatalog.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/data/content/petCatalog.ts tests/data/content/petCatalog.test.ts
git commit -m "feat(v4): add pet catalog"
```

---

### 任务 3：积分账本（赚取、消费、防刷）

**文件：**
- 创建：`src/domain/economy/ledger.ts`
- 测试：`tests/domain/economy/ledger.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { describe, expect, it } from 'vitest'

import { resolveLedger } from '@/domain/economy/ledger'
import type { DomainEvent } from '@/domain/model/types'

const day = 86_400_000

function answer(id: string, qid: string, at: number, overrides: Partial<{ correct: boolean; hint: number; retry: number }> = {}): DomainEvent {
  return {
    eventId: `a-${id}`, profileId: 'p1', occurredAt: at, type: 'answer-submitted',
    sessionId: 's1', questionId: qid, submitted: '1',
    correct: overrides.correct ?? true, usedHintLevel: overrides.hint ?? 0,
    retryCount: overrides.retry ?? 0, ms: 100,
  }
}

describe('resolveLedger', () => {
  it('独立答对每题 +1，同一天同题不重复', () => {
    const events = [answer('1', 'q1', 0), answer('2', 'q1', 1), answer('3', 'q2', 2)]
    expect(resolveLedger(events, 'p1').balance).toBe(2)
  })

  it('用提示或重试的答对不计分', () => {
    const events = [answer('1', 'q1', 0, { hint: 1 }), answer('2', 'q2', 0, { retry: 1 })]
    expect(resolveLedger(events, 'p1').balance).toBe(0)
  })

  it('整组完成 +5，正确率 ≥80% 再 +3', () => {
    const events: DomainEvent[] = [
      ...Array.from({ length: 9 }, (_, i) => answer(`${i}`, `q${i}`, i)),
      { eventId: 'c1', profileId: 'p1', occurredAt: 10, type: 'session-completed', sessionId: 's1', rewards: [] },
    ]
    expect(resolveLedger(events, 'p1').balance).toBe(17)
  })

  it('订正每天最多 5 题，购物流水扣减余额', () => {
    const corrections: DomainEvent[] = Array.from({ length: 8 }, (_, i) => ({
      eventId: `fix-${i}`, profileId: 'p1', occurredAt: i, type: 'correction-done',
      sessionId: 's1', questionId: `q${i}`, similarQuestionId: `s${i}`,
    }))
    const purchase: DomainEvent = {
      eventId: 'buy', profileId: 'p1', occurredAt: day, type: 'item-purchased', itemId: 'glow-ball', price: 5,
    }
    const ledger = resolveLedger([...corrections, purchase], 'p1')
    // 订正 8 题只算 5 题 = 10 分，买 5 分 → 余额 5。
    expect(ledger.balance).toBe(5)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/domain/economy/ledger.test.ts -v`
预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最少实现代码**

```ts
import type { DomainEvent } from '@/domain/model/types'

/** 每道题/每天的基础积分。 */
const POINTS_PER_INDEPENDENT_CORRECT = 1
const POINTS_PER_COMPLETION = 5
const ACCURACY_BONUS = 3
const ACCURACY_THRESHOLD = 0.8
const POINTS_PER_CORRECTION = 2
const MAX_CORRECTIONS_PER_DAY = 5

export interface Ledger {
  readonly balance: number
  readonly earned: number
  readonly spent: number
}

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

function independentAnswer(event: DomainEvent): boolean {
  return event.type === 'answer-submitted' && event.correct && event.usedHintLevel === 0 && event.retryCount === 0
}

/** 从事件推导积分余额；购买价格以事件为准。 */
export function resolveLedger(events: readonly DomainEvent[], profileId: string): Ledger {
  const scoped = events.filter((event) => event.profileId === profileId)
  const answered = new Set<string>()
  const correctionsByDay = new Map<string, number>()
  let earned = 0
  let spent = 0

  const totalBySession = new Map<string, number>()
  const correctBySession = new Map<string, number>()
  for (const event of scoped) {
    if (event.type === 'session-started') {
      totalBySession.set(event.sessionId, new Set(event.questionIds).size)
    }
  }

  for (const event of scoped) {
    if (event.type === 'answer-submitted' && independentAnswer(event)) {
      const key = `${dayKey(event.occurredAt)}:${event.questionId}`
      if (!answered.has(key)) {
        answered.add(key)
        earned += POINTS_PER_INDEPENDENT_CORRECT
      }
      const count = (correctBySession.get(event.sessionId) ?? 0) + 1
      correctBySession.set(event.sessionId, count)
    }
    if (event.type === 'session-completed') {
      earned += POINTS_PER_COMPLETION
      const total = totalBySession.get(event.sessionId) ?? 0
      const correct = correctBySession.get(event.sessionId) ?? 0
      if (total > 0 && correct / total >= ACCURACY_THRESHOLD) earned += ACCURACY_BONUS
    }
    if (event.type === 'correction-done') {
      const day = dayKey(event.occurredAt)
      const used = correctionsByDay.get(day) ?? 0
      if (used < MAX_CORRECTIONS_PER_DAY) {
        correctionsByDay.set(day, used + 1)
        earned += POINTS_PER_CORRECTION
      }
    }
    if (event.type === 'item-purchased') spent += event.price
  }

  return { balance: earned - spent, earned, spent }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/domain/economy/ledger.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/economy/ledger.ts tests/domain/economy/ledger.test.ts
git commit -m "feat(v4): add points ledger"
```

---

### 任务 4：成长曲线、阶段与衰减

**文件：**
- 创建：`src/domain/pet/growth.ts`
- 测试：`tests/domain/pet/growth.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { describe, expect, it } from 'vitest'

import { decayedHunger, levelFromXp, stageFromLevel, xpForNextLevel } from '@/domain/pet/growth'

describe('pet growth', () => {
  it('升级所需 XP 为 40 + 15N', () => {
    expect(xpForNextLevel(1)).toBe(55)
    expect(xpForNextLevel(14)).toBe(250)
  })

  it('按累计 XP 计算等级与阶段', () => {
    expect(levelFromXp(0)).toBe(0)
    expect(levelFromXp(40)).toBe(1)
    expect(levelFromXp(95)).toBe(2)
    expect(stageFromLevel(0)).toBe('egg')
    expect(stageFromLevel(1)).toBe('baby')
    expect(stageFromLevel(5)).toBe('juvenile')
    expect(stageFromLevel(10)).toBe('adult')
    expect(stageFromLevel(15)).toBe('final')
  })

  it('饥饿按小时衰减但不低于 0', () => {
    const now = 10 * 3_600_000
    expect(decayedHunger(100, 0, now)).toBe(80)
    expect(decayedHunger(5, 0, now)).toBe(0)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/domain/pet/growth.test.ts -v`
预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最少实现代码**

```ts
export type PetStage = 'egg' | 'baby' | 'juvenile' | 'adult' | 'final'

const DECAY_PER_HOUR = 2
const MIN_STAT = 0
const MAX_STAT = 100

/** 从 Lv N 升到 N+1 所需 XP。 */
export function xpForNextLevel(level: number): number {
  return 40 + 15 * level
}

/** 累计 XP → 当前等级（封顶 15）。 */
export function levelFromXp(xp: number): number {
  let level = 0
  let remaining = Math.max(0, xp)
  while (level < 15 && remaining >= xpForNextLevel(level + 1)) {
    remaining -= xpForNextLevel(level + 1)
    level += 1
  }
  return level
}

export function stageFromLevel(level: number): PetStage {
  if (level <= 0) return 'egg'
  if (level < 5) return 'baby'
  if (level < 10) return 'juvenile'
  if (level < 15) return 'adult'
  return 'final'
}

/** 按经过的小时数衰减；不惩罚，最低 0。 */
export function decayedHunger(hunger: number, updatedAt: number, now: number): number {
  const hours = Math.max(0, (now - updatedAt) / 3_600_000)
  return Math.max(MIN_STAT, Math.min(MAX_STAT, hunger - hours * DECAY_PER_HOUR))
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/domain/pet/growth.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/pet/growth.ts tests/domain/pet/growth.test.ts
git commit -m "feat(v4): add pet growth rules"
```

---

### 任务 5：宠物读模型（事件 → PetState）

**文件：**
- 创建：`src/domain/pet/petProjection.ts`
- 测试：`tests/domain/pet/petProjection.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { describe, expect, it } from 'vitest'

import { replayPet } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

const base = { profileId: 'p1' }

describe('replayPet', () => {
  it('领养 → 孵化 → 状态就绪', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      { ...base, eventId: 'b', occurredAt: 2, type: 'pet-hatched' },
    ]
    const pet = replayPet(events, 'p1', 3)
    expect(pet.adopted).toBe(true)
    expect(pet.hatched).toBe(true)
    expect(pet.name).toBe('小蓝')
    expect(pet.stage).toBe('egg')
  })

  it('喂食扣背包、加 XP 与饥饿', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      ...Array.from({ length: 5 }, (_, i) => ({
        ...base, eventId: `ans-${i}`, occurredAt: 2 + i, type: 'answer-submitted' as const,
        sessionId: 's1', questionId: `q${i}`, submitted: '1', correct: true,
        usedHintLevel: 0, retryCount: 0, ms: 10,
      })),
      { ...base, eventId: 'b', occurredAt: 8, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
      { ...base, eventId: 'c', occurredAt: 9, type: 'pet-fed', itemId: 'seaweed-cookie' },
    ]
    const pet = replayPet(events, 'p1', 10)
    expect(pet.inventory['seaweed-cookie']).toBe(0)
    expect(pet.xp).toBe(8)
    expect(pet.points).toBe(0)
  })

  it('抚摸每天最多 5 次，超出不增加 XP', () => {
    const events: DomainEvent[] = [
      { ...base, eventId: 'a', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      ...Array.from({ length: 7 }, (_, i) => ({ ...base, eventId: `p${i}`, occurredAt: i + 2, type: 'pet-petted' as const })),
    ]
    expect(replayPet(events, 'p1', 20).xp).toBe(10)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/domain/pet/petProjection.test.ts -v`
预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最少实现代码**

```ts
import { resolveLedger } from '@/domain/economy/ledger'
import { petItemById } from '@/data/content/petCatalog'
import { levelFromXp, stageFromLevel, type PetStage } from './growth'
import type { DomainEvent } from '@/domain/model/types'

export interface PetState {
  readonly adopted: boolean
  readonly hatched: boolean
  readonly petId: string | null
  readonly name: string
  readonly xp: number
  readonly level: number
  readonly stage: PetStage
  readonly points: number
  readonly inventory: Readonly<Record<string, number>>
  readonly owned: readonly string[]
  readonly hunger: number
  readonly mood: number
  readonly lastUpdatedAt: number
}

const MAX_PET_PER_DAY = 5
const MAX_PLAY_PER_DAY = 2

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/** 独立事件重放：不改 v3 的 projection，避免影响现有功能。 */
export function replayPet(events: readonly DomainEvent[], profileId: string, now: number): PetState {
  const scoped = events.filter((event) => event.profileId === profileId)
  const ledger = resolveLedger(scoped, profileId)
  let adopted = false
  let hatched = false
  let petId: string | null = null
  let name = ''
  let xp = 0
  let hunger = 70
  let mood = 70
  let lastUpdatedAt = now
  const inventory: Record<string, number> = {}
  const owned = new Set<string>()
  const petCount = new Map<string, number>()
  const playCount = new Map<string, number>()
  const completedDays = new Set<string>()

  for (const event of scoped) {
    lastUpdatedAt = Math.max(lastUpdatedAt, event.occurredAt)
    if (event.type === 'pet-adopted') {
      adopted = true
      petId = event.petId
      name = event.name
    }
    if (event.type === 'pet-hatched') hatched = true
    if (event.type === 'item-purchased') {
      const item = petItemById(event.itemId)
      if (item?.kind === 'food') inventory[item.id] = (inventory[item.id] ?? 0) + 1
      else owned.add(event.itemId)
    }
    if (event.type === 'pet-fed') {
      const item = petItemById(event.itemId)
      if (item?.kind === 'food') {
        inventory[item.id] = Math.max(0, (inventory[item.id] ?? 0) - 1)
        xp += item.xp
        hunger = Math.min(100, hunger + item.hunger)
        mood = Math.min(100, mood + 10)
      }
    }
    if (event.type === 'pet-petted') {
      const day = dayKey(event.occurredAt)
      const used = petCount.get(day) ?? 0
      if (used < MAX_PET_PER_DAY) {
        petCount.set(day, used + 1)
        xp += 2
        mood = Math.min(100, mood + 8)
      }
    }
    if (event.type === 'pet-played') {
      const day = dayKey(event.occurredAt)
      const used = playCount.get(day) ?? 0
      if (owned.has(event.itemId) && used < MAX_PLAY_PER_DAY) {
        playCount.set(day, used + 1)
        xp += 6
        mood = Math.min(100, mood + 20)
      }
    }
    if (event.type === 'session-completed') {
      const day = dayKey(event.occurredAt)
      if (!completedDays.has(day)) {
        completedDays.add(day)
        xp += 15
      }
    }
  }

  const level = levelFromXp(xp)
  return {
    adopted, hatched, petId, name, xp, level, stage: stageFromLevel(level),
    points: ledger.balance, inventory, owned: [...owned], hunger, mood, lastUpdatedAt,
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/domain/pet/petProjection.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/pet/petProjection.ts tests/domain/pet/petProjection.test.ts
git commit -m "feat(v4): add pet read model"
```

---

### 任务 6：usePet 组合式（动作与错误）

**文件：**
- 创建：`src/features/pet/usePet.ts`
- 测试：`tests/features/pet/usePet.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { describe, expect, it } from 'vitest'

import { usePet } from '@/features/pet/usePet'
import type { DomainEvent } from '@/domain/model/types'

function memoryStore(initial: DomainEvent[] = []) {
  const events = [...initial]
  return {
    events,
    async listEvents() { return [...events] },
    async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return incoming },
  }
}

describe('usePet', () => {
  it('首次加载自动补 pet-adopted 事件', async () => {
    const store = memoryStore()
    const pet = usePet({ store, profileId: 'p1', clock: () => 10, name: '小蓝' })
    await pet.load()
    expect(store.events.some((event) => event.type === 'pet-adopted')).toBe(true)
    expect(pet.state.value.name).toBe('小蓝')
  })

  it('余额不足时购买抛错且不落事件', async () => {
    const store = memoryStore([
      { eventId: 'a', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
    ])
    const pet = usePet({ store, profileId: 'p1', clock: () => 2 })
    await pet.load()
    await expect(pet.buy('glow-ball')).rejects.toThrow('积分不足')
    expect(store.events.some((event) => event.type === 'item-purchased')).toBe(false)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/features/pet/usePet.test.ts -v`
预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最少实现代码**

```ts
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { petItemById } from '@/data/content/petCatalog'
import { replayPet, type PetState } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

export interface PetStore {
  listEvents(profileId: string): Promise<readonly DomainEvent[]>
  appendEvents(events: readonly DomainEvent[]): Promise<readonly DomainEvent[]>
}

export function usePet(options: {
  store: PetStore
  profileId: MaybeRefOrGetter<string | null>
  clock?: () => number
  name?: string
}) {
  const clock = options.clock ?? (() => Date.now())
  const events = ref<readonly DomainEvent[]>([])
  const loading = ref(false)
  const error = ref('')
  const state = computed<PetState>(() => replayPet(events.value, toValue(options.profileId) ?? '', clock()))

  async function load(): Promise<void> {
    const profileId = toValue(options.profileId)
    if (profileId === null) return
    loading.value = true
    error.value = ''
    try {
      events.value = await options.store.listEvents(profileId)
      if (!events.value.some((event) => event.type === 'pet-adopted')) {
        await append([{
          eventId: `adopt-${profileId}`, profileId, occurredAt: clock(),
          type: 'pet-adopted', petId: 'baby-whale', name: options.name ?? '小蓝',
        }])
      }
      if (!events.value.some((event) => event.type === 'pet-hatched') &&
          events.value.some((event) => event.type === 'session-completed')) {
        await append([{
          eventId: `hatch-${profileId}`, profileId, occurredAt: clock(), type: 'pet-hatched',
        }])
      }
    } catch {
      error.value = '宠物暂时打不开，请稍后再试'
    } finally {
      loading.value = false
    }
  }

  async function append(incoming: readonly DomainEvent[]): Promise<void> {
    await options.store.appendEvents(incoming)
    events.value = [...events.value, ...incoming]
  }

  function base() {
    const profileId = toValue(options.profileId)
    if (profileId === null) throw new Error('没有选择档案')
    return { profileId, occurredAt: clock() }
  }

  async function buy(itemId: string): Promise<void> {
    const item = petItemById(itemId)
    if (item === undefined) throw new Error('商品不存在')
    if (!state.value.adopted) throw new Error('还没有宠物')
    const current = state.value
    if (item.kind !== 'food' && current.owned.includes(itemId)) throw new Error('已经拥有')
    if (current.points < item.price) throw new Error('积分不足')
    await append([{ ...base(), eventId: `buy-${itemId}-${clock()}-${events.value.length}`, type: 'item-purchased', itemId, price: item.price }])
  }

  async function feed(itemId: string): Promise<void> {
    if ((state.value.inventory[itemId] ?? 0) <= 0) throw new Error('背包里没有这个食物')
    await append([{ ...base(), eventId: `feed-${itemId}-${clock()}-${events.value.length}`, type: 'pet-fed', itemId }])
  }

  async function pet(): Promise<void> {
    await append([{ ...base(), eventId: `pet-${clock()}-${events.value.length}`, type: 'pet-petted' }])
  }

  async function play(itemId: string): Promise<void> {
    if (!state.value.owned.includes(itemId)) throw new Error('还没有这个玩具')
    await append([{ ...base(), eventId: `play-${itemId}-${clock()}-${events.value.length}`, type: 'pet-played', itemId }])
  }

  watch(() => toValue(options.profileId), () => { void load() }, { immediate: true })
  return { events, state, loading, error, load, buy, feed, pet, play }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/features/pet/usePet.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/features/pet/usePet.ts tests/features/pet/usePet.test.ts
git commit -m "feat(v4): add pet composable"
```

---

### 任务 7：SVG 宠物组件

**文件：**
- 创建：`src/features/pet/PetAvatar.vue`
- 测试：`tests/features/pet/PetAvatar.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PetAvatar from '@/features/pet/PetAvatar.vue'

describe('PetAvatar', () => {
  it('按阶段渲染不同形态并带可访问名称', () => {
    const baby = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    expect(baby.get('svg').attributes('role')).toBe('img')
    expect(baby.get('[data-stage="baby"]').exists()).toBe(true)

    const egg = mount(PetAvatar, { props: { stage: 'egg', mood: 80 } })
    expect(egg.get('[data-stage="egg"]').exists()).toBe(true)
  })

  it('点击时发出 tap 事件并带挤压动画类', async () => {
    const view = mount(PetAvatar, { props: { stage: 'baby', mood: 80 } })
    await view.get('[data-testid="pet-tap"]').trigger('click')
    expect(view.emitted('tap')).toHaveLength(1)
    expect(view.get('[data-testid="pet-tap"]').classes()).toContain('is-squish')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/features/pet/PetAvatar.test.ts -v`
预期：FAIL，组件不存在。

- [ ] **步骤 3：编写最少实现代码**

```vue
<script setup lang="ts">
import { ref } from 'vue'

import type { PetStage } from '@/domain/pet/growth'

const props = defineProps<{ stage: PetStage; mood: number }>()
const emit = defineEmits<{ (event: 'tap'): void }>()
const squish = ref(false)

function tap(): void {
  squish.value = true
  window.setTimeout(() => { squish.value = false }, 220)
  emit('tap')
}
</script>

<template>
  <button type="button" class="pet-avatar" :class="{ 'is-squish': squish }" data-testid="pet-tap"
    :aria-label="`宠物，心情 ${props.mood}`" @click="tap">
    <svg viewBox="0 0 320 280" role="img" :data-stage="stage" aria-hidden="true">
      <defs>
        <linearGradient id="pet-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7fd8ff" />
          <stop offset="100%" stop-color="#2f7fd4" />
        </linearGradient>
        <radialGradient id="pet-belly" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#f4fbff" />
          <stop offset="100%" stop-color="#c7e9ff" />
        </radialGradient>
      </defs>

      <ellipse cx="160" cy="248" rx="86" ry="14" fill="#04121f" opacity=".35" />

      <template v-if="stage === 'egg'">
        <ellipse cx="160" cy="160" rx="62" ry="76" fill="#eaf6ff" />
        <path d="M110 190 Q160 210 210 190" stroke="#9fd0e8" stroke-width="3" fill="none" />
        <circle cx="145" cy="150" r="4" fill="#2f7fd4" />
        <circle cx="176" cy="150" r="4" fill="#2f7fd4" />
      </template>

      <template v-else>
        <ellipse cx="160" cy="160" rx="92" ry="64" fill="url(#pet-body)" />
        <ellipse cx="160" cy="176" rx="66" ry="42" fill="url(#pet-belly)" />
        <path d="M238 150 Q268 128 258 172 Q250 196 232 182 Z" fill="#2f7fd4" />
        <path d="M96 150 Q66 128 76 172 Q84 196 102 182 Z" fill="#2f7fd4" />
        <circle cx="136" cy="148" r="13" fill="#062033" />
        <circle cx="186" cy="148" r="13" fill="#062033" />
        <circle cx="141" cy="143" r="5" fill="#fff" />
        <circle cx="191" cy="143" r="5" fill="#fff" />
        <ellipse cx="120" cy="172" rx="8" ry="5" fill="#ffb3c1" opacity=".8" />
        <ellipse cx="200" cy="172" rx="8" ry="5" fill="#ffb3c1" opacity=".8" />
        <path d="M152 176 Q160 184 168 176" stroke="#0b3550" stroke-width="3" fill="none" stroke-linecap="round" />
        <circle v-if="mood < 40" cx="212" cy="120" r="4" fill="#bfe9ff" opacity=".9" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.pet-avatar {
  display: block;
  width: min(78vw, 22rem);
  margin: 0 auto;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  animation: breathe 3.2s ease-in-out infinite;
  transform-origin: 50% 85%;
}

.pet-avatar.is-squish { animation: squish .22s ease-out; }

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02, .98); }
}

@keyframes squish {
  0% { transform: scale(1); }
  40% { transform: scale(1.08, .9); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .pet-avatar { animation: none; }
}
</style>
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/features/pet/PetAvatar.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/features/pet/PetAvatar.vue tests/features/pet/PetAvatar.test.ts
git commit -m "feat(v4): add svg pet avatar"
```

---

### 任务 8：宠物房间视图

**文件：**
- 创建：`src/views/PetRoomView.vue`
- 测试：`tests/views/PetRoomView.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PetRoomView from '@/views/PetRoomView.vue'
import type { DomainEvent } from '@/domain/model/types'

const baseEvents: readonly DomainEvent[] = [
  { eventId: 'a', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
  { eventId: 'b', profileId: 'p1', occurredAt: 2, type: 'pet-hatched' },
  { eventId: 'c', profileId: 'p1', occurredAt: 3, type: 'item-purchased', itemId: 'seaweed-cookie', price: 5 },
  ...Array.from({ length: 6 }, (_, i) => ({
    eventId: `ans-${i}`, profileId: 'p1', occurredAt: 4 + i, type: 'answer-submitted' as const,
    sessionId: 's1', questionId: `q${i}`, submitted: '1', correct: true,
    usedHintLevel: 0, retryCount: 0, ms: 10,
  })),
]

/** 每个用例一份独立事件流，避免喂食用例污染展示用例。 */
function makeStore() {
  const events = [...baseEvents]
  return {
    async listEvents() { return [...events] },
    async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return incoming },
  }
}

describe('PetRoomView', () => {
  it('展示宠物、积分与喂食按钮', async () => {
    const view = mount(PetRoomView, {
      props: { profileId: 'p1', store: makeStore(), clock: () => 10 },
    })
    await flushPromises()
    expect(view.get('[data-testid="pet-name"]').text()).toContain('小蓝')
    expect(view.get('[data-testid="pet-points"]').text()).toContain('1')
    expect(view.get('[data-testid="feed-seaweed-cookie"]').exists()).toBe(true)
    expect(view.get('[data-testid="pet-room"]').attributes('data-decor')).toBe('plain')
  })

  it('点喂食后食物数量减少、XP 增加', async () => {
    const view = mount(PetRoomView, { props: { profileId: 'p1', store: makeStore(), clock: () => 20 } })
    await flushPromises()
    await view.get('[data-testid="feed-seaweed-cookie"]').trigger('click')
    await flushPromises()
    expect(view.get('[data-testid="pet-xp"]').text()).toContain('8')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/views/PetRoomView.test.ts -v`
预期：FAIL，视图不存在。

- [ ] **步骤 3：编写最少实现代码**

```vue
<script setup lang="ts">
import { computed } from 'vue'

import PetAvatar from '@/features/pet/PetAvatar.vue'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import { usePet, type PetStore } from '@/features/pet/usePet'
import { FOOD_ITEMS, TOY_ITEMS } from '@/data/content/petCatalog'
import { decayedHunger } from '@/domain/pet/growth'

const props = defineProps<{ profileId: string | null; store: PetStore; clock?: () => number }>()
const emit = defineEmits<{ (event: 'start-quest'): void; (event: 'open-shop'): void; (event: 'back-home'): void }>()

const pet = usePet({ store: props.store, profileId: computed(() => props.profileId), clock: props.clock })
const hunger = computed(() => decayedHunger(pet.state.value.hunger, pet.state.value.lastUpdatedAt, (props.clock ?? Date.now)()))

const foodInBag = computed(() => FOOD_ITEMS.filter((item) => (pet.state.value.inventory[item.id] ?? 0) > 0))
const ownedToys = computed(() => TOY_ITEMS.filter((item) => pet.state.value.owned.includes(item.id)))

/** 装饰直接改变房间背景，买了就能看见。 */
const decor = computed(() => {
  const owned = pet.state.value.owned
  if (owned.includes('coral-backdrop')) return 'coral'
  if (owned.includes('shell-lamp')) return 'lamp'
  if (owned.includes('seaweed-nest')) return 'nest'
  return 'plain'
})

async function feed(itemId: string): Promise<void> { await pet.feed(itemId) }
async function play(itemId: string): Promise<void> { await pet.play(itemId) }
</script>

<template>
  <main class="pet-room" data-testid="pet-room" :data-decor="decor">
    <header class="pet-room__hud">
      <strong data-testid="pet-name">{{ pet.state.value.name || '还没有宠物' }}</strong>
      <span>Lv.{{ pet.state.value.level }}</span>
      <span data-testid="pet-points">积分 {{ pet.state.value.points }}</span>
    </header>
    <p class="pet-room__stats">
      心情 {{ pet.state.value.mood }} · 饥饿 {{ Math.round(hunger) }}/100
      <span data-testid="pet-xp">XP {{ pet.state.value.xp }}</span>
    </p>

    <PetAvatar :stage="pet.state.value.stage" :mood="pet.state.value.mood" @tap="pet.pet()" />

    <section class="pet-room__actions">
      <button v-for="item in foodInBag" :key="item.id" type="button"
        :data-testid="`feed-${item.id}`" @click="feed(item.id)">
        {{ item.icon }} 喂 {{ item.name }}
      </button>
      <button v-for="item in ownedToys" :key="item.id" type="button"
        :data-testid="`play-${item.id}`" @click="play(item.id)">
        {{ item.icon }} 玩 {{ item.name }}
      </button>
      <button type="button" data-testid="pet-pet" @click="pet.pet()">🤚 抚摸</button>
      <button type="button" data-testid="open-shop" @click="emit('open-shop')">🛒 商店</button>
    </section>

    <button type="button" class="pet-room__quest" data-testid="start-quest" @click="emit('start-quest')">
      今日探险 · 9 题 →
    </button>

    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.pet-room { display: grid; gap: var(--ds-space-md); min-height: 100dvh; padding: var(--ds-space-lg); color: var(--ds-text-primary); }
.pet-room__hud, .pet-room__stats { display: flex; gap: var(--ds-space-sm); align-items: center; justify-content: space-between; margin: 0; }
.pet-room__actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); justify-content: center; }
.pet-room[data-decor="coral"] { background: radial-gradient(circle at 50% 20%, #16405c, #07121f 70%); }
.pet-room[data-decor="lamp"] { background: radial-gradient(circle at 50% 10%, #2a3a2a, #07121f 70%); }
.pet-room[data-decor="nest"] { background: radial-gradient(circle at 50% 80%, #12352c, #07121f 70%); }

.pet-room__quest { min-height: 3rem; border-radius: var(--ds-radius-md); border: 1px solid var(--ds-accent-500); background: var(--ds-glass-surface); color: var(--ds-text-primary); font-weight: 700; }
</style>
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/views/PetRoomView.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/views/PetRoomView.vue tests/views/PetRoomView.test.ts
git commit -m "feat(v4): add pet room view"
```

---

### 任务 9：商店与背包

**文件：**
- 创建：`src/views/ShopView.vue`
- 测试：`tests/views/ShopView.test.ts`

- [ ] **步骤 1：编写失败的测试**

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShopView from '@/views/ShopView.vue'
import type { DomainEvent } from '@/domain/model/types'

function storeWith(events: DomainEvent[]) {
  return {
    async listEvents() { return [...events] },
    async appendEvents(incoming: readonly DomainEvent[]) { events.push(...incoming); return incoming },
  }
}

const adopted: DomainEvent = { eventId: 'a', profileId: 'p1', occurredAt: 1, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' }

describe('ShopView', () => {
  it('余额不足时购买按钮禁用', async () => {
    const view = mount(ShopView, { props: { profileId: 'p1', store: storeWith([adopted]), clock: () => 2 } })
    await flushPromises()
    expect(view.get('[data-testid="buy-glow-ball"]').attributes('disabled')).toBeDefined()
  })

  it('余额足够时购买成功并显示已拥有', async () => {
    const rich: DomainEvent[] = [
      adopted,
      ...Array.from({ length: 30 }, (_, i) => ({
        eventId: `ans-${i}`, profileId: 'p1', occurredAt: i + 2, type: 'answer-submitted' as const,
        sessionId: 's1', questionId: `q${i}`, submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10,
      })),
    ]
    const view = mount(ShopView, { props: { profileId: 'p1', store: storeWith(rich), clock: () => 100 } })
    await flushPromises()
    await view.get('[data-testid="buy-glow-ball"]').trigger('click')
    await flushPromises()
    expect(view.get('[data-testid="buy-glow-ball"]').text()).toContain('已拥有')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/views/ShopView.test.ts -v`
预期：FAIL，视图不存在。

- [ ] **步骤 3：编写最少实现代码**

```vue
<script setup lang="ts">
import { computed } from 'vue'

import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import { usePet, type PetStore } from '@/features/pet/usePet'
import { DECOR_ITEMS, FOOD_ITEMS, TOY_ITEMS, type PetItem } from '@/data/content/petCatalog'

const props = defineProps<{ profileId: string | null; store: PetStore; clock?: () => number }>()
const emit = defineEmits<{ (event: 'back-home'): void }>()

const pet = usePet({ store: props.store, profileId: computed(() => props.profileId), clock: props.clock })
const sections = [
  { id: 'food', title: '食物', items: FOOD_ITEMS },
  { id: 'toy', title: '玩具', items: TOY_ITEMS },
  { id: 'decor', title: '装饰', items: DECOR_ITEMS },
] as const

function owned(item: PetItem): boolean {
  return pet.state.value.owned.includes(item.id)
}

function canBuy(item: PetItem): boolean {
  return pet.state.value.points >= item.price && !owned(item)
}

async function buy(item: PetItem): Promise<void> {
  try { await pet.buy(item.id) } catch { /* 错误由按钮禁用兜底 */ }
}
</script>

<template>
  <main class="shop" data-testid="shop">
    <header class="shop__hud">
      <h1>商店</h1>
      <span data-testid="shop-points">积分 {{ pet.state.value.points }}</span>
    </header>

    <section v-for="section in sections" :key="section.id" :data-testid="`shop-${section.id}`">
      <h2>{{ section.title }}</h2>
      <ul class="shop__grid">
        <li v-for="item in section.items" :key="item.id" class="shop__card">
          <span class="shop__icon">{{ item.icon }}</span>
          <strong>{{ item.name }}</strong>
          <span>{{ item.price }} 分</span>
          <span v-if="item.kind === 'food'">+{{ item.xp }} XP · 饱食 +{{ item.hunger }}</span>
          <button type="button" :data-testid="`buy-${item.id}`" :disabled="!canBuy(item)" @click="buy(item)">
            {{ owned(item) ? '已拥有' : canBuy(item) ? '购买' : '积分不足' }}
          </button>
        </li>
      </ul>
    </section>

    <BottomReturnButton @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.shop { display: grid; gap: var(--ds-space-lg); padding: var(--ds-space-lg); color: var(--ds-text-primary); }
.shop__hud { display: flex; justify-content: space-between; align-items: center; }
.shop__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: var(--ds-space-sm); margin: 0; padding: 0; list-style: none; }
.shop__card { display: grid; gap: 4px; justify-items: center; padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: var(--ds-glass-surface); text-align: center; }
.shop__icon { font-size: 2rem; }
</style>
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/views/ShopView.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/views/ShopView.vue tests/views/ShopView.test.ts
git commit -m "feat(v4): add shop view"
```

---

### 任务 10：路由与导航（宠物为主页）

**文件：**
- 创建：`src/router/routes/PetRoute.vue`、`src/router/routes/ShopRoute.vue`
- 修改：`src/router/index.ts`、`src/router/nextRoute.ts`、`src/views/HomeView.vue`（学习首页）、`src/app/productionStores.ts`（新增 pet 适配）、`tests/router/nextRoute.test.ts`、`tests/App.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `tests/router/nextRoute.test.ts` 增加：

```ts
it('已选档案时默认落到宠物房间', () => {
  expect(nextRoute({ path: '/profiles', hasProfile: true, parentUnlocked: false })).toBe('/pet')
})
```

在 `tests/App.test.ts` 的页面可达性用例（`for (const [path, testid] of [...] as const)`）中加入：

```ts
      ['/pet', 'pet-room'],
      ['/shop', 'shop'],
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/router/nextRoute.test.ts -v`
预期：新增用例 FAIL（返回 `/home`）；同时把该文件里原本断言登录后落点为 `/home` 的用例改为 `/pet`。

- [ ] **步骤 3：编写最少实现代码**

`src/router/nextRoute.ts`：把 `HOME_PATH` 改为 `'/pet'`，新增：

```ts
export const LEARN_PATH = '/home'
export const SHOP_PATH = '/shop'
```

`src/router/index.ts` 增加路由：

```ts
  { path: '/pet', name: 'pet', component: () => import('./routes/PetRoute.vue') },
  { path: '/shop', name: 'shop', component: () => import('./routes/ShopRoute.vue') },
```

`src/app/productionStores.ts`：在 `ProductionStores` 接口与 `assemble` 中增加 pet 适配（与 quiz 共用事件读写）：

```ts
import type { PetStore } from '@/features/pet/usePet'

export interface ProductionStores {
  // ...
  /** 宠物房间 / 商店：读写事件。 */
  readonly pet: PetStore
}

// assemble() 内：
    pet: eventAccess as PetStore,
```

`src/router/routes/PetRoute.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import PetRoomView from '@/views/PetRoomView.vue'
import { getProductionStores } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { LEARN_PATH } from '@/router/nextRoute'

const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)
</script>

<template>
  <PetRoomView
    :profile-id="profileId"
    :store="stores.pet"
    @start-quest="router.push(LEARN_PATH)"
    @open-shop="router.push('/shop')"
    @back-home="router.push('/profiles')"
  />
</template>
```

`src/router/routes/ShopRoute.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import ShopView from '@/views/ShopView.vue'
import { getProductionStores } from '@/app/productionStores'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'

const router = useRouter()
const stores = getProductionStores()
const session = useProfileSessionStore()
const profileId = computed(() => session.activeProfileId)
</script>

<template>
  <ShopView :profile-id="profileId" :store="stores.pet" @back-home="router.push('/pet')" />
</template>
```

`src/views/HomeView.vue` 的 TabBar 导航映射改为：宠物 `/pet`、学习 `/home`、商店 `/shop`、图鉴 `/bestiary`。`HomeRoute.vue` 的 `TAB_PATHS` 同步增加。

`src/features/home/TabBar.vue` 把三个页签改成四个（宠物/学习/商店/图鉴），并同步三个主题：

```ts
export type ChildTabId = 'pet' | 'learn' | 'shop' | 'bestiary'

const TABS_BY_THEME = {
  'deep-sea': [
    { id: 'pet', label: '宠物', icon: '🐋' },
    { id: 'learn', label: '学习', icon: '⚓' },
    { id: 'shop', label: '商店', icon: '🛒' },
    { id: 'bestiary', label: '图鉴', icon: '🐟' },
  ],
  dinosaur: [
    { id: 'pet', label: '宠物', icon: '🐋' },
    { id: 'learn', label: '学习', icon: '🦴' },
    { id: 'shop', label: '商店', icon: '🛒' },
    { id: 'bestiary', label: '图鉴', icon: '🦕' },
  ],
  space: [
    { id: 'pet', label: '宠物', icon: '🐋' },
    { id: 'learn', label: '学习', icon: '🚀' },
    { id: 'shop', label: '商店', icon: '🛒' },
    { id: 'bestiary', label: '图鉴', icon: '🪐' },
  ],
} as const satisfies Record<ThemeId, readonly { id: ChildTabId; label: string; icon: string }[]>
```

`src/views/HomeView.vue` 使用 `<TabBar active="learn" ... />`；`HomeRoute.vue` 的映射改为：

```ts
const TAB_PATHS: Readonly<Record<string, string>> = {
  pet: '/pet',
  learn: '/home',
  shop: '/shop',
  bestiary: '/bestiary',
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/router/nextRoute.test.ts tests/App.test.ts -v`
预期：PASS（App 用例需同步把 `/home` 改为 `/learn` 的地方全部更新）。

- [ ] **步骤 5：Commit**

```bash
git add src/router src/views/HomeView.vue tests/router/nextRoute.test.ts tests/App.test.ts
git commit -m "feat(v4): make pet room the landing route"
```

---

### 任务 11：v3 档案迁移与结算积分

**文件：**
- 修改：`src/domain/economy/ledger.ts`（新增 `sessionPoints`）
- 修改：`src/features/unlock/useUnlockFeedback.ts`（新增 `pointsEarned`）
- 修改：`src/features/unlock/UnlockOverlay.vue`（展示本轮积分）
- 修改：`src/App.vue`（传入 `:points`）
- 测试：`tests/domain/economy/sessionPoints.test.ts`、`tests/features/pet/migration.test.ts`、`tests/features/unlock/UnlockOverlay.test.ts`

- [ ] **步骤 1：编写失败的测试**

`tests/domain/economy/sessionPoints.test.ts`：

```ts
import { describe, expect, it } from 'vitest'

import { sessionPoints } from '@/domain/economy/ledger'
import type { DomainEvent } from '@/domain/model/types'

const events: DomainEvent[] = [
  { eventId: 's', profileId: 'p1', occurredAt: 0, type: 'session-started', sessionId: 's1', questionIds: ['q1', 'q2'], difficultyTrace: [] },
  { eventId: 'a1', profileId: 'p1', occurredAt: 1, type: 'answer-submitted', sessionId: 's1', questionId: 'q1', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
  { eventId: 'a2', profileId: 'p1', occurredAt: 2, type: 'answer-submitted', sessionId: 's1', questionId: 'q2', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 10 },
]

describe('sessionPoints', () => {
  it('一组两题全对：2 + 5 + 3 = 10 分', () => {
    expect(sessionPoints(events, 'p1', 's1')).toBe(10)
  })
})
```

`tests/features/pet/migration.test.ts`：

```ts
import { describe, expect, it } from 'vitest'

import { replayPet } from '@/domain/pet/petProjection'
import type { DomainEvent } from '@/domain/model/types'

describe('v3 档案迁移', () => {
  it('没有 pet-adopted 的历史事件流，首次补一条后即可获得宠物', () => {
    const legacy: DomainEvent[] = [
      { eventId: 's', profileId: 'p1', occurredAt: 1, type: 'session-completed', sessionId: 's1', rewards: ['quest-complete'] },
    ]
    expect(replayPet(legacy, 'p1', 10).adopted).toBe(false)

    const migrated: DomainEvent[] = [
      { eventId: 'adopt', profileId: 'p1', occurredAt: 11, type: 'pet-adopted', petId: 'baby-whale', name: '小蓝' },
      ...legacy,
    ]
    expect(replayPet(migrated, 'p1', 20).adopted).toBe(true)
  })
})
```

`tests/features/unlock/UnlockOverlay.test.ts` 追加：

```ts
it('展示本轮积分', () => {
  const view = mount(UnlockOverlay, { props: { open: true, rewards: [], points: 17 } })
  expect(view.get('[data-testid="unlock-points"]').text()).toContain('17')
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/domain/economy/sessionPoints.test.ts tests/features/unlock/UnlockOverlay.test.ts -v`
预期：FAIL，`sessionPoints` 不存在 / `unlock-points` 未渲染。

- [ ] **步骤 3：编写最少实现代码**

`src/domain/economy/ledger.ts` 末尾追加：

```ts
/** 一组题的积分：独立答对题数 + 完成 + 正确率加成。 */
export function sessionPoints(
  events: readonly DomainEvent[],
  profileId: string,
  sessionId: string,
): number {
  const scoped = events.filter((event) => event.profileId === profileId)
  const started = scoped.find(
    (event) => event.type === 'session-started' && event.sessionId === sessionId,
  )
  const total = started?.type === 'session-started' ? new Set(started.questionIds).size : 0
  const correct = new Set(
    scoped
      .filter((event) => event.type === 'answer-submitted' && event.sessionId === sessionId && independentAnswer(event))
      .map((event) => (event as { questionId: string }).questionId),
  ).size
  const bonus = total > 0 && correct / total >= ACCURACY_THRESHOLD ? ACCURACY_BONUS : 0
  return correct * POINTS_PER_INDEPENDENT_CORRECT + POINTS_PER_COMPLETION + bonus
}
```

`src/features/unlock/useUnlockFeedback.ts`：

```ts
import { sessionPoints } from '@/domain/economy/ledger'

const pointsEarned = ref(0)
```

在 `check()` 内 `fresh` 分支设置：

```ts
pointsEarned.value = sessionPoints(events, profileId, fresh.sessionId)
```

返回对象增加：

```ts
pointsEarned: computed(() => pointsEarned.value),
```

`UnlockOverlay.vue` 的 props 增加 `points?: number`，在 `</ul>` 之后加：

```vue
<p v-if="(points ?? 0) > 0" class="unlock-overlay__points" data-testid="unlock-points">
  本轮获得 {{ points }} 积分
</p>
```

`App.vue` 的浮层改为：

```vue
<UnlockOverlay
  :open="feedback.visible.value"
  :rewards="feedback.rewards.value"
  :points="feedback.pointsEarned.value"
  @close="feedback.dismiss()"
/>
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/domain/economy/sessionPoints.test.ts tests/features/pet/migration.test.ts tests/features/unlock/UnlockOverlay.test.ts -v`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/domain/economy/ledger.ts src/features/unlock/useUnlockFeedback.ts src/features/unlock/UnlockOverlay.vue src/App.vue tests/domain/economy/sessionPoints.test.ts tests/features/pet/migration.test.ts tests/features/unlock/UnlockOverlay.test.ts
git commit -m "feat(v4): show session points and migrate legacy profiles"
```

---

### 任务 12：构建与 v4 预览部署

**文件：**
- 修改：`.github/workflows/deploy-pages.yml`、`README.md`

- [ ] **步骤 1：编写失败的检查**

运行：`npm run type-check && npm run build`
预期：当前通过；记录构建产物体积。

- [ ] **步骤 2：更新部署工作流**

在 workflow 的 checkout 列表中增加 v4，构建到 `v4/`：

```yaml
      - name: Checkout fourth version
        uses: actions/checkout@v4
        with:
          ref: v4
          path: v4
```

```yaml
      - name: Install and test fourth version
        working-directory: v4
        run: |
          npm ci
          npm run test
          npm run build
```

组装步骤中加入 `v4 → v4/`，部署后访问 `/v4/`。

- [ ] **步骤 3：运行完整验证**

运行：

```bash
npm run type-check
npm run test
npm run build
```

预期：全部通过；`dist/` 可预览。

- [ ] **步骤 4：Commit 并推送 v4**

```bash
git add .github/workflows/deploy-pages.yml README.md
git commit -m "chore(v4): add v4 preview deployment"
git push -u origin v4
```

- [ ] **步骤 5：线上校验**

等待 Actions 成功后，打开 `https://wangdonghello.github.io/deep-sea-math/v4/`，确认：宠物房间可进入、商店可购买、做题后积分增加。
