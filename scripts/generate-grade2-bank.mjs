import { writeFileSync } from 'node:fs'
import { applyRocoTheme } from './roco-theme.mjs'
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
    ['魔法图书馆', '洛贝克在魔法图书馆整理 {a} 本魔法书，又找到 {b} 本，现在一共有多少本？'],
    ['咕噜球工坊', '咕噜球工坊有 {a} 张七彩咕噜球贴纸，又送来 {b} 张，一共有多少张？'],
    ['彩虹湿地', '洛贝克在彩虹湿地找到 {a} 枚星星徽章，又找到 {b} 枚，一共找到多少枚？'],
    ['魔法学院', '魔法学院课间跳了 {a} 下魔法跳绳，下午又跳了 {b} 下，一共跳了多少下？'],
    ['云朵农场', '云朵农场收了 {a} 个魔法果，又摘下 {b} 个，现在有多少个？'],
    ['天空城', '洛贝克用 {a} 块魔法砖搭台，又加上 {b} 块，一共用了多少块？'],
  ],
  'mul-div': [
    ['宠物园', '宠物园每组有 {a} 只宠物，{b} 个小组一共有多少只宠物？'],
    ['咕噜球工坊', '每盒放 {a} 个七彩咕噜球，{b} 盒一共有多少个？'],
    ['天空城看台', '每排有 {a} 个座位，{b} 排看台一共有多少个座位？'],
    ['魔法学院', '每张魔法卡画 {a} 个图案，{b} 张卡一共有多少个图案？'],
    ['星辉广场', '{total} 颗魔法糖平均分给 {b} 个小洛克，每人分到几颗？'],
    ['咕噜球工坊', '{total} 个咕噜球，每盒装 {a} 个，可以装几盒？'],
  ],
  'two-step-app': [
    ['魔法学院', '魔法学院原有 {a} 名小洛克，又来了 {b} 名，后来离开 {c} 名。现在有多少名？'],
    ['魔法图书馆', '书架上有 {a} 本魔法书，借走 {b} 本，又还回 {c} 本，现在有多少本？'],
    ['宠物园', '宠物园里有 {a} 只宠物，来了 {b} 只，又转移走 {c} 只，现在有多少只？'],
    ['云朵农场', '云朵农场有 {a} 个魔法果，送出 {b} 个，又收获 {c} 个，现在有多少个？'],
    ['魔法列车', '车上有 {a} 名小洛克，到站下去 {b} 名，又上来 {c} 名，现在有多少名？'],
    ['星辉广场', '洛贝克有 {a} 张魔法卡，送给小洛克 {b} 张，又得到 {c} 张，现在有多少张？'],
  ],
  'unknown-relation': [
    ['魔法学院', '洛贝克有一些星星徽章，又得到 {a} 枚后共有 {total} 枚。原来有多少枚？'],
    ['咕噜球工坊', '工坊有 {total} 个七彩咕噜球，送出一些后还剩 {a} 个。送出了多少个？'],
    ['宠物园', '每个宠物小组有 {a} 只宠物，一共有 {total} 只。可以分成几个小组？'],
    ['咕噜球工坊', '{total} 个咕噜球平均放进 {b} 个盒子，每盒几个？'],
    ['魔法图书馆', '洛贝克读完 {a} 本书后，还差一些才能读到 {total} 本。还差多少本？'],
    ['天空城', '洛贝克有 {total} 枚星星币，买东西后还剩 {a} 枚。他花掉多少枚？'],
  ],
  'unit-time-route': [
    ['魔法学院', '一条魔法彩带长 {a} 厘米，另一条长 {b} 厘米，两条一共长多少厘米？'],
    ['魔法学院', '洛贝克练习魔法用了 {a} 分钟，整理咕噜球用了 {b} 分钟，一共用了多少分钟？'],
    ['星际驿站', '魔法学院到天空城有 {a} 米，到宠物园有 {b} 米。去天空城比去宠物园远多少米？'],
    ['星际驿站', '从魔法学院到宠物园走 {a} 米，再到天空城走 {b} 米，一共走多少米？'],
    ['宠物园', '洛贝克练习魔法用了 {a} 分钟，照顾宠物用了 {b} 分钟。练习比照顾多用了多少分钟？'],
    ['咕噜球工坊', '一瓶魔法药水有 {a} 毫升，另一瓶有 {b} 毫升，两瓶一共多少毫升？'],
  ],
  'pattern-data': [
    ['魔法灯', '魔法灯的亮点数是 {start}、{next1}、{next2}、{next3}，下一个数是多少？'],
    ['蕨类森林', '蕨类森林每排种 {start} 盆魔法花，以后每排多 {step} 盆，第 4 排有多少盆？'],
    ['魔法台阶', '洛贝克从第 {start} 级开始，每次跳过 {step} 级。照规律数，第 4 个数是多少？'],
    ['天空城看台', '第一排有 {start} 个座位，每排多 {step} 个，第 4 排有多少个？'],
    ['星辉广场', '洛贝克第一天收集 {start} 枚星星币，以后每天多收集 {step} 枚，第 4 天收集多少枚？'],
    ['咕噜球工坊', '按每组多 {step} 颗的规律摆放魔法珠，从 {start} 颗开始，第 4 组有多少颗？'],
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
    if (slot >= 8) return { a, b, total, value: b, unit: '人', mode: 'division' }
    return { a, b, value: total, unit: '个', mode: 'multiplication' }
  }
  if (type === 'two-step-app') {
    const a = 20 + slot * 2
    const b = 5 + slot
    const c = 3 + slot
    const mode = slot % 6
    // CONTEXTS 的六个场景操作顺序不同：0/2 是先增加后减少，其余是
    // 先送出/借走，再还回/收到。答案必须跟场景一致，不能一律 a+b-c。
    const increaseThenDecrease = mode === 0 || mode === 2
    const value = increaseThenDecrease ? a + b - c : a - b + c
    const unit = mode === 0 ? '人' : mode === 1 ? '本' : mode === 2 ? '只' : mode === 3 ? '个' : mode === 4 ? '人' : '张'
    return { a, b, c, value, unit, mode: increaseThenDecrease ? 'add-then-subtract' : 'subtract-then-add' }
  }
  if (type === 'unknown-relation') {
    const a = 5 + slot
    const b = 2 + (slot % 6)
    const total = a + b
    return { a, b, total, value: b, unit: '' }
  }
  if (type === 'unit-time-route') {
    const mode = slot % 6
    const a = 12 + slot
    const b = 8 + slot
    if (mode === 2) return { a, b, value: Math.abs(a - b), unit: '米', mode: 'distance-difference' }
    if (mode === 4) return { a, b, value: Math.abs(a - b), unit: '分钟', mode: 'time-difference' }
    return { a, b, value: a + b, unit: mode === 1 ? '分钟' : mode === 3 ? '米' : mode === 5 ? '毫升' : '厘米' }
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
      ? problem.mode === 'division'
        ? `列式：${problem.total} ÷ ${problem.b}。`
        : `列式：${problem.a} × ${problem.b}。`
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
const themeStats = applyRocoTheme(questions)

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'src/data/content/questionBank.grade2.json')
writeFileSync(target, `${JSON.stringify({ version: VERSION, questions }, null, 2)}\n`)
console.log(`已写出 ${questions.length} 道二年级题 → ${target}；选择题 ${choiceCount} 道；洛克王国主题 ${themeStats.total} 道`)
