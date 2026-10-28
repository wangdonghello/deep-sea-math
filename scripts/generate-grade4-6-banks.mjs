import { writeFileSync } from 'node:fs'

/**
 * 4–6 年级题库生成器（每年级 216 题）。
 *
 * 约束与 1–2 年级生成器一致：6 类型 × 3 难度 × 12 题；每个 type × difficulty
 * 4 道选择、8 道开放；答案由同一组参数计算，避免手写答案漂移。
 * 生成后由 `assertValidQuestionBank` 与审计测试复核。
 */

const VERSION = '4.0.0'
const TYPES = ['number-sense', 'mul-div', 'two-step-app', 'unknown-relation', 'unit-time-route', 'pattern-data']
const STANDARD = {
  4: { 'number-sense': '4.NF.1', 'mul-div': '4.NBT.5', 'two-step-app': '4.OA.3', 'unknown-relation': '4.OA.3', 'unit-time-route': '4.MD.3', 'pattern-data': '4.OA.5' },
  5: { 'number-sense': '5.NF.1', 'mul-div': '5.NBT.7', 'two-step-app': '5.NF.6', 'unknown-relation': '5.OA.2', 'unit-time-route': '5.MD.3', 'pattern-data': '5.OA.3' },
  6: { 'number-sense': '6.RP.1', 'mul-div': '6.NS.1', 'two-step-app': '6.RP.3', 'unknown-relation': '6.EE.7', 'unit-time-route': '6.G.2', 'pattern-data': '6.SP.3' },
}
const DOMAIN = { 'number-sense': 'NF', 'mul-div': 'NBT', 'two-step-app': 'OA', 'unknown-relation': 'OA', 'unit-time-route': 'MD', 'pattern-data': 'OA' }
const DOMAIN_OVERRIDE = {
  4: { 'unit-time-route': 'MD', 'pattern-data': 'OA' },
  5: { 'number-sense': 'NF', 'unit-time-route': 'MD' },
  6: { 'number-sense': 'RP', 'mul-div': 'NS', 'two-step-app': 'RP', 'unknown-relation': 'EE', 'unit-time-route': 'G', 'pattern-data': 'SP' },
}
const HINTS = {
  'number-sense': ['先看清数位、分母或百分号，再决定用哪一种表示。', '把整数、分数、小数或百分数统一成同一种形式。', '分数题先找分母，小数题先看小数点位置。', '把已知量和未知量写成一道算式。', '按算理一步步算，最后检查结果是否在合理范围内。'],
  'mul-div': ['先判断题目是在求几个几，还是把总数平均分。', '乘法找因数和积，除法找被除数、除数和商。', '多位数可以拆成整十、整百再算。', '列出乘法或除法算式，注意进位与余数。', '用乘除互逆检查结果，看看商乘除数是否回到被除数。'],
  'two-step-app': ['先读题，圈出已知条件和最后的问题。', '想一想先求什么、再求什么。', '把第一步的结果作为第二步的条件。', '分步列式，必要时加上单位。', '回头检查每一步是否都在回答题目，单位是否一致。'],
  'unknown-relation': ['找出题目里未知的那个量。', '把未知量看成一个可以参与运算的数。', '根据等量关系列式，不要急着猜答案。', '用逆运算把未知量单独留下来。', '把算出的结果代回原题，检查等式是否成立。'],
  'unit-time-route': ['先看题目求的是长度、面积、体积、角度还是时间。', '把单位统一，再代入公式。', '长方形、长方体、圆等图形先写对公式。', '列式时把数字和单位一起写清楚。', '算完检查单位：长度、面积、体积不能混用。'],
  'pattern-data': ['先观察相邻两个数或两组数据的变化。', '找出每次增加、减少或乘除的规律。', '把规律写成算式，再推到要求的第几个。', '数据题先排序或求总数、份数。', '用后面的项验证规律，确认不是巧合。'],
}

const CONTEXTS = ['深海观测站', '珊瑚实验室', '鲸落考察队', '热泉探测船', '海沟研究站', '潮汐观测点', '极地科考船', '深海机器人', '海洋数据站', '潜水器驾驶舱', '海底农场', '蓝色图书馆']
const pick = (list, index) => list[index % list.length]

function gcd(a, b) { while (b !== 0) { [a, b] = [b, a % b] } return Math.abs(a) }
function lcm(a, b) { return Math.abs(a * b) / gcd(a, b) }

function buildGrade4(type, difficulty, variant) {
  const d = difficulty
  const title = pick(CONTEXTS, variant + d)
  if (type === 'number-sense') {
    const mode = variant % 4
    if (mode === 0) {
      const den = [4, 5, 6][d - 1]; const mult = 2 + variant % 3
      return { title, body: `把 3/${den} 化成分母是 ${den * mult} 的分数，分子是多少？`, value: 3 * mult, standard: '4.NF.1' }
    }
    if (mode === 1) {
      const decimal = [0.6, 0.8, 0.4][variant % 3] + (d - 1) * 0.1
      return { title, body: `${decimal} 里面有多少个 0.1？`, value: Math.round(decimal * 10), standard: '4.NBT.2' }
    }
    if (mode === 2) {
      const pairs = [[12, 18], [16, 24], [24, 36]][variant % 3]
      return { title, body: `${pairs[0]} 和 ${pairs[1]} 的最大公因数是多少？`, value: gcd(pairs[0], pairs[1]), standard: '4.OA.4' }
    }
    const whole = [12, 20, 24][variant % 3]; const denominator = [3, 4, 6][d - 1]
    return { title, body: `${whole} 的 1/${denominator} 是多少？`, value: whole / denominator, standard: '4.NF.4' }
  }
  if (type === 'mul-div') {
    const a = [12, 23, 34][variant % 3] + d * 10
    const b = [4, 6, 8][variant % 3]
    if (variant % 3 === 0) return { title, body: `潜水器每箱装 ${a} 份样本，${b} 箱一共有多少份？`, value: a * b, unit: '份' }
    if (variant % 3 === 1) return { title, body: `${a * b} 份样本平均装进 ${b} 个箱子，每箱多少份？`, value: a, unit: '份' }
    return { title, body: `${a} 乘多少等于 ${a * b}？`, value: b }
  }
  if (type === 'two-step-app') {
    const a = 120 + d * 30 + variant; const b = 40 + variant; const c = 25 + variant * 2
    if (variant % 2 === 0) return { title, body: `观测站原有 ${a} 份记录，上午新增 ${b} 份，下午整理掉 ${c} 份。现在有多少份？`, value: a + b - c, unit: '份' }
    return { title, body: `每组有 ${b} 个样本，${d + 2} 组共有多少个？再拿走 ${c} 个，还剩多少个？`, value: b * (d + 2) - c, unit: '个' }
  }
  if (type === 'unknown-relation') {
    const a = 30 + d * 10 + variant; const b = a + 45 + variant
    if (variant % 2 === 0) return { title, body: `一个数加上 ${a} 等于 ${b}，这个数是多少？`, value: b - a }
    const factor = 3 + variant % 5; return { title, body: `${factor} 乘一个数等于 ${factor * a}，这个数是多少？`, value: a }
  }
  if (type === 'unit-time-route') {
    const l = 6 + d * 2 + variant % 4; const w = 4 + variant % 3
    if (variant % 3 === 0) return { title, body: `一块长方形观测台长 ${l} 米、宽 ${w} 米，面积是多少平方米？`, value: l * w, unit: '平方米', standard: '4.MD.3' }
    if (variant % 3 === 1) return { title, body: `长方形观测台长 ${l} 米、宽 ${w} 米，周长是多少米？`, value: 2 * (l + w), unit: '米', standard: '4.MD.3' }
    const angle = 30 + (variant % 4) * 10; return { title, body: `一个角是 ${angle} 度，它的余角是多少度？`, value: 90 - angle, unit: '度', standard: '4.G.1' }
  }
  const start = 5 + d * 2 + variant; const step = 1 + d + variant % 4
  return { title, body: `数列从 ${start} 开始，每次增加 ${step}。第 5 个数是多少？`, value: start + step * 4 }
}

function buildGrade5(type, difficulty, variant) {
  const d = difficulty
  const title = pick(CONTEXTS, variant + d + 3)
  if (type === 'number-sense') {
    if (variant % 3 === 0) {
      const den = [6, 8, 10][d - 1]; const a = 2 + variant % 3; const b = 1 + variant % 2
      return { title, body: `${a}/${den} + ${b}/${den} 的分子是多少？`, value: a + b, standard: '5.NF.1' }
    }
    if (variant % 3 === 1) {
      const a = [0.6, 0.8, 1.2][variant % 3]; const b = [0.5, 0.25, 0.4][variant % 3]
      return { title, body: `${a} × ${b} 等于多少？`, value: Number((a * b).toFixed(2)), unit: '', standard: '5.NBT.7' }
    }
    const den = [3, 4, 5][d - 1]; const whole = den * (3 + variant % 4)
    return { title, body: `${whole} 的 2/${den} 是多少？`, value: (whole * 2) / den, standard: '5.NF.4' }
  }
  if (type === 'mul-div') {
    const a = Number(([1.2, 2.4, 3.6][variant % 3] + (d - 1) * 0.2).toFixed(1)); const b = [2, 3, 4][variant % 3]
    if (variant % 2 === 0) return { title, body: `${a} × ${b} 等于多少？`, value: Number((a * b).toFixed(2)), unit: '', standard: '5.NBT.7' }
    const den = [3, 4, 5][d - 1]; const whole = den * (2 + variant % 4)
    return { title, body: `${whole} 的 1/${den} 是多少？`, value: whole / den, standard: '5.NF.4' }
  }
  if (type === 'two-step-app') {
    const l = 4 + d + variant % 3; const w = 3 + variant % 2; const h = 2 + variant % 2; const per = 2 + d
    return { title, body: `一个长方体水箱长 ${l} 米、宽 ${w} 米、高 ${h} 米。先求体积，再按每立方米放 ${per} 个样本计算，一共放多少个？`, value: l * w * h * per, unit: '个', standard: '5.MD.5' }
  }
  if (type === 'unknown-relation') {
    const a = 2 + d + variant % 3; const b = 5 + variant % 4; const c = a * b
    return { title, body: `${a} 乘一个数等于 ${c}，这个数是多少？`, value: b }
  }
  if (type === 'unit-time-route') {
    const l = 3 + d + variant % 3; const w = 2 + variant % 2; const h = 2 + variant % 2
    if (variant % 3 === 0) return { title, body: `长方体观测箱长 ${l} 分米、宽 ${w} 分米、高 ${h} 分米，体积是多少立方分米？`, value: l * w * h, unit: '立方分米', standard: '5.MD.5' }
    if (variant % 3 === 1) return { title, body: `${l} 米等于多少厘米？`, value: l * 100, unit: '厘米', standard: '5.MD.1' }
    const x = 2 + variant % 5; return { title, body: `观测点在平面上的位置是 (${x}, ${2 + variant % 4})，向右移动 2 格后的横坐标是多少？`, value: x + 2, standard: '5.G.1' }
  }
  const start = 4 + d + variant; const step = 3 + variant % 3
  const terms = Array.from({ length: 5 }, (_, index) => start + step * index)
  return { title, body: `数列 ${terms.slice(0, 3).join('、')} … 的第 5 个数是多少？`, value: terms[4] }
}

function buildGrade6(type, difficulty, variant) {
  const d = difficulty
  const title = pick(CONTEXTS, variant + d + 6)
  if (type === 'number-sense') {
    if (variant % 4 === 0) {
      const a = 2 + variant % 3; const b = 3 + variant % 4; const total = (a + b) * (2 + d)
      return { title, body: `把 ${total} 个样本按 ${a}:${b} 分给两组，较少的一组分到多少个？`, value: Math.min(a, b) * (total / (a + b)), unit: '个', standard: '6.RP.1' }
    }
    if (variant % 4 === 1) {
      const base = [40, 60, 80][variant % 3]; const percent = [20, 25, 50][variant % 3]
      return { title, body: `${base} 的 ${percent}% 是多少？`, value: (base * percent) / 100, standard: '6.RP.3' }
    }
    if (variant % 4 === 2) {
      const a = -5 - d - variant % 3; const b = 3 + variant % 4
      return { title, body: `${a} + ${b} 等于多少？`, value: a + b, standard: '6.NS.5' }
    }
    const a = [12, 18, 24][variant % 3]; const b = [18, 24, 36][variant % 3]
    return { title, body: `${a} 和 ${b} 的最小公倍数是多少？`, value: lcm(a, b), standard: '6.NS.4' }
  }
  if (type === 'mul-div') {
    const den = [2, 4, 5][variant % 3]; const whole = den * (1 + d + variant % 4)
    if (variant % 2 === 0) return { title, body: `${whole} 里面有多少个 1/${den}？`, value: whole * den, standard: '6.NS.1' }
    const a = [1.2, 2.4, 3.6][variant % 3]; const b = [2, 3, 4][variant % 3]
    return { title, body: `${a * b} ÷ ${b} 等于多少？`, value: a, standard: '6.NS.3' }
  }
  if (type === 'two-step-app') {
    const price = 80 + d * 20 + variant; const percent = [10, 20, 25][variant % 3]
    return { title, body: `一套观测设备原价 ${price} 元，降价 ${percent}% 出售。便宜了多少元？`, value: (price * percent) / 100, unit: '元', standard: '6.RP.3' }
  }
  if (type === 'unknown-relation') {
    const a = 2 + d + variant % 3; const b = 3 + variant % 4
    return { title, body: `${a}:${b} = ${a * 4}:x，x 是多少？`, value: b * 4 }
  }
  if (type === 'unit-time-route') {
    const a = 4 + d + variant % 3; const b = 6 + variant % 4; const c = 3 + variant % 3
    if (variant % 2 === 0) return { title, body: `一个长方体观测箱长 ${a} 米、宽 ${b} 米、高 ${c} 米，体积是多少立方米？`, value: a * b * c, unit: '立方米', standard: '6.G.2' }
    return { title, body: `一块三角形观测板底 ${a * 2} 米、高 ${b} 米，面积是多少平方米？`, value: (a * 2 * b) / 2, unit: '平方米', standard: '6.G.1' }
  }
  const base = [70, 80, 90][d - 1]; const delta = 1 + variant % 5
  const values = [base, base + delta, base + delta * 2, base + delta * 3, base + delta * 4]
  return { title, body: `五次观测数据是 ${values.join('、')}，平均数是多少？`, value: Number((values.reduce((a, b) => a + b, 0) / 5).toFixed(2)) }
}

const BUILDERS = { 4: buildGrade4, 5: buildGrade5, 6: buildGrade6 }
const QUESTION_UNITS = new Set(['个', '份', '本', '厘米', '米', '分钟', '元', '千克', '克', '升', '毫升', '平方米', '平方厘米', '立方厘米', '立方分米', '立方米', '度', '千米'])

function optionsFor(value, unit, variant) {
  const step = Number.isInteger(value) ? 1 + (variant % 3) : 0.1
  const candidates = [value + step, value - step, value + step * 10, value * 2 + step]
  const unique = []
  for (const candidate of candidates) {
    const rounded = Number(candidate.toFixed(2))
    if (rounded !== value && !unique.includes(rounded) && Number.isFinite(rounded)) unique.push(rounded)
    if (unique.length === 3) break
  }
  const labels = unique.map((item) => `${item}${unit ?? ''}`)
  const answerLabel = `${value}${unit ?? ''}`
  const correctIndex = variant % 4
  const optionLabels = [...labels]
  optionLabels.splice(correctIndex, 0, answerLabel)
  const ids = ['A', 'B', 'C', 'D']
  return {
    options: optionLabels.slice(0, 4).map((label, index) => ({ id: ids[index], label })),
    optionId: ids[correctIndex],
  }
}

const questions = []
for (const grade of [4, 5, 6]) {
  let index = 0
  for (const type of TYPES) {
    for (let difficulty = 1; difficulty <= 3; difficulty += 1) {
      for (let variant = 0; variant < 12; variant += 1) {
        const format = variant < 4 ? 'choice' : 'open'
        const spec = BUILDERS[grade](type, difficulty, variant)
        const unit = spec.unit && QUESTION_UNITS.has(spec.unit) ? spec.unit : undefined
        const standard = spec.standard ?? STANDARD[grade][type]
        const domain = standard.split('.')[1]
        const source = `https://www.thecorestandards.org/Math/Content/${grade}/${domain}/`
        const answer = { value: spec.value, ...(unit === undefined ? {} : { unit }) }
        if (format === 'choice') {
          const { options, optionId } = optionsFor(spec.value, unit, variant)
          answer.optionId = optionId
          questions.push({
            id: `g${grade}-${String(index + 1).padStart(3, '0')}`, grade, format, type, difficulty,
            category: ['basic', 'applied', 'probe'][variant % 3],
            story: { title: spec.title, body: spec.body }, requiresFiveStep: false,
            hints: HINTS[type], answer, similarQuestionIds: [],
            tags: [type, ...(type === 'unknown-relation' ? ['skill-muldiv-unknown'] : []), `difficulty-${difficulty}`, `standard:${standard}`, `form:choice`],
            sources: [source], options,
          })
        } else {
          questions.push({
            id: `g${grade}-${String(index + 1).padStart(3, '0')}`, grade, format, type, difficulty,
            category: ['basic', 'applied', 'probe'][variant % 3],
            story: { title: spec.title, body: spec.body }, requiresFiveStep: false,
            hints: HINTS[type], answer, similarQuestionIds: [],
            tags: [type, ...(type === 'unknown-relation' ? ['skill-muldiv-unknown'] : []), `difficulty-${difficulty}`, `standard:${standard}`, 'form:fill'],
            sources: [source],
          })
        }
        index += 1
      }
    }
  }
  writeFileSync(`src/data/content/questionBank.grade${grade}.json`, JSON.stringify({ version: VERSION, questions }, null, 2) + '\n')
  console.log('wrote grade', grade, questions.length)
  questions.length = 0
}
