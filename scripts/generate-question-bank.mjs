/**
 * 深海数学探险 · 题库生成脚本（216 题 = 6 题型 × 3 难度 × 12 题）。
 *
 * ── 为什么必须有这个脚本 ─────────────────────────────────────────────
 * 手写 200+ 道题既慢又极易算错（尤其是量级上调到三位数后，进位/退位、
 * 两步运算的顺序都容易写错）。本脚本把「情境模板 + 数字生成 + 答案计算 +
 * 五层提示 + 来源链接」一次性算出，任何人改题库只需改这里的参数再跑一次：
 *
 *     node scripts/generate-question-bank.mjs
 *
 * 产物写入 `src/data/content/questionBank.json`（顶层结构
 * `{ version, questions }`，本版本 `version` 为 `2.0.0`）。
 *
 * **修改题库 MUST 走本脚本，不要手改 JSON**：手改会让「题目 id、相似题
 * 双向链接、答案与算式一致性、hints[4] 不泄露答案」这些互相牵制的约束
 * 失去单一真源，下一次重新生成时被静默覆盖。脚本里的产物是纯数据、可
 * 复现（固定随机种子），diff 也稳定可读。
 *
 * ── 可调参数 ─────────────────────────────────────────────────────────
 * - {@link SEED}：随机种子（20261012）。同一种子 → 完全相同的产物。
 * - {@link PER_CELL}：每个 `QuizType × Difficulty` 格的题数（12）。
 * - {@link CATEGORY_ORDER}：每格内 12 题的槽位类别分布
 *   （6 basic : 4 applied : 2 probe，让 basic 池最厚）。
 * - 各 kind 在 {@link BUILDERS} 里按难度给出数字范围；要加大数字改那里。
 *
 * ── 与运行时校验的关系 ───────────────────────────────────────────────
 * 产物必须通过 `src/data/content/schema.ts` 的 `assertValidQuestionBank`
 * （严格口径：200–400 题、每格 ≥ 8、hints 恰好 5 层、无五步字段、来源
 * 域名匹配、相似题约束……）。跑完脚本后请务必跑 `npm run test`。
 *
 * @module scripts/generate-question-bank
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 固定随机种子：保证每次运行的产物稳定、diff 可读。 */
const SEED = 20261012

/** 每个 `QuizType × Difficulty` 格的题数（6 × 3 × 12 = 216）。 */
const PER_CELL = 12

/** 每格内 12 题的槽位类别分布（6 basic : 4 applied : 2 probe）。 */
const CATEGORY_ORDER = [
  'basic', 'applied', 'basic', 'probe', 'basic', 'applied',
  'basic', 'probe', 'basic', 'applied', 'basic', 'applied',
]

/** mulberry32：32 位确定性伪随机数发生器，返回 [0, 1) 浮点。 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(SEED)

/** 闭区间随机整数。 */
function randInt(min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

/** 从数组里确定性取一项。 */
function pick(list) {
  return list[Math.floor(rng() * list.length)]
}

/** 提取文本里的所有整数 token（与 schema 的数字边界口径一致）。 */
function digitsOf(text) {
  return (text.match(/\d+/g) ?? []).map(Number)
}

// ── 技能 → Common Core 标准 / 来源域 ────────────────────────────────────
// 与 `src/data/content/schema.ts` 的 `STANDARDS_BY_SKILL` 保持一致：题目
// tags 里只放一个 `skill-*`，`standard:*` 必须与之精确匹配，来源链接必须
// 含该标准所属域（NBT / OA / MD）的领域页。
const STANDARD_BY_SKILL = {
  'skill-addition': ['3.NBT.2'],
  'skill-subtraction': ['3.NBT.2'],
  'skill-repeated-subtraction': ['3.NBT.2'],
  'skill-merge-and-remove-duplicates': ['3.NBT.2', '3.OA.8'],
  'skill-equal-groups-multiplication': ['3.OA.3'],
  'skill-equal-share-division': ['3.OA.3'],
  'skill-multiplication-addition': ['3.OA.8'],
  'skill-division-addition': ['3.OA.8'],
  'skill-multiplication-subtraction': ['3.OA.8'],
  'skill-addsub-unknown': ['3.OA.8', '3.NBT.2'],
  'skill-muldiv-unknown': ['3.OA.4'],
  'skill-add-length': ['3.NBT.2'],
  'skill-subtract-length': ['3.NBT.2'],
  'skill-add-elapsed-time': ['3.MD.1'],
  'skill-subtract-elapsed-time': ['3.MD.1'],
  'skill-mass-total': ['3.MD.2'],
  'skill-multi-step-distance': ['3.OA.8'],
  'skill-rate-distance': ['3.OA.3'],
  'skill-constant-difference-sequence': ['3.OA.9'],
  'skill-doubling-sequence': ['3.OA.9'],
  'skill-second-difference-sequence': ['3.OA.9'],
  'skill-square-number-sequence': ['3.OA.9'],
  'skill-double-and-add-one-sequence': ['3.OA.9'],
}

/** 标准 → 领域页 URL（题目的 sources 必须含对应域）。 */
const DOMAIN_URL = {
  NBT: 'https://www.thecorestandards.org/Math/Content/3/NBT/',
  OA: 'https://www.thecorestandards.org/Math/Content/3/OA/',
  MD: 'https://www.thecorestandards.org/Math/Content/3/MD/',
}

/** 由 `standard:3.OA.8` 这类编码取域名。 */
function domainOf(standard) {
  return standard.includes('NBT') ? 'NBT' : standard.includes('OA') ? 'OA' : 'MD'
}

/** 四只图鉴生物（题目包装里的主角；schema 要求 creatureRef 可解析）。 */
const CREATURES = [
  'johnson-anglerfish',
  'giant-cusk-eel',
  'deep-sea-lizardfish',
  'jewel-squid',
]

// ── 题目数字生成器（按 kind × difficulty） ─────────────────────────────
// 每个 builder 返回 { n, value, expression }：
// - n 是代入情境模板的原始数字（a/b/c/terms…）；
// - value 是答案数值；
// - expression 是本题的算式（用于 hints[3]，也可能作为 answer.expression）。
//   `null` 表示"只求数值 + 单位"的形态（如带余数除法求商）。
// 数字量级按三年级课程标准上调：3.NBT.2 为 1000 以内加减；3.OA 为
// 乘除法与两步应用；3.MD 为时间/质量/长度。**全库不再出现个位数加减**，

/** 反复抽数直到满足条件，防死循环上限后回退。 */
function drawWhile(make, ok, limit = 400) {
  let value = make()
  for (let i = 0; i < limit && !ok(value); i += 1) value = make()
  return value
}

const BUILDERS = {
  // 加法：两部分合并。d3 要求个位与十位都进位。
  add: (d) => {
    if (d === 1) {
      const a = randInt(14, 46)
      const b = randInt(13, 38)
      return { n: { a, b }, value: a + b, expression: `${a} + ${b}` }
    }
    if (d === 2) {
      const a = randInt(126, 470)
      const b = randInt(115, 398)
      return { n: { a, b }, value: a + b, expression: `${a} + ${b}` }
    }
    const [a, b] = drawWhile(
      () => [randInt(430, 760), randInt(160, 299)],
      ([x, y]) => (x % 10) + (y % 10) >= 10 && (Math.floor(x / 10) % 10) + (Math.floor(y / 10) % 10) >= 9 && x + y <= 990,
    )
    return { n: { a, b }, value: a + b, expression: `${a} + ${b}` }
  },

  // 减法：求剩余。d3 要求个位与十位都退位。
  sub: (d) => {
    if (d === 1) {
      const a = randInt(45, 96)
      const b = randInt(12, 38)
      return { n: { a, b }, value: a - b, expression: `${a} - ${b}` }
    }
    if (d === 2) {
      const a = randInt(360, 940)
      // 被减数必须大于减数：早先两者独立取值，生成过 `417 - 419 = -2` 这种
      // 负结果的题（内容校验抓到了）。这里把 b 的上界绑到 a 上。
      const b = randInt(115, Math.min(450, a - 60))
      return { n: { a, b }, value: a - b, expression: `${a} - ${b}` }
    }
    const [a, b] = drawWhile(
      () => [randInt(640, 980), randInt(160, 470)],
      ([x, y]) => x % 10 < y % 10 && Math.floor(x / 10) % 10 <= Math.floor(y / 10) % 10 && x - y > 100,
    )
    return { n: { a, b }, value: a - b, expression: `${a} - ${b}` }
  },

  // 连续减法：两次取走。
  repsub: (d) => {
    if (d === 1) {
      const a = randInt(62, 96)
      const b = randInt(12, 26)
      const c = randInt(11, 24)
      return { n: { a, b, c }, value: a - b - c, expression: `${a} - ${b} - ${c}` }
    }
    const a = randInt(680, 960)
    const b = randInt(130, 260)
    const c = randInt(120, 250)
    return { n: { a, b, c }, value: a - b - c, expression: `${a} - ${b} - ${c}` }
  },

  // 先合并再去重：两步加减（技能为 3.NBT.2 + 3.OA.8）。
  mergededup: (d) => {
    const a = d === 3 ? randInt(260, 470) : randInt(120, 260)
    const b = d === 3 ? randInt(150, 290) : randInt(60, 140)
    const c = d === 3 ? randInt(90, 180) : randInt(40, 110)
    return { n: { a, b, c }, value: a + b - c, expression: `${a} + ${b} - ${c}` }
  },

  // 乘法：相同数量合并。d1 保底一边 ≥ 6 且积 ≥ 30。
  mul: (d) => {
    if (d === 1) {
      const a = drawWhile(() => randInt(5, 9), (x) => x >= 6 || x * 6 >= 30)
      const b = randInt(6, 9)
      return { n: { a, b }, value: a * b, expression: `${a} × ${b}` }
    }
    if (d === 2) {
      const a = randInt(12, 34)
      const b = randInt(3, 9)
      return { n: { a, b }, value: a * b, expression: `${a} × ${b}` }
    }
    const [a, b] = drawWhile(
      () => [randInt(23, 48), randInt(4, 9)],
      ([x, y]) => (x % 10) * y >= 10,
    )
    return { n: { a, b }, value: a * b, expression: `${a} × ${b}` }
  },

  // 除法（整除）：平均分。d1 被除数 ≥ 30。
  div: (d) => {
    if (d === 1) {
      const b = randInt(6, 9)
      const q = randInt(6, 9)
      const a = b * q
      return { n: { a, b }, value: q, expression: `${a} ÷ ${b}` }
    }
    const b = randInt(3, 9)
    const q = d === 2 ? randInt(11, 24) : randInt(13, 28)
    const a = b * q
    return { n: { a, b }, value: q, expression: `${a} ÷ ${b}` }
  },

  // 有余数除法：只求"最多装满几份"的商（本题不给算式答案）。
  divrem: (d) => {
    const b = randInt(4, 9)
    const q = d === 3 ? randInt(14, 32) : randInt(10, 20)
    const r = randInt(1, b - 1)
    const a = b * q + r
    return { n: { a, b, r }, value: q, expression: null }
  },

  // 两步：先乘后加。
  muladd: (d) => {
    if (d === 1) {
      const a = randInt(4, 9)
      const b = randInt(4, 9)
      const c = randInt(12, 28)
      return { n: { a, b, c }, value: a * b + c, expression: `${a} × ${b} + ${c}` }
    }
    if (d === 2) {
      const a = randInt(12, 34)
      const b = randInt(3, 8)
      const c = randInt(15, 48)
      return { n: { a, b, c }, value: a * b + c, expression: `${a} × ${b} + ${c}` }
    }
    const a = randInt(12, 24)
    const b = randInt(6, 15)
    const c = randInt(100, 260)
    return { n: { a, b, c }, value: a * b + c, expression: `${a} × ${b} + ${c}` }
  },

  // 两步：先除后加。
  divadd: (d) => {
    if (d === 1) {
      const b = randInt(4, 9)
      const q = randInt(5, 9)
      const c = randInt(12, 28)
      return { n: { a: b * q, b, c }, value: q + c, expression: `${b * q} ÷ ${b} + ${c}` }
    }
    if (d === 2) {
      const b = randInt(4, 9)
      const q = randInt(9, 18)
      const c = randInt(16, 48)
      return { n: { a: b * q, b, c }, value: q + c, expression: `${b * q} ÷ ${b} + ${c}` }
    }
    const b = randInt(6, 12)
    const q = randInt(12, 24)
    const c = randInt(50, 180)
    return { n: { a: b * q, b, c }, value: q + c, expression: `${b * q} ÷ ${b} + ${c}` }
  },

  // 两步：先乘后减。
  mulsub: (d) => {
    if (d === 2) {
      const a = randInt(12, 28)
      const b = randInt(3, 8)
      const t = a * b + randInt(20, 60)
      return { n: { t, a, b }, value: t - a * b, expression: `${t} - ${a} × ${b}` }
    }
    const a = randInt(6, 15)
    const b = randInt(12, 25)
    const t = a * b + randInt(40, 140)
    return { n: { t, a, b }, value: t - a * b, expression: `${t} - ${a} × ${b}` }
  },

  // 未知数关系：总数 − 已知 = 未知。
  misspart: (d) => {
    if (d === 1) {
      const t = randInt(46, 96)
      const k = randInt(13, 40)
      return { n: { t, k }, value: t - k, expression: `${t} - ${k}` }
    }
    const t = d === 2 ? randInt(320, 640) : randInt(520, 960)
    const k = d === 2 ? randInt(125, 280) : randInt(150, 380)
    return { n: { t, k }, value: t - k, expression: `${t} - ${k}` }
  },

  // 未知数关系：剩下的 + 送出的 = 原数。
  invadd: (d) => {
    if (d === 1) {
      const r = randInt(16, 48)
      const b = randInt(12, 40)
      return { n: { r, b }, value: r + b, expression: `${r} + ${b}` }
    }
    const r = d === 2 ? randInt(130, 380) : randInt(220, 680)
    const b = d === 2 ? randInt(115, 280) : randInt(130, 280)
    return { n: { r, b }, value: r + b, expression: `${r} + ${b}` }
  },

  // 未知数关系（乘除）：总数 ÷ 份数 = 每份数。
  eqgroups: (d) => {
    const g = d === 1 ? randInt(4, 9) : d === 2 ? randInt(5, 9) : randInt(8, 15)
    const q = d === 1 ? randInt(5, 9) : d === 2 ? randInt(12, 24) : randInt(11, 24)
    return { n: { t: g * q, g }, value: q, expression: `${g * q} ÷ ${g}` }
  },

  // 未知数关系（乘除）：份数 × 每份数 = 总数。
  invdiv: (d) => {
    const g = d === 1 ? randInt(4, 9) : d === 2 ? randInt(6, 12) : randInt(9, 18)
    const p = d === 1 ? randInt(5, 9) : d === 2 ? randInt(9, 20) : randInt(12, 24)
    return { n: { g, p }, value: g * p, expression: `${g} × ${p}` }
  },

  // 长度相加（≤ 1000，符合 3.NBT.2 与 schema 的长度上限）。
  addlen: (d) => {
    if (d === 1) {
      const a = randInt(14, 46)
      const b = randInt(13, 38)
      return { n: { a, b }, value: a + b, expression: `${a} + ${b}` }
    }
    if (d === 2) {
      const a = randInt(220, 480)
      const b = randInt(150, 380)
      return { n: { a, b }, value: a + b, expression: `${a} + ${b}` }
    }
    const a = randInt(180, 400)
    const b = randInt(60, 160)
    const c = randInt(40, 120)
    return { n: { a, b, c }, value: a + b + c, expression: `${a} + ${b} + ${c}` }
  },

  // 长度相减（≤ 1000）。
  sublen: (d) => {
    if (d === 1) {
      const a = randInt(46, 96)
      const b = randInt(13, 38)
      return { n: { a, b }, value: a - b, expression: `${a} - ${b}` }
    }
    const a = d === 2 ? randInt(620, 950) : randInt(820, 980)
    const b = d === 2 ? randInt(150, 420) : randInt(230, 460)
    return { n: { a, b }, value: a - b, expression: `${a} - ${b}` }
  },

  // 经过时间相加（分钟）。
  addtime: (d) => {
    if (d === 1) {
      const a = randInt(14, 44)
      const b = randInt(13, 40)
      return { n: { a, b }, value: a + b, expression: `${a} + ${b}` }
    }
    if (d === 2) {
      const h = randInt(1, 2)
      const m = randInt(15, 45)
      const add = randInt(20, 50)
      const a = h * 60 + m
      return { n: { a, b: add, h, m }, value: a + add, expression: `${a} + ${add}` }
    }
    const h1 = randInt(1, 2)
    const m1 = randInt(20, 50)
    const h2 = randInt(1, 2)
    const m2 = randInt(15, 45)
    const a = h1 * 60 + m1
    const b = h2 * 60 + m2
    return { n: { a, b, h1, m1, h2, m2 }, value: a + b, expression: `${a} + ${b}` }
  },

  // 经过时间相减（分钟）。
  subtime: (d) => {
    if (d === 1) {
      const t = randInt(30, 58)
      const k = randInt(12, 26)
      return { n: { t, k }, value: t - k, expression: `${t} - ${k}` }
    }
    const t = d === 2 ? randInt(46, 92) : randInt(96, 180)
    const k = d === 2 ? randInt(15, 38) : randInt(30, 72)
    return { n: { t, k }, value: t - k, expression: `${t} - ${k}` }
  },

  // 质量合计（袋数 × 每袋千克）。
  masstotal: (d) => {
    const n = d === 1 ? randInt(3, 6) : d === 2 ? randInt(6, 12) : randInt(12, 20)
    const w = d === 1 ? randInt(2, 9) : d === 2 ? randInt(3, 9) : randInt(6, 18)
    return { n: { n, w }, value: n * w, expression: `${w} × ${n}` }
  },

  // 速度 × 时间 = 距离。
  ratedist: (d) => {
    const p = d === 1 ? randInt(4, 9) : d === 2 ? randInt(12, 32) : randInt(24, 48)
    const t = d === 1 ? randInt(5, 9) : d === 2 ? randInt(4, 9) : randInt(8, 18)
    return { n: { p, t }, value: p * t, expression: `${p} × ${t}` }
  },

  // 多段路程：先乘后加（结果控制在 1000 米以内）。
  multistepdist: (d) => {
    const x = d === 1 ? randInt(10, 25) : d === 2 ? randInt(40, 120) : randInt(120, 300)
    const n = d === 1 ? randInt(3, 5) : d === 2 ? randInt(4, 8) : randInt(6, 15)
    const dist = d === 1 ? randInt(4, 9) : d === 2 ? randInt(12, 30) : randInt(12, 40)
    return { n: { x, n, dist }, value: x + n * dist, expression: `${x} + ${n} × ${dist}` }
  },

  // 等差序列：求下一项。
  patconst: (d) => {
    const start = d === 1 ? randInt(2, 9) : d === 2 ? randInt(10, 28) : randInt(14, 40)
    const step = d === 1 ? randInt(2, 9) : d === 2 ? randInt(6, 15) : randInt(11, 24)
    const terms = [start, start + step, start + 2 * step, start + 3 * step]
    const next = start + 4 * step
    return { n: { terms, step }, value: next, expression: `${terms[3]} + ${step}` }
  },

  // 倍增序列：每次 ×2。
  patdouble: (d) => {
    const start = d === 2 ? randInt(3, 9) : randInt(4, 12)
    const terms = [start, start * 2, start * 4, start * 8]
    return { n: { terms }, value: start * 16, expression: `${terms[3]} × 2` }
  },

  // 二阶差序列：差值本身每次增加固定量。
  patsecond: () => {
    const t0 = randInt(2, 8)
    const f = randInt(2, 5)
    const k = randInt(2, 4)
    const terms = [t0]
    let diff = f
    for (let i = 0; i < 4; i += 1) {
      terms.push(terms[terms.length - 1] + diff)
      diff += k
    }
    const nextDiff = diff
    return { n: { terms, diffs: [f, f + k, f + 2 * k, f + 3 * k], k }, value: terms[terms.length - 1] + nextDiff, expression: `${terms[terms.length - 1]} + ${nextDiff}` }
  },

  // 平方数序列：n×n。
  patsquare: () => {
    const base = randInt(2, 5)
    const terms = [0, 1, 2, 3].map((i) => (base + i) * (base + i))
    const next = (base + 4) * (base + 4)
    return { n: { terms, base }, value: next, expression: `${base + 4} × ${base + 4}` }
  },

  // ×2+1 递推。
  patdoubleaddone: () => {
    const start = randInt(2, 5)
    const terms = [start]
    for (let i = 0; i < 3; i += 1) terms.push(terms[terms.length - 1] * 2 + 1)
    const last = terms[terms.length - 1]
    return { n: { terms }, value: last * 2 + 1, expression: `${last} × 2 + 1` }
  },
}

// ── 五层提示的第 3 层（数量关系）文案 ─────────────────────────────────
/** 每种 kind 的数量关系：无数字，且必须与本题运算次序一致。 */
const RELATION = {
  add: '把两部分合起来，用加法。',
  sub: '从整体里去掉一部分，求剩余用减法。',
  repsub: '连续去掉两次，就连续减两次。',
  mergededup: '先把两批合起来，再减掉重复的部分。',
  mul: '几个相同数量求总数，用乘法。',
  div: '平均分成几份，求每份用除法。',
  divrem: '每份装同样多，求最多装满几份用除法，商就是份数。',
  muladd: '先算相同的几份，再加上多出来的部分。',
  divadd: '先平均分，再加额外的部分。',
  mulsub: '先算相同几份的总量，再从整体里减掉。',
  misspart: '已知总数和一部分，未知的部分用总数减去已知部分。',
  invadd: '已知剩下的和去掉的，原来的数量要把两部分合起来。',
  eqgroups: '已知总数和份数，求每份用除法。',
  invdiv: '已知份数和每份数，求总数用乘法。',
  addlen: '两段路程单位相同，合起来用加法。',
  sublen: '从整段里去掉已走的部分，求剩余用减法。',
  addtime: '两段时间单位相同（分钟）时，合起来用加法。',
  subtime: '从计划时间里减去已经用掉的时间。',
  masstotal: '每份重量相同，求总重就把几个相同重量合起来。',
  ratedist: '每分钟走的距离相同，求总距离用乘法。',
  multistepdist: '先算重复的几段，再加上最初的一段。',
  patconst: '相邻两项的差始终一样，用最后一项加上这个差。',
  patdouble: '每一项都是前一项的 2 倍，用最后一项再乘 2。',
  patsecond: '相邻的差自己在变化，先找出差的变化规律。',
  patsquare: '每一项都是同一个数乘自己，找到下一个因数。',
  patdoubleaddone: '每一项都是前一项乘 2 再加 1。',
}

/**
 * 第 5 层「讲解示例」：用**另一组数字**把同一种技能再走一遍。
 *
 * schema 的 `validateWorkedExampleHint` 按整数边界比对，禁止示例里出现本题
 * 答案或答案算式的任一操作数；这里再额外避开本题的操作数，保证示例真正
 * 换了一组数字。重试上限后仍冲突则抛错（宁可生成失败，也不要漏出答案）。
 */
function makeExample(avoid, builder) {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const text = builder()
    if (!digitsOf(text).some((token) => avoid.has(token))) return text
  }
  throw new Error('generate-question-bank: 无法生成不泄露答案的讲解示例')
}

/** 每种 kind 的示例句子构造器（内部随机取一组较小的样例数字）。 */
const EXAMPLE = {
  add: () => { const x = randInt(6, 19); const y = randInt(6, 19); return `比如 ${x} 与 ${y} 合起来：${x} + ${y} = ${x + y}，总数比每一部分都大。` },
  sub: () => { const x = randInt(30, 59); const y = randInt(11, 29); return `比如从 ${x} 里去掉 ${y}：${x} - ${y} = ${x - y}，剩下的总比原来少。` },
  repsub: () => { const x = randInt(60, 89); const y = randInt(11, 22); const z = randInt(11, 22); return `比如 ${x} 先去掉 ${y} 再去掉 ${z}，按顺序一步步减。` },
  mergededup: () => { const x = randInt(20, 49); const y = randInt(15, 39); const z = randInt(8, 24); return `比如 ${x} + ${y} - ${z}，先合起来再去掉重复的部分。` },
  mul: () => { const x = randInt(4, 9); const y = randInt(4, 9); return `比如 ${x} × ${y} = ${x * y}，几个相同的数相加可以写成乘法。` },
  div: () => { const y = randInt(3, 9); const q = randInt(4, 9); return `比如 ${y * q} ÷ ${y} = ${q}，把它平均分成 ${y} 份就是每份的数量。` },
  divrem: () => { const y = randInt(4, 9); const x = randInt(30, 80); return `比如 ${x} 里每 ${y} 个装一份，最多装满几份就用除法估。` },
  muladd: () => { const x = randInt(4, 9); const y = randInt(4, 9); const z = randInt(11, 29); return `比如 ${x} × ${y} + ${z}，先算乘法再加。` },
  divadd: () => { const y = randInt(3, 9); const q = randInt(4, 9); const z = randInt(11, 29); return `比如 ${y * q} ÷ ${y} + ${z}，先算除法再加。` },
  mulsub: () => { const x = randInt(4, 9); const y = randInt(3, 8); const t = x * y + randInt(20, 60); return `比如 ${t} - ${x} × ${y}，先算乘法再相减。` },
  misspart: () => { const x = randInt(40, 89); const y = randInt(11, 35); return `比如总数 ${x}、已知 ${y}：${x} - ${y} = ${x - y}，剩下就是未知的部分。` },
  invadd: () => { const x = randInt(20, 59); const y = randInt(11, 39); return `比如剩下 ${x} 个、又去掉 ${y} 个：${x} + ${y}，合起来才是原来的数量。` },
  eqgroups: () => { const g = randInt(3, 9); const q = randInt(4, 9); return `比如总数 ${g * q} 平均分成 ${g} 份：${g * q} ÷ ${g}，每份是 ${q}。` },
  invdiv: () => { const g = randInt(3, 9); const p = randInt(4, 9); return `比如 ${g} 份、每份 ${p}：${g} × ${p}，总数就是每份乘份数。` },
  addlen: () => { const x = randInt(20, 49); const y = randInt(15, 39); return `比如一段 ${x} 米、另一段 ${y} 米：${x} + ${y}，合起来带上米。` },
  sublen: () => { const x = randInt(60, 99); const y = randInt(15, 44); return `比如全长 ${x} 米、已走 ${y} 米：${x} - ${y}，剩下就是没走的部分。` },
  addtime: () => { const x = randInt(16, 44); const y = randInt(15, 39); return `比如第一段 ${x} 分钟、第二段 ${y} 分钟：${x} + ${y}，单位保持分钟。` },
  subtime: () => { const x = randInt(40, 89); const y = randInt(12, 34); return `比如计划 ${x} 分钟、已经用了 ${y} 分钟：${x} - ${y}，剩下就是还要用的时间。` },
  masstotal: () => { const n = randInt(3, 7); const w = randInt(3, 9); return `比如 ${n} 份、每份 ${w} 千克：${w} × ${n}，总重带上千克。` },
  ratedist: () => { const p = randInt(4, 9); const t = randInt(4, 9); return `比如每分钟 ${p} 米、走了 ${t} 分钟：${p} × ${t}，结果是米。` },
  multistepdist: () => { const x = randInt(300, 340); const n = randInt(3, 5); const d = randInt(6, 9); return `比如先走 ${x} 米，再走 ${n} 段每段 ${d} 米：${x} + ${n} × ${d}。` },
  patconst: () => { const s = randInt(200, 260); const step = randInt(12, 19); return `比如数列 ${s}、${s + step}、${s + 2 * step}，每次加 ${step}，下一个就接着往后加。` },
  patdouble: () => { const s = randInt(300, 340); return `比如数列 ${s}、${s * 2}、${s * 4}，每次翻倍，下一个再乘 2。` },
  patsecond: () => { const d1 = randInt(300, 320); const k = randInt(12, 16); return `比如相邻的差依次是 ${d1}、${d1 + k}，差本身每次多 ${k}，就照这个规律往后推。` },
  patsquare: () => { const b = randInt(30, 40); return `比如 ${b} × ${b}、${b + 1} × ${b + 1}，下一项就接着往后。` },
  patdoubleaddone: () => { const x = randInt(60, 80); return `比如 ${x} × 2 + 1 = ${x * 2 + 1}，每一步都这样算。` },
}

// ── 情境模板池（每个 type ≥ 8 个不同故事） ────────────────────────────
// 每个模板：kind（数学结构）、creature（图鉴主角）、unit/form（答案形态）、
// title + body（随情境变化，而不是只换数字）。`levels` 缺省表示三档通用。
// 同一格内的 12 道题用 `(slot × step + offset) % pool.length` 取模板，
// step 与池长互质，保证先铺满一轮再用第二轮，避免相邻重复。

/** 题型 → 情境模板池。 */
const SCENARIOS = {
  'add-sub': [
    { kind: 'add', creature: 'jewel-squid', unit: '枚', form: 'unit', title: '收集海底贝壳', body: (n) => `小潜水员第一次捡到 ${n.a} 枚贝壳，第二次又捡到 ${n.b} 枚。两次一共捡到多少枚贝壳？` },
    { kind: 'add', creature: 'johnson-anglerfish', unit: '个', form: 'unit', title: '清点诱饵光点', body: (n) => `观察窗记录到 ${n.a} 个微光点，关上灯后又记录到 ${n.b} 个。两段一共记录到多少个微光点？` },
    { kind: 'add', creature: 'giant-cusk-eel', unit: '次', form: 'unit', title: '汇总声呐回波', body: (n) => `上午的声呐收到 ${n.a} 次回波，下午又收到 ${n.b} 次。今天一共收到多少次回波？` },
    { kind: 'add', creature: 'deep-sea-lizardfish', unit: '份', form: 'unit', title: '补充实验样本', body: (n) => `实验台原有 ${n.a} 份海水样本，研究员又送来 ${n.b} 份。台上一共有多少份样本？` },
    { kind: 'sub', creature: 'jewel-squid', unit: '枚', form: 'unit', title: '分配鳞片标本', body: (n) => `标本盒里有 ${n.a} 枚鳞片标本，分给观察舱 ${n.b} 枚。盒里还剩多少枚？` },
    { kind: 'sub', creature: 'johnson-anglerfish', unit: '节', form: 'unit', title: '核对备用电池', body: (n) => `仓库原有 ${n.a} 节备用电池，探险队取走 ${n.b} 节。仓库里还剩多少节电池？` },
    { kind: 'sub', creature: 'giant-cusk-eel', unit: '项', form: 'unit', title: '划掉已核对清单', body: (n) => `检查清单上共有 ${n.a} 项，已经核对完 ${n.b} 项。还剩多少项没有核对？` },
    { kind: 'sub', creature: 'deep-sea-lizardfish', unit: '张', form: 'unit', title: '分发观察卡片', body: (n) => `观察舱准备了 ${n.a} 张卡片，已经发出 ${n.b} 张。还剩多少张卡片？` },
    { kind: 'add', creature: 'jewel-squid', unit: undefined, form: 'expression', title: '点亮两串诱饵灯', body: (n) => `诱饵灯第一串亮了 ${n.a} 个亮点，第二串亮了 ${n.b} 个亮点。请写出表示合起来数量的加法算式。` },
    { kind: 'sub', creature: 'giant-cusk-eel', unit: undefined, form: 'expression', title: '算出差掉的数量', body: (n) => `采样记录原有 ${n.a} 条，研究员勾掉了其中的 ${n.b} 条。请写出表示剩下数量的减法算式。` },
    { kind: 'repsub', creature: 'johnson-anglerfish', unit: '个', form: 'unit', title: '两次取出样本瓶', levels: [1, 3], body: (n) => `操作台上有 ${n.a} 个样本瓶，先取走 ${n.b} 个，过了一会儿又取走 ${n.c} 个。还剩下多少个样本瓶？` },
    { kind: 'mergededup', creature: 'deep-sea-lizardfish', unit: '条', form: 'unit', title: '合并并去掉重复数据', levels: [3], body: (n) => `两次观测分别记录 ${n.a} 条和 ${n.b} 条数据，复核时发现其中有 ${n.c} 条重复。去掉重复后还剩多少条数据？` },
  ],
  'mul-div': [
    { kind: 'mul', creature: 'johnson-anglerfish', unit: '条', form: 'unit', title: '分组观察小鱼', body: (n) => `观察缸里有 ${n.a} 组小鱼，每组 ${n.b} 条。一共有多少条小鱼？` },
    { kind: 'mul', creature: 'jewel-squid', unit: '张', form: 'unit', title: '贴满图鉴贴纸', body: (n) => `每页贴 ${n.a} 张贴纸，一共贴满 ${n.b} 页。一共贴了多少张贴纸？` },
    { kind: 'mul', creature: 'giant-cusk-eel', unit: '块', form: 'unit', title: '打包能量饼干', body: (n) => `每个补给包放 ${n.a} 块能量饼干，一共准备了 ${n.b} 包。总共有多少块饼干？` },
    { kind: 'mul', creature: 'deep-sea-lizardfish', unit: '条', form: 'unit', title: '连续扫描数据', body: (n) => `声呐每轮扫描得到 ${n.a} 条数据，连续扫描 ${n.b} 轮。一共得到多少条数据？` },
    { kind: 'mul', creature: 'johnson-anglerfish', unit: '次', form: 'unit', title: '每人记录观察次数', body: (n) => `${n.a} 名队员每人记录 ${n.b} 次观察。日志里一共记录了多少次观察？` },
    { kind: 'mul', creature: 'giant-cusk-eel', unit: '米', form: 'unit', title: '匀速下潜的距离', body: (n) => `潜水艇每分钟下潜 ${n.a} 米，连续下潜 ${n.b} 分钟。一共下潜了多少米？` },
    { kind: 'div', creature: 'jewel-squid', unit: '张', form: 'unit', title: '平均分配观察卡', body: (n) => `${n.a} 张观察卡平均分给 ${n.b} 个小组，每个小组分到多少张？` },
    { kind: 'div', creature: 'deep-sea-lizardfish', unit: '枚', form: 'unit', title: '装盒保存小样本', body: (n) => `${n.a} 枚小样本平均装进 ${n.b} 个盒子，每盒装多少枚？` },
    { kind: 'div', creature: 'johnson-anglerfish', unit: '个', form: 'unit', title: '分装到采样架', body: (n) => `${n.a} 个样本瓶平均放进 ${n.b} 个架子，每个架子放多少个？` },
    { kind: 'div', creature: 'jewel-squid', unit: undefined, form: 'expression', title: '写出平均分的除法算式', body: (n) => `${n.a} 张路线卡要平均分给 ${n.b} 个小组。请写出表示每组分到多少的除法算式。` },
    { kind: 'divrem', creature: 'giant-cusk-eel', unit: '盒', form: 'unit', title: '最多能装满几盒', levels: [3], body: (n) => `有 ${n.a} 个样本，每个盒子最多装 ${n.b} 个。最多能装满多少盒？（装不满的零头不算一盒）` },
    { kind: 'divrem', creature: 'deep-sea-lizardfish', unit: '份', form: 'unit', title: '最多分成几份', levels: [3], body: (n) => `${n.a} 个采样任务，每份安排 ${n.b} 个任务。最多可以分成多少份？（不足一份的不算）` },
  ],
  'two-step-app': [
    { kind: 'muladd', creature: 'johnson-anglerfish', unit: '颗', form: 'unit', title: '制作巡游旗帜', body: (n) => `每面旗帜需要 ${n.a} 颗亮片，先做好 ${n.b} 面，之后又额外准备 ${n.c} 颗备用。一共准备了多少颗亮片？` },
    { kind: 'muladd', creature: 'giant-cusk-eel', unit: '个', form: 'unit', title: '给小组派发记录夹', body: (n) => `给 ${n.b} 个小组各发 ${n.a} 个记录夹，备用箱里还有 ${n.c} 个。一共准备了多少个记录夹？` },
    { kind: 'muladd', creature: 'deep-sea-lizardfish', unit: '节', form: 'unit', title: '装配探险工具包', body: (n) => `每个工具包放 ${n.a} 节电池，先装好 ${n.b} 包，又单独加上 ${n.c} 节备用电池。一共用了多少节电池？` },
    { kind: 'muladd', creature: 'jewel-squid', unit: '条', form: 'unit', title: '统计观测并补录', body: (n) => `每轮观测记录 ${n.a} 条数据，共记录 ${n.b} 轮，之后又补录 ${n.c} 条。总共记录了多少条数据？` },
    { kind: 'divadd', creature: 'johnson-anglerfish', unit: '枚', form: 'unit', title: '平分后每人再领', body: (n) => `${n.a} 枚徽章平均分给 ${n.b} 名队员，之后每名队员再领 ${n.c} 枚备用徽章。每人一共拿到多少枚？` },
    { kind: 'divadd', creature: 'giant-cusk-eel', unit: '张', form: 'unit', title: '记录表平均分再补齐', body: (n) => `${n.a} 张记录表平均分给 ${n.b} 个小组，每组再补上 ${n.c} 张空白表。每组最后有多少张？` },
    { kind: 'divadd', creature: 'jewel-squid', unit: '个', form: 'unit', title: '航线点平均分再增加', body: (n) => `${n.a} 个航线点平均分成 ${n.b} 组，每组又增加 ${n.c} 个复核点。每组最后要复核多少个点？` },
    { kind: 'divadd', creature: 'deep-sea-lizardfish', unit: '份', form: 'unit', title: '标本均分后添新份', body: (n) => `${n.a} 份标本平均装入 ${n.b} 个盒子，每个盒子又添了 ${n.c} 份新标本。每个盒子最后有多少份？` },
    { kind: 'mulsub', creature: 'johnson-anglerfish', unit: '格', form: 'unit', title: '算完消耗看余量', levels: [2, 3], body: (n) => `电池共有 ${n.t} 格电量，${n.a} 台设备各消耗 ${n.b} 格。还剩多少格电量？` },
    { kind: 'mulsub', creature: 'deep-sea-lizardfish', unit: '瓶', form: 'unit', title: '取走后剩下的水样', levels: [2, 3], body: (n) => `实验室有 ${n.t} 瓶水样，先取走 ${n.a} 组，每组 ${n.b} 瓶。还剩多少瓶水样？` },
    { kind: 'mulsub', creature: 'giant-cusk-eel', unit: '个', form: 'unit', title: '发出后还剩多少', levels: [2, 3], body: (n) => `仓库里有 ${n.t} 个密封袋，${n.a} 个箱子各取走 ${n.b} 个。仓库里还剩多少个密封袋？` },
    { kind: 'mulsub', creature: 'jewel-squid', unit: '条', form: 'unit', title: '减去重复记录', levels: [2, 3], body: (n) => `记录表上共有 ${n.t} 条数据，其中 ${n.a} 组各出现了 ${n.b} 条重复。去掉重复后还剩多少条？` },
  ],
  'unknown-relation': [
    { kind: 'misspart', creature: 'giant-cusk-eel', unit: '米', form: 'unit', title: '寻找未走的航程', body: (n) => `航线全长 ${n.t} 米，潜水艇已经走了 ${n.k} 米。还要走多少米才能到达终点？` },
    { kind: 'misspart', creature: 'deep-sea-lizardfish', unit: '条', form: 'unit', title: '还差多少条记录', body: (n) => `今天需要整理 ${n.t} 条记录，已经整理完 ${n.k} 条。还要整理多少条？` },
    { kind: 'misspart', creature: 'jewel-squid', unit: '份', form: 'unit', title: '补全样本份数', body: (n) => `这个盒子要凑齐 ${n.t} 份样本，已经放入 ${n.k} 份。还需要放入多少份？` },
    { kind: 'invadd', creature: 'giant-cusk-eel', unit: '个', form: 'unit', title: '倒推浮标原数', body: (n) => `浮标原来有一些，送出 ${n.b} 个后还剩 ${n.r} 个。原来有多少个浮标？` },
    { kind: 'invadd', creature: 'deep-sea-lizardfish', unit: '枚', form: 'unit', title: '倒推样本原数', body: (n) => `研究站送走 ${n.b} 枚样本后，还剩 ${n.r} 枚。送走前一共有多少枚样本？` },
    { kind: 'invadd', creature: 'johnson-anglerfish', unit: '张', form: 'unit', title: '还原观察卡张数', body: (n) => `发掉 ${n.b} 张观察卡后还剩 ${n.r} 张。发之前一共有多少张观察卡？` },
    { kind: 'eqgroups', creature: 'jewel-squid', unit: '张', form: 'unit', title: '求每箱卡片数', body: (n) => `${n.t} 张观察卡平均装在 ${n.g} 个箱子里，每个箱子装多少张？` },
    { kind: 'eqgroups', creature: 'giant-cusk-eel', unit: '枚', form: 'unit', title: '求每袋样本数', body: (n) => `一些样本平均装进 ${n.g} 个袋子，一共 ${n.t} 枚。每个袋子装多少枚？` },
    { kind: 'eqgroups', creature: 'deep-sea-lizardfish', unit: '个', form: 'unit', title: '求每轮回波数', body: (n) => `${n.g} 轮扫描共记录 ${n.t} 个回波，每轮记录数相同。每轮记录多少个回波？` },
    { kind: 'invdiv', creature: 'johnson-anglerfish', unit: '枚', form: 'unit', title: '还原样本总量', body: (n) => `样本平均装进 ${n.g} 个袋子，每袋 ${n.p} 枚。原来一共有多少枚样本？` },
    { kind: 'invdiv', creature: 'jewel-squid', unit: '张', form: 'unit', title: '还原贴纸总数', body: (n) => `贴纸平均放到 ${n.g} 页，每页 ${n.p} 张。一共有多少张贴纸？` },
    { kind: 'invdiv', creature: 'giant-cusk-eel', unit: '份', form: 'unit', title: '还原补给总份数', body: (n) => `补给平均分给 ${n.g} 队，每队 ${n.p} 份。出发前一共有多少份补给？` },
  ],
  'unit-time-route': [
    { kind: 'addlen', creature: 'giant-cusk-eel', unit: '米', form: 'unit', title: '接起海底测线', body: (n, d) => (d === 3 ? `三段测线分别长 ${n.a} 米、${n.b} 米和 ${n.c} 米。接起来一共多长？` : `第一段测线长 ${n.a} 米，第二段长 ${n.b} 米。两段接起来一共多长？`) },
    { kind: 'addlen', creature: 'johnson-anglerfish', unit: '米', form: 'unit', title: '合并同向航程', body: (n, d) => (d === 3 ? `潜水艇先前进 ${n.a} 米，又前进 ${n.b} 米，最后再前进 ${n.c} 米。一共前进了多少米？` : `潜水艇先前进 ${n.a} 米，接着又朝同一方向前进 ${n.b} 米。一共前进了多少米？`) },
    { kind: 'sublen', creature: 'giant-cusk-eel', unit: '米', form: 'unit', title: '还剩多少测线没测', body: (n) => `整条测线长 ${n.a} 米，已经测量了 ${n.b} 米。还剩多少米没有测量？` },
    { kind: 'sublen', creature: 'deep-sea-lizardfish', unit: '米', form: 'unit', title: '离目标还差多少', body: (n) => `目标在 ${n.a} 米之外，潜水艇已经走了 ${n.b} 米。还要走多少米？` },
    { kind: 'addtime', creature: 'johnson-anglerfish', unit: '分钟', form: 'unit', title: '合计两段探测时间', body: (n, d) => (d === 2 ? `第一段探测用了 ${n.h} 小时 ${n.m} 分钟，接着又用了 ${n.b} 分钟。一共用了多少分钟？` : d === 3 ? `第一班用了 ${n.h1} 小时 ${n.m1} 分钟，第二班用了 ${n.h2} 小时 ${n.m2} 分钟。两班一共用了多少分钟？` : `第一次探测用了 ${n.a} 分钟，第二次用了 ${n.b} 分钟。一共用了多少分钟？`) },
    { kind: 'addtime', creature: 'jewel-squid', unit: '分钟', form: 'unit', title: '合计水下作业时间', body: (n, d) => (d === 2 ? `第一段作业用了 ${n.h} 小时 ${n.m} 分钟，整理设备又用了 ${n.b} 分钟。一共用了多少分钟？` : d === 3 ? `上午作业 ${n.h1} 小时 ${n.m1} 分钟，下午作业 ${n.h2} 小时 ${n.m2} 分钟。全天一共用了多少分钟？` : `第一次作业用了 ${n.a} 分钟，第二次用了 ${n.b} 分钟。两次一共多少分钟？`) },
    { kind: 'subtime', creature: 'deep-sea-lizardfish', unit: '分钟', form: 'unit', title: '还剩多少作业时间', body: (n) => `作业计划一共 ${n.t} 分钟，已经工作 ${n.k} 分钟。还要工作多少分钟？` },
    { kind: 'subtime', creature: 'johnson-anglerfish', unit: '分钟', form: 'unit', title: '扣除已经用掉的时间', body: (n) => `任务允许 ${n.t} 分钟，前一段已经用了 ${n.k} 分钟。剩下的时间是多少分钟？` },
    { kind: 'masstotal', creature: 'giant-cusk-eel', unit: '千克', form: 'unit', title: '称量样本总重', body: (n) => `${n.n} 个采样袋每个重 ${n.w} 千克。这些样本的总重是多少千克？` },
    { kind: 'ratedist', creature: 'johnson-anglerfish', unit: '米', form: 'unit', title: '计算匀速下潜距离', body: (n) => `潜水艇每分钟下潜 ${n.p} 米，连续下潜 ${n.t} 分钟。一共下潜了多少米？` },
    { kind: 'multistepdist', creature: 'deep-sea-lizardfish', unit: '米', form: 'unit', title: '分段下潜的路线', body: (n) => `潜水艇先下潜 ${n.x} 米，之后又分成 ${n.n} 段，每段下潜 ${n.dist} 米。一共下潜了多少米？` },
    { kind: 'multistepdist', creature: 'jewel-squid', unit: '米', form: 'unit', title: '拼出完整航线', body: (n) => `航线先直行 ${n.x} 米，再拐弯走过 ${n.n} 段、每段 ${n.dist} 米。这条航线一共多长？` },
  ],
  'pattern-data': [
    { kind: 'patconst', creature: 'johnson-anglerfish', unit: '个', form: 'unit', title: '诱饵闪光的规律', body: (n) => `诱饵灯的亮点数依次是 ${n.terms.join('、')}，每次都增加同样多。下一次会有多少个亮点？` },
    { kind: 'patconst', creature: 'giant-cusk-eel', unit: '个', form: 'unit', title: '每轮采样数记录表', body: (n) => `采样记录表上的样本数依次是 ${n.terms.join('、')}，每轮增加的数量相同。下一轮是多少个？` },
    { kind: 'patconst', creature: 'deep-sea-lizardfish', unit: '条', form: 'unit', title: '声呐数据的递增记录', body: (n) => `声呐每轮的数据条数依次是 ${n.terms.join('、')}，每轮增加的一样多。下一轮记录多少条？` },
    { kind: 'patconst', creature: 'jewel-squid', unit: '个', form: 'unit', title: '探测器信号点规律', body: (n) => `探测器信号点依次显示 ${n.terms.join('、')} 个，相邻两个数的差相同。下一次显示多少个？` },
    { kind: 'patconst', creature: 'johnson-anglerfish', unit: '次', form: 'unit', title: '观察窗的闪烁次数', body: (n) => `观察窗每分钟闪烁次数依次是 ${n.terms.join('、')}，每次都多同样多。下一分钟闪烁多少次？` },
    { kind: 'patconst', creature: 'giant-cusk-eel', unit: '个', form: 'unit', title: '样本递增表补数', body: (n) => `记录表上的样本数依次是 ${n.terms.join('、')}，相邻两数相差相同。下一个数是多少？` },
    { kind: 'patdouble', creature: 'deep-sea-lizardfish', unit: '个', levels: [2, 3], form: 'unit', title: '不断翻倍的光点数', body: (n) => `观测到的光点数依次是 ${n.terms.join('、')}，每一次都是上一次的 2 倍。下一次是多少个？` },
    { kind: 'patdouble', creature: 'jewel-squid', unit: '条', levels: [2, 3], form: 'unit', title: '不断翻倍的信号条数', body: (n) => `信号条数依次是 ${n.terms.join('、')}，每一轮都翻一倍。下一轮是多少条？` },
    { kind: 'patsecond', creature: 'deep-sea-lizardfish', unit: '个', levels: [3], form: 'unit', title: '差值也在变化的序列', body: (n) => `序列是 ${n.terms.join('、')}，相邻两数依次增加 ${n.diffs.join('、')}。下一个数是多少？` },
    { kind: 'patsecond', creature: 'giant-cusk-eel', unit: '个', levels: [3], form: 'unit', title: '二阶递增的记录', body: (n) => `记录依次是 ${n.terms.join('、')}，相邻的差依次是 ${n.diffs.join('、')}。下一个数是多少？` },
    { kind: 'patsquare', creature: 'jewel-squid', unit: '个', levels: [3], form: 'unit', title: '补全平方数数量表', body: (n) => `数量表依次记录 ${n.terms.join('、')}，每个数都是两个相同的数相乘。下一项是多少？` },
    { kind: 'patdoubleaddone', creature: 'johnson-anglerfish', unit: '个', levels: [3], form: 'unit', title: '破解训练能量序列', body: (n) => `能量显示依次是 ${n.terms.join('、')}，每一步都是前一个数乘 2 再加 1。下一项是多少？` },
  ],
}

// ── 题目装配 ──────────────────────────────────────────────────────────

/** kind → 技能标签（每个 kind 只对应一个精确技能，schema 只认一个）。 */
const SKILL_BY_KIND = {
  add: 'skill-addition', sub: 'skill-subtraction', repsub: 'skill-repeated-subtraction',
  mergededup: 'skill-merge-and-remove-duplicates',
  mul: 'skill-equal-groups-multiplication', div: 'skill-equal-share-division', divrem: 'skill-equal-share-division',
  muladd: 'skill-multiplication-addition', divadd: 'skill-division-addition', mulsub: 'skill-multiplication-subtraction',
  misspart: 'skill-addsub-unknown', invadd: 'skill-addsub-unknown',
  eqgroups: 'skill-muldiv-unknown', invdiv: 'skill-muldiv-unknown',
  addlen: 'skill-add-length', sublen: 'skill-subtract-length',
  addtime: 'skill-add-elapsed-time', subtime: 'skill-subtract-elapsed-time',
  masstotal: 'skill-mass-total', ratedist: 'skill-rate-distance', multistepdist: 'skill-multi-step-distance',
  patconst: 'skill-constant-difference-sequence', patdouble: 'skill-doubling-sequence',
  patsecond: 'skill-second-difference-sequence', patsquare: 'skill-square-number-sequence',
  patdoubleaddone: 'skill-double-and-add-one-sequence',
}

/** kind → 补充自由标签（供筛选与报告分组）。 */
const TAG_BY_KIND = {
  add: 'addition', sub: 'subtraction', repsub: 'repeated-subtraction', mergededup: 'multi-operation',
  mul: 'multiplication', div: 'division', divrem: 'division-with-remainder',
  muladd: 'multiplication-addition', divadd: 'division-addition', mulsub: 'multiplication-subtraction',
  misspart: 'missing-part', invadd: 'inverse-addition', eqgroups: 'equal-groups', invdiv: 'inverse-division',
  addlen: 'length', sublen: 'length', addtime: 'elapsed-time', subtime: 'elapsed-time',
  masstotal: 'mass', ratedist: 'rate-distance', multistepdist: 'distance',
  patconst: 'increasing-pattern', patdouble: 'doubling-pattern', patsecond: 'difference-pattern',
  patsquare: 'square-numbers', patdoubleaddone: 'rule-based',
}

/** 第 1 层审题提醒池：**不出现任何数字**（避免复述题干里的数）。 */
const CUE_POOL = [
  '先把题目完整读一遍，想想它要我们求什么。',
  '读一读这道题，找找它在问什么事情。',
  '慢慢读题，先弄清楚最后要回答的是什么。',
  '先读一遍题目，再想想需要几步才能解决。',
  '看清题目讲的事情，再决定从哪里入手。',
  '读题时留意数量之间的关系，然后再动手计算。',
]

/** 第 2 层已知/未知识别池：同样不依赖具体数字。 */
const KNOWN_POOL = [
  '把题目里的已知条件和要求的问题分开来找。',
  '先圈出已经知道的条件，再标出要求的结果。',
  '分清哪些是已知的，哪一个是要求出来的。',
  '已知的部分和要求的部分各是什么，先分开想清楚。',
  '看看题目给了什么，又让我们求什么。',
  '把已知和未知摆清楚，再想它们之间的关系。',
]

/** 把问题对象里的所有数字收进集合（供"讲解示例换数字"避让）。 */
function collectNumbers(value, out = new Set()) {
  if (typeof value === 'number') out.add(value)
  else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, out))
  else if (value !== null && typeof value === 'object') Object.values(value).forEach((item) => collectNumbers(item, out))
  return out
}

/** 最大公约数（用于挑选与池长互质的步长）。 */
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

/** 选一个与池长互质的步长，保证模板在一轮内不重复。 */
function coprimeStep(length) {
  for (const candidate of [5, 7, 3, 4, 2, 6, 8, 9, 10, 11]) {
    if (gcd(candidate, length) === 1) return candidate
  }
  return 1
}

/** 组装一道题（id 由外部顺序分配）。 */
function buildQuestion({ id, type, difficulty, category, scenario, problem, slot }) {
  const { kind, creature, unit, form, title, body } = scenario
  const { n, value, expression } = problem
  const skill = SKILL_BY_KIND[kind]
  const standards = STANDARD_BY_SKILL[skill]
  const forbidden = new Set([value])
  if (form === 'expression') digitsOf(expression).forEach((token) => forbidden.add(token))
  const avoid = new Set([...forbidden, ...collectNumbers(n)])
  const expressionHint = expression === null
    ? `列式：${n.a} ÷ ${n.b}，商就是能装满的份数。`
    : `列式：${expression}。`
  let workedExample
  try {
    workedExample = makeExample(avoid, EXAMPLE[kind])
  } catch (error) {
    throw new Error(`${type} difficulty ${difficulty} kind=${kind} 《${title}》: ${error.message}`)
  }
  const answer = form === 'expression' ? { value, expression } : { value, unit }
  return {
    id,
    type,
    difficulty,
    category,
    story: { title, body: body(n, difficulty) },
    requiresFiveStep: false,
    hints: [
      CUE_POOL[slot % CUE_POOL.length],
      KNOWN_POOL[slot % KNOWN_POOL.length],
      RELATION[kind],
      expressionHint,
      workedExample,
    ],
    answer,
    similarQuestionIds: [],
    tags: [
      type,
      TAG_BY_KIND[kind],
      `difficulty-${difficulty}`,
      ...(category === 'applied' ? ['application'] : category === 'probe' ? ['probe'] : []),
      skill,
      ...standards.map((standard) => `standard:${standard}`),
    ],
    creatureRef: creature,
    sources: [...new Set(standards.map((standard) => DOMAIN_URL[domainOf(standard)]))],
  }
}

// ── 主流程：生成 → 建相似题双向链接 → 落盘 ─────────────────────────────

/** 题库版本号（扩容与量级上调后升到 2.0.0）。 */
const VERSION = '2.0.0'

/** 给同格内"同技能 + 同答案形态 + 答案值不同"的相邻两题建双向相似链接。 */
function linkSimilar(list) {
  const byCell = new Map()
  for (const question of list) {
    const key = `${question.type}|${question.difficulty}`
    if (!byCell.has(key)) byCell.set(key, [])
    byCell.get(key).push(question)
  }
  let links = 0
  for (const cell of byCell.values()) {
    const groups = new Map()
    for (const question of cell) {
      const skill = question.tags.find((tag) => tag.startsWith('skill-'))
      const key = `${skill}|${question.answer.unit ?? '#'}|${question.answer.expression ? 'E' : 'N'}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(question)
    }
    for (const group of groups.values()) {
      for (let i = 0; i + 1 < group.length; i += 2) {
        const first = group[i]
        const second = group[i + 1]
        if (first.answer.value === second.answer.value) continue
        first.similarQuestionIds.push(second.id)
        second.similarQuestionIds.push(first.id)
        links += 1
      }
    }
  }
  return links
}

const questions = []
let idSequence = 0
const nextId = () => `q${String((idSequence += 1)).padStart(3, '0')}`

for (const type of Object.keys(SCENARIOS)) {
  for (const difficulty of [1, 2, 3]) {
    const pool = SCENARIOS[type].filter((scenario) => !scenario.levels || scenario.levels.includes(difficulty))
    if (pool.length < 4) throw new Error(`generate-question-bank: ${type} difficulty ${difficulty} 情境模板不足`)
    const step = coprimeStep(pool.length)
    const offset = randInt(0, pool.length - 1)
    for (let slot = 0; slot < PER_CELL; slot += 1) {
      const scenario = pool[(slot * step + offset) % pool.length]
      const problem = BUILDERS[scenario.kind](difficulty)
      questions.push(buildQuestion({
        id: nextId(),
        type,
        difficulty,
        category: CATEGORY_ORDER[slot],
        scenario,
        problem,
        slot,
      }))
    }
  }
}

const linkCount = linkSimilar(questions)
const linked = questions.filter((question) => question.similarQuestionIds.length > 0).length

/** 逐题单行 JSON，便于 diff 阅读（与既有题库风格一致）。 */
const lines = questions.map((question) => `    ${JSON.stringify(question)}`)
const output = `{\n  "version": "${VERSION}",\n  "questions": [\n${lines.join(',\n')}\n  ]\n}\n`

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'src/data/content/questionBank.json')
writeFileSync(target, output)

// 生成摘要（type × difficulty × category 分布 + 相似题链接统计）。
const TYPES = Object.keys(SCENARIOS)
const CATEGORIES = ['basic', 'applied', 'probe']
console.log(`已写出 ${questions.length} 道题 → ${target}`)
for (const type of TYPES) {
  const cells = [1, 2, 3].map((difficulty) => {
    const cell = questions.filter((question) => question.type === type && question.difficulty === difficulty)
    const split = CATEGORIES.map((category) => `${category[0]}${cell.filter((question) => question.category === category).length}`).join('/')
    return `d${difficulty}:${cell.length}(${split})`
  })
  console.log(`  ${type.padEnd(18)} ${cells.join('  ')}`)
}
console.log(`相似题双向链接 ${linkCount} 组；有链接的题 ${linked} 道；空链接 ${questions.length - linked} 道`)
console.log(`提示层数固定 5；答案形态 expression ${questions.filter((question) => question.answer.expression).length} 道，unit ${questions.filter((question) => question.answer.unit).length} 道`)
