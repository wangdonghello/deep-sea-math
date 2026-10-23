import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 一年级题库生成器（216 题 = 6 个年级适用题型 × 3 难度 × 12 题）。
 *
 * 一年级不出现乘法、除法或三位数乘除；用 `number-sense` 替代三年级的
 * `mul-div`，覆盖数位、比较与排序。所有题固定 5 层提示、带 1 年级
 * Common Core 领域来源。
 */

const VERSION = '4.0.0'
const GRADE = 1
const PER_CELL = 12
const CATEGORY_ORDER = [
  'basic', 'applied', 'basic', 'probe', 'basic', 'applied',
  'basic', 'probe', 'basic', 'applied', 'basic', 'applied',
]

const TYPES = ['add-sub', 'number-sense', 'two-step-app', 'unknown-relation', 'unit-time-route', 'pattern-data']

const META = {
  'add-sub': { skill: 'skill-addition', standard: '1.OA.1', domain: 'OA' },
  'number-sense': { skill: 'skill-number-sense', standard: '1.NBT.3', domain: 'NBT' },
  'two-step-app': { skill: 'skill-addition', standard: '1.OA.1', domain: 'OA' },
  'unknown-relation': { skill: 'skill-addsub-unknown', standard: '1.OA.8', domain: 'OA' },
  'unit-time-route': { skill: 'skill-add-length', standard: '1.MD.1', domain: 'MD' },
  'pattern-data': { skill: 'skill-constant-difference-sequence', standard: '1.OA.5', domain: 'OA' },
}

const CONTEXTS = {
  'add-sub': [
    ['小鱼', '鱼缸里有 {a} 条小鱼，又放进 {b} 条，现在一共有多少条？'],
    ['气球', '小海星有 {a} 个气球，小鲸又送来 {b} 个，一共有多少个？'],
    ['苹果', '盘子里有 {a} 个苹果，妈妈又放了 {b} 个，现在有多少个？'],
    ['积木', '搭房子用了 {a} 块积木，还剩 {b} 块，原来有多少块？'],
    ['红花', '做了 {a} 朵红花，又做了 {b} 朵，一共做了多少朵？'],
    ['座位', '教室里有 {a} 把椅子，又搬来 {b} 把，一共有多少把？'],
  ],
  'number-sense': [
    ['比大小', '{a} 和 {b}，哪个数更大？'],
    ['数的组成', '一个数由 {tens} 个十和 {ones} 个一组成，这个数是多少？'],
    ['排序', '把 {a}、{b}、{c} 从大到小排一排，最大的数是多少？'],
    ['接近整十', '{a} 最接近哪个整十数？'],
    ['多一', '比 {a} 大 1 的数是几？'],
    ['少一', '比 {a} 小 1 的数是几？'],
  ],
  'two-step-app': [
    ['班级', '班里有 {a} 人，来了 {b} 人，又走了 {c} 人，现在有多少人？'],
    ['水果', '篮子里有 {a} 个水果，拿走 {b} 个，又放入 {c} 个，现在有多少个？'],
    ['图书', '书架上有 {a} 本书，借走 {b} 本，又还回 {c} 本，现在有多少本？'],
    ['游戏', '操场上有 {a} 人，又来了 {b} 人，走了 {c} 人，现在有多少人？'],
    ['卡片', '有 {a} 张卡片，送出 {b} 张，又得到 {c} 张，现在有多少张？'],
    ['糖果', '有 {a} 颗糖，吃掉 {b} 颗，又买了 {c} 颗，现在有多少颗？'],
  ],
  'unknown-relation': [
    ['补加数', '{a} 加上几等于 {total}？'],
    ['补减数', '{total} 减去几等于 {a}？'],
    ['缺失部分', '一共有 {total} 个，其中 {a} 个是红色的，其余几个？'],
    ['拿走一部分', '一共有 {total} 个，拿走 {a} 个，还剩几个？'],
    ['找原数', '一个数减去 {a} 后是 {b}，这个数是多少？'],
    ['找另一个数', '{a} 和几合起来是 {total}？'],
  ],
  'unit-time-route': [
    ['长度', '一根绳子长 {a} 厘米，另一根长 {b} 厘米，一共长多少厘米？'],
    ['时间', '看书用了 {a} 分钟，画画用了 {b} 分钟，一共用了多少分钟？'],
    ['购物', '一支笔 {a} 元，一块橡皮 {b} 元，一共多少元？'],
    ['路线', '从家到学校 {a} 米，从学校到公园 {b} 米，一共多少米？'],
    ['身高', '小海星高 {a} 厘米，小鲸高 {b} 厘米，两人相差多少厘米？'],
    ['容量', '一瓶水 {a} 毫升，另一瓶 {b} 毫升，两瓶一共多少毫升？'],
  ],
  'pattern-data': [
    ['数列', '{start}、{next1}、{next2}、{next3}，下一个数是多少？'],
    ['摆花', '第一行 {start} 盆，以后每行多 {step} 盆，第 4 行多少盆？'],
    ['台阶', '从 {start} 开始，每次加 {step}，第 4 个数是多少？'],
    ['座位', '第一排 {start} 个座位，每排多 {step} 个，第 4 排多少个？'],
    ['珠子', '按每次多 {step} 颗的规律，从 {start} 颗开始，第 4 组多少颗？'],
    ['存钱', '第一天存 {start} 元，以后每天多存 {step} 元，第 4 天存多少元？'],
  ],
}

function makeProblem(type, difficulty, slot) {
  const d = difficulty
  if (type === 'add-sub') {
    const a = Math.min(90, 5 + slot * 3 + d * 4)
    const b = Math.min(9, 1 + slot + d)
    const unit = ['条', '个', '个', '块', '朵', '把'][slot % 6]
    return { a, b, value: a + b, unit }
  }
  if (type === 'number-sense') {
    const a = 11 + slot * 3 + d
    const b = 9 + slot
    const c = 20 + slot
    const tens = 1 + (slot % 5)
    const ones = slot % 10
    const which = slot % 6
    if (which === 0) return { a, b, c, tens, ones, value: Math.max(a, b), unit: '' }
    if (which === 1) return { a, b, c, tens, ones, value: tens * 10 + ones, unit: '' }
    if (which === 2) return { a, b, c, tens, ones, value: Math.max(a, b, c), unit: '' }
    if (which === 3) return { a, b, c, tens, ones, value: Math.round(a / 10) * 10, unit: '' }
    if (which === 4) return { a, b, c, tens, ones, value: a + 1, unit: '' }
    return { a, b, c, tens, ones, value: a - 1, unit: '' }
  }
  if (type === 'two-step-app') {
    const a = 8 + slot + d
    const b = 2 + (slot % 5)
    const c = 1 + (slot % 4)
    const mode = slot % 6
    const increaseThenDecrease = mode === 0 || mode === 3
    const value = increaseThenDecrease ? a + b - c : a - b + c
    const unit = mode === 0 || mode === 3 ? '人' : mode === 1 ? '个' : mode === 2 ? '本' : mode === 4 ? '张' : '颗'
    return { a, b, c, value, unit, mode: increaseThenDecrease ? 'add-then-subtract' : 'subtract-then-add' }
  }
  if (type === 'unknown-relation') {
    const a = 3 + slot
    const b = 2 + (slot % 6)
    const total = a + b
    // 前三种、拿走一部分、补另一个加数都求 b；找原数求 a+b。
    const mode = slot % 6
    const value = mode === 4 ? total : b
    return { a, b, total, value, unit: '' }
  }
  if (type === 'unit-time-route') {
    const a = 6 + slot
    const b = 3 + (slot % 8)
    const mode = slot % 6
    const value = mode === 4 ? Math.abs(a - b) : a + b
    const unit = ['厘米', '分钟', '元', '米', '厘米', '毫升'][mode]
    return { a, b, value, unit, mode: mode === 4 ? 'difference' : 'total' }
  }
  const start = 1 + slot
  const step = 1 + d
  return { start, step, value: start + step * 3, unit: '' }
}

function storyFor(type, slot, problem) {
  const [title, body] = CONTEXTS[type][slot % CONTEXTS[type].length]
  const text = body
    .replaceAll('{a}', String(problem.a ?? problem.start ?? 1))
    .replaceAll('{b}', String(problem.b ?? problem.step ?? 1))
    .replaceAll('{c}', String(problem.c ?? 1))
    .replaceAll('{total}', String(problem.total ?? problem.value))
    .replaceAll('{tens}', String(problem.tens ?? 1))
    .replaceAll('{ones}', String(problem.ones ?? 0))
    .replaceAll('{start}', String(problem.start ?? 1))
    .replaceAll('{step}', String(problem.step ?? 1))
    .replaceAll('{next1}', String((problem.start ?? 1) + (problem.step ?? 1)))
    .replaceAll('{next2}', String((problem.start ?? 1) + (problem.step ?? 1) * 2))
    .replaceAll('{next3}', String((problem.start ?? 1) + (problem.step ?? 1) * 3))
  return { title, body: text }
}

function hintsFor(type, problem) {
  const relation = type === 'number-sense'
    ? '先看十位，再看个位；比较大小要从高位比起。'
    : type === 'unknown-relation'
      ? '把不知道的数看作一个空位，想一想怎样把它补出来。'
      : type === 'pattern-data'
        ? '先看相邻两个数相差多少，再按同样的差往下数。'
        : '先看清数量之间的关系，再决定用加法还是减法。'
  return [
    '先读题，找出已知的数量和要问的问题。',
    '把题目里的数量写下来，别急着算。',
    relation,
    type === 'number-sense'
      ? '先看最高位，再一位一位比较。'
      : type === 'pattern-data'
        ? `从 ${problem.start} 开始，每次加 ${problem.step}。`
        : '把已知数量和未知数量排成一道算式。',
    '先算出一部分，再合并或比较；方法对了，答案自然就出来了。',
  ]
}

function buildQuestion(type, difficulty, slot, id) {
  const problem = makeProblem(type, difficulty, slot)
  const meta = META[type]
  return {
    id,
    grade: GRADE,
    format: 'open',
    type,
    difficulty,
    category: CATEGORY_ORDER[slot],
    story: storyFor(type, slot, problem),
    requiresFiveStep: false,
    hints: hintsFor(type, problem),
    answer: { value: problem.value, ...(problem.unit ? { unit: problem.unit } : {}) },
    similarQuestionIds: [],
    tags: [
      type,
      meta.skill,
      `difficulty-${difficulty}`,
      ...(CATEGORY_ORDER[slot] === 'applied' ? ['application'] : CATEGORY_ORDER[slot] === 'probe' ? ['probe'] : []),
      ...(type === 'unknown-relation' ? ['missing-part'] : []),
      `standard:${meta.standard}`,
    ],
    sources: [`https://www.thecorestandards.org/Math/Content/1/${meta.domain}/`],
  }
}

function applyChoiceVariants(questions, target) {
  const optionIds = ['A', 'B', 'C', 'D']
  let converted = 0
  for (const question of questions) {
    if (converted >= target) break
    const correct = question.answer.value
    const unit = question.answer.unit ?? ''
    const distractors = [correct + 1, correct + 2, correct + 10, correct - 1]
      .filter((value, index, values) => value > 0 && value !== correct && values.indexOf(value) === index)
      .slice(0, 3)
    if (distractors.length < 3) continue
    const labels = [correct, ...distractors].map((value) => `${value}${unit}`)
    const correctIndex = Number(question.id.slice(-2)) % 4
    const options = optionIds.map((id, index) => ({
      id,
      label: labels[index === correctIndex ? 0 : 1 + (index < correctIndex ? index : index - 1)],
    }))
    question.format = 'choice'
    question.options = options
    question.answer.optionId = optionIds[correctIndex]
    converted += 1
  }
  return converted
}

const questions = []
let sequence = 0
for (const type of TYPES) {
  for (const difficulty of [1, 2, 3]) {
    for (let slot = 0; slot < PER_CELL; slot += 1) {
      const id = `g1-${String((sequence += 1)).padStart(3, '0')}`
      questions.push(buildQuestion(type, difficulty, slot, id))
    }
  }
}
const choiceCount = applyChoiceVariants(questions, 72)

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'src/data/content/questionBank.grade1.json')
writeFileSync(target, `${JSON.stringify({ version: VERSION, questions }, null, 2)}\n`)
console.log(`已写出一一年级 ${questions.length} 道题 → ${target}；选择题 ${choiceCount} 道`)
