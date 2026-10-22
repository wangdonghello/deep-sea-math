import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 二年级题库生成器（216 题 = 6 题型 × 3 难度 × 12 题）。
 *
 * 与三年级生成器分开：低年级的数字范围、题型和讲解方式差异太大，硬塞进
 * 一套 BUILDERS 会让“年级匹配”变成参数补丁。这里只写二年级需要的模板，
 * 每题固定 5 层提示、带 Common Core 年级领域来源，并保持每年级 216 题。
 */

const VERSION = '4.0.0'
const GRADE = 2
const PER_CELL = 12
const CATEGORY_ORDER = [
  'basic', 'applied', 'basic', 'probe', 'basic', 'applied',
  'basic', 'probe', 'basic', 'applied', 'basic', 'applied',
]

const DOMAIN = {
  '2.NBT': 'NBT',
  '2.OA': 'OA',
  '2.MD': 'MD',
}

const CONTEXTS = {
  'add-sub': [
    ['图书角', '图书角原来有 {a} 本书，又放进 {b} 本，现在一共有多少本？'],
    ['贴纸', '小海星有 {a} 张贴纸，小鲸又送给他 {b} 张，现在一共有多少张？'],
    ['贝壳', '沙滩上捡到 {a} 枚贝壳，又捡到 {b} 枚，一共捡到多少枚？'],
    ['跳绳', '课间跳了 {a} 下，下午又跳了 {b} 下，一共跳了多少下？'],
    ['水果', '篮子里有 {a} 个苹果，又放入 {b} 个，篮子里现在有多少个？'],
    ['积木', '积木塔用了 {a} 块积木，又加上 {b} 块，一共用了多少块？'],
  ],
  'mul-div': [
    ['小组', '每个小组有 {a} 人，{b} 个小组一共有多少人？'],
    ['铅笔', '每盒有 {a} 支铅笔，{b} 盒一共有多少支？'],
    ['座位', '每排有 {a} 个座位，{b} 排一共有多少个座位？'],
    ['贴画', '每张贴纸有 {a} 个小图案，{b} 张一共有多少个小图案？'],
    ['分糖', '{total} 颗糖平均分给 {b} 个小朋友，每人分到几颗？'],
    ['装袋', '{total} 个苹果，每袋装 {a} 个，可以装几袋？'],
  ],
  'two-step-app': [
    ['班级', '班里有 {a} 名同学，又来了 {b} 名，后来走了 {c} 名，现在有多少名？'],
    ['书架', '书架上有 {a} 本书，借走 {b} 本，又还回 {c} 本，现在有多少本？'],
    ['游戏', '操场上有 {a} 人，来了 {b} 人，又走了 {c} 人，现在有多少人？'],
    ['水果', '水果店有 {a} 个橙子，卖出 {b} 个，又进货 {c} 个，现在有多少个？'],
    ['公交', '公交车上有 {a} 人，到站下去 {b} 人，又上来 {c} 人，现在有多少人？'],
    ['卡片', '小海星有 {a} 张卡片，送给小鲸 {b} 张，又买到 {c} 张，现在有多少张？'],
  ],
  'unknown-relation': [
    ['未知加数', '一个数加上 {a} 等于 {total}，这个数是多少？'],
    ['未知减数', '{total} 减去一个数等于 {a}，这个数是多少？'],
    ['未知份数', '每份 {a} 个，一共有 {total} 个，共有几份？'],
    ['未知每份', '{total} 个平均分成 {b} 份，每份几个？'],
    ['补全算式', '已知 {a} 和 {total}，求另一个加数。'],
    ['找回', '原来有 {total} 元，花掉一些后还剩 {a} 元，花掉多少元？'],
  ],
  'unit-time-route': [
    ['长度', '一条彩带长 {a} 厘米，另一条长 {b} 厘米，两条一共长多少厘米？'],
    ['时间', '做作业用了 {a} 分钟，读书用了 {b} 分钟，一共用了多少分钟？'],
    ['购物', '一支笔 {a} 元，一本本子 {b} 元，一共要多少元？'],
    ['路线', '从家到学校走 {a} 米，从学校到公园走 {b} 米，一共走多少米？'],
    ['身高', '小海星身高 {a} 厘米，小鲸比他高 {b} 厘米，小鲸多高？'],
    ['容量', '一瓶水有 {a} 毫升，另一瓶有 {b} 毫升，两瓶一共多少毫升？'],
  ],
  'pattern-data': [
    ['数列', '数列 {start}、{next1}、{next2}、{next3}，下一个数是多少？'],
    ['摆花', '第 1 行摆 {start} 盆，以后每行多 {step} 盆，第 4 行摆多少盆？'],
    ['台阶', '从 {start} 开始，每次加 {step}，第 4 个数是多少？'],
    ['座位', '第一排 {start} 个座位，每排多 {step} 个，第 4 排有多少个？'],
    ['存钱', '第一天存 {start} 元，以后每天多存 {step} 元，第 4 天存多少元？'],
    ['珠子', '按每次多 {step} 颗的规律穿珠子，从 {start} 颗开始，第 4 组多少颗？'],
  ],
}

const META = {
  'add-sub': { skill: 'skill-addition', standard: '2.NBT.5', domain: 'NBT' },
  'mul-div': { skill: 'skill-equal-groups-multiplication', standard: '2.OA.3', domain: 'OA' },
  'two-step-app': { skill: 'skill-addition', standard: '2.OA.1', domain: 'OA' },
  'unknown-relation': { skill: 'skill-addsub-unknown', standard: '2.OA.2', domain: 'OA' },
  'unit-time-route': { skill: 'skill-add-length', standard: '2.MD.5', domain: 'MD' },
  'pattern-data': { skill: 'skill-constant-difference-sequence', standard: '2.OA.3', domain: 'OA' },
}

function makeProblem(type, difficulty, slot) {
  const base = 10 + slot * 3 + difficulty * 4
  if (type === 'add-sub') {
    const a = base
    const b = 9 + slot * 2
    return { a, b, value: a + b, unit: '' }
  }
  if (type === 'mul-div') {
    const a = 2 + ((slot + difficulty) % 8)
    const b = 2 + ((slot * 2 + difficulty) % 8)
    const total = a * b
    if (slot >= 8) return { a, b, total, value: total % a === 0 ? total / a : b, unit: '人' }
    return { a, b, value: total, unit: '个' }
  }
  if (type === 'two-step-app') {
    const a = 20 + slot * 2
    const b = 5 + slot
    const c = 3 + slot
    return { a, b, c, value: a + b - c, unit: '人' }
  }
  if (type === 'unknown-relation') {
    const a = 5 + slot
    const b = 2 + (slot % 6)
    const total = a + b
    return { a, b, total, value: b, unit: '' }
  }
  if (type === 'unit-time-route') {
    const a = 12 + slot
    const b = 8 + slot
    return { a, b, value: a + b, unit: slot % 2 === 0 ? '厘米' : '分钟' }
  }
  const start = 2 + slot
  const step = 2 + difficulty
  return { start, step, value: start + step * 3, unit: '' }
}

function storyFor(type, slot, problem) {
  const [title, body] = CONTEXTS[type][slot % CONTEXTS[type].length]
  const text = body
    .replaceAll('{a}', String(problem.a ?? problem.start ?? 1))
    .replaceAll('{b}', String(problem.b ?? problem.step ?? 1))
    .replaceAll('{c}', String(problem.c ?? 1))
    .replaceAll('{total}', String(problem.total ?? problem.value))
    .replaceAll('{start}', String(problem.start ?? 1))
    .replaceAll('{step}', String(problem.step ?? 1))
    .replaceAll('{next1}', String((problem.start ?? 1) + (problem.step ?? 1)))
    .replaceAll('{next2}', String((problem.start ?? 1) + (problem.step ?? 1) * 2))
    .replaceAll('{next3}', String((problem.start ?? 1) + (problem.step ?? 1) * 3))
  return { title, body: text }
}

function hintsFor(type, problem) {
  const relation = type === 'mul-div'
    ? '想一想：每份有几个，有几份，用乘法；已知总数和份数，用除法。'
    : type === 'unknown-relation'
      ? '把不知道的数看成一个空位，想一想用什么运算能把它求出来。'
      : type === 'pattern-data'
        ? '先看相邻两个数相差多少，再按同样的差往下推。'
        : '先看清数量之间的关系，再决定用加法还是减法。'
  return [
    '先读题，找出已知的数量和要问的问题。',
    '把题目里的数量写下来，别急着算。',
    relation,
    type === 'mul-div'
      ? `列式：${problem.a ?? ''} × ${problem.b ?? ''}。`
      : type === 'pattern-data'
        ? `从 ${problem.start} 开始，每次加 ${problem.step}。`
        : '把已知数量和未知数量排成一道算式。',
    '先算出一部分，再合并或比较；方法对了，答案自然就出来了。',
  ]
}

function buildQuestion(type, difficulty, slot, id) {
  const problem = makeProblem(type, difficulty, slot)
  const story = storyFor(type, slot, problem)
  const meta = META[type]
  const standard = meta.standard
  return {
    id,
    grade: GRADE,
    format: 'open',
    type,
    difficulty,
    category: CATEGORY_ORDER[slot],
    story,
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
      `standard:${standard}`,
    ],
    sources: [`https://www.thecorestandards.org/Math/Content/2/${DOMAIN[standard.split('.').slice(0, 2).join('.')]}/`],
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
for (const type of Object.keys(CONTEXTS)) {
  for (const difficulty of [1, 2, 3]) {
    for (let slot = 0; slot < PER_CELL; slot += 1) {
      const id = `g2-${String((sequence += 1)).padStart(3, '0')}`
      questions.push(buildQuestion(type, difficulty, slot, id))
    }
  }
}
const choiceCount = applyChoiceVariants(questions, 72)

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'src/data/content/questionBank.grade2.json')
writeFileSync(target, `${JSON.stringify({ version: VERSION, questions }, null, 2)}\n`)
console.log(`已写出 ${questions.length} 道二年级题 → ${target}；选择题 ${choiceCount} 道`)
