/**
 * 三年级题库的“洛克王国文字主题”转换。
 *
 * 只替换题干/提示与展示标签，不改数学结构、答案、相似题链接与来源。
 * 不使用官方图片、角色立绘、3D 模型或剧情原文；这里的名称/词仅作为文字背景。
 */

const SCENES = ['魔法学院', '宠物园', '天空城', '彩虹湿地', '咕噜球工坊', '星辉广场', '魔法图书馆', '云朵农场']
const ACTIONS = ['整理魔法书', '收集咕噜球', '照顾宠物', '点亮魔法灯', '搬运魔法果', '布置比赛场地', '清点星星徽章', '修补彩虹桥']
const ITEM_BY_UNIT = {
  个: '魔法果', 份: '魔法书', 枚: '星星徽章', 张: '卡片', 本: '魔法书', 条: '魔法绳',
  节: '魔法电池', 次: '魔法记录', 项: '任务', 米: '小路', 厘米: '彩带', 分钟: '分钟',
  元: '金币', 千克: '魔法石', 克: '魔法粉', 只: '宠物', 人: '小魔法师', 颗: '星星糖',
  盒: '咕噜球', 瓶: '魔法药水', 袋: '魔法种子', 朵: '魔法花', 块: '魔法砖', 台: '魔法装置',
}

function numberFromId(id) {
  const match = /(\d+)$/.exec(id)
  return match === null ? 0 : Number(match[1])
}

function expressionOf(question) {
  const hint = String(question.hints?.[3] ?? '')
  const match = /列式：([^。]+)/.exec(hint)
  return (match?.[1] ?? question.answer.expression ?? '').replace(/\s+/g, '').trim()
}

function parseExpression(expression) {
  const parts = expression.split(/([+\-×÷])/).filter((part) => part !== '')
  const operands = parts.filter((part) => /^\d+$/.test(part)).map(Number)
  const ops = parts.filter((part) => ['+', '-', '×', '÷'].includes(part))
  return { operands, ops }
}

function pickIndices(id) {
  const n = numberFromId(id)
  return {
    scene: SCENES[n % SCENES.length],
    action: ACTIONS[Math.floor(n / SCENES.length) % ACTIONS.length],
  }
}

function itemFor(question) {
  return ITEM_BY_UNIT[question.answer.unit ?? ''] ?? '魔法道具'
}

function resultSentence(question, expression, operands, ops, scene, action, item) {
  const unit = question.answer.unit ?? ''
  const asksExpression = question.answer.expression !== undefined
  const finish = (text) => asksExpression ? `${text} 请写出表示这个数量的算式。` : text
  if (ops.length === 0) return finish('算一算结果是多少。')

  if (ops.length === 1) {
    const [a, b] = operands
    if (ops[0] === '+') return finish(`${scene}里，洛贝克${action}，先有 ${a} ${unit}${item}，又得到 ${b} ${unit}${item}。现在一共有多少${unit}？`)
    if (ops[0] === '-') return finish(`${scene}里原来有 ${a} ${unit}${item}，洛贝克${action}用去 ${b} ${unit}。还剩多少${unit}？`)
    if (ops[0] === '×') return finish(`${scene}里有 ${a} 组${item}，每组 ${b} ${unit}。一共有多少${unit}？`)
    return finish(`${scene}里把 ${a} ${unit}${item}平均分到 ${b} 个区域，每个区域分到多少${unit}？`)
  }

  if (ops.length === 2) {
    const [a, b, c] = operands
    const pair = ops.join(' ')
    if (pair === '+ +') return finish(`${scene}里原来有 ${a} ${unit}${item}，洛贝克先${action}得到 ${b} ${unit}，又得到 ${c} ${unit}。现在一共有多少${unit}？`)
    if (pair === '+ -') return finish(`${scene}里原来有 ${a} ${unit}${item}，先增加 ${b} ${unit}，后来用去 ${c} ${unit}。现在有多少${unit}？`)
    if (pair === '- -') return finish(`${scene}里原来有 ${a} ${unit}${item}，洛贝克先${action}用去 ${b} ${unit}，又用去 ${c} ${unit}。还剩多少${unit}？`)
    if (pair === '- +') return finish(`${scene}里原来有 ${a} ${unit}${item}，用去 ${b} ${unit}，后来又得到 ${c} ${unit}。现在有多少${unit}？`)
    if (pair === '× +') return finish(`${scene}里有 ${a} 组${item}，每组 ${b} ${unit}，又额外增加 ${c} ${unit}。一共有多少${unit}？`)
    if (pair === '× -') return finish(`${scene}里有 ${a} 组${item}，每组 ${b} ${unit}，后来用去 ${c} ${unit}。还剩多少${unit}？`)
    if (pair === '- ×') return finish(`${scene}里原来有 ${a} ${unit}${item}，每组有 ${b} ${unit}，一共 ${c} 组；洛贝克${action}把这些全部用去。还剩多少${unit}？`)
    if (pair === '+ ×') return finish(`${scene}里原来有 ${a} ${unit}${item}，每组有 ${b} ${unit}，又增加 ${c} 组。现在一共有多少${unit}？`)
    if (pair === '÷ +') return finish(`${scene}里把 ${a} ${unit}${item}平均分到 ${b} 个区域，每个区域分到一些，后来又增加 ${c} ${unit}。现在一共有多少${unit}？`)
    if (pair === '÷ -') return finish(`${scene}里把 ${a} ${unit}${item}平均分到 ${b} 个区域，每个区域分到一些，后来用去 ${c} ${unit}。还剩多少${unit}？`)
  }

  return finish(`${scene}里，洛贝克遇到一道魔法算式：${expression}。算一算结果是多少？`)
}

function makeHints(question, expression, operands, ops, item) {
  const relation = question.type === 'mul-div'
    ? '想一想：每份有几个、有几份，用乘法；已知总数和份数，用除法。'
    : question.type === 'unknown-relation'
      ? '把不知道的数量看成一个空位，用逆运算把它求出来。'
      : question.type === 'pattern-data'
        ? '先看相邻两个数相差多少，再按同样的规律往下推。'
        : question.type === 'unit-time-route'
          ? '先统一单位，再算经过的时间或一共走的路。'
          : '先看清数量之间的关系，再决定用加法还是减法。'
  return [
    '先读题，找出已知的魔法数量和要问的问题。',
    '把题目里的数量写下来，别急着算。',
    relation,
    `列式：${expression}。`,
    '先算出一部分，再合并或比较；方法对了，答案自然就出来了。',
  ]
}

function chooseOptions(question) {
  const optionIds = ['A', 'B', 'C', 'D']
  const correct = question.answer.value
  const unit = question.answer.unit ?? ''
  const distractors = [correct + 1, correct + 2, correct + 10, correct - 1]
    .filter((value, index, values) => value > 0 && value !== correct && values.indexOf(value) === index)
    .slice(0, 3)
  if (distractors.length < 3) return false
  const labels = [correct, ...distractors].map((value) => `${value}${unit}`)
  const correctIndex = numberFromId(question.id) % 4
  question.options = optionIds.map((id, index) => ({
    id,
    label: labels[index === correctIndex ? 0 : 1 + (index < correctIndex ? index : index - 1)],
  }))
  question.answer.optionId = optionIds[correctIndex]
  question.format = 'choice'
  return true
}

function addTag(question, tag) {
  if (!question.tags.includes(tag)) question.tags.push(tag)
}

/**
 * 就地转换题库。返回统计信息，便于生成脚本打印。
 */
export function applyRocoTheme(questions) {
  for (const question of questions) {
    question.story = { title: '', body: '' }
    question.format = 'open'
    delete question.options
    delete question.answer.optionId
  }

  for (const question of questions) {
    const { scene, action } = pickIndices(question.id)
    const item = itemFor(question)
    const expression = expressionOf(question)
    const { operands, ops } = parseExpression(expression)
    question.story = {
      title: `${scene}·${action}`,
      body: resultSentence(question, expression, operands, ops, scene, action, item),
    }
    question.hints = makeHints(question, expression, operands, ops, item)
  }

  // 只从「非应用题、无相似链接、非算式答案」的题里选选择题，保证
  // 选择题、填空题、应用题三类互不重叠。
  const candidates = questions.filter((question) =>
    question.category !== 'applied' &&
    question.similarQuestionIds.length === 0 &&
    question.answer.expression === undefined,
  )
  const chosen = candidates.slice(0, 72)
  for (const question of questions) {
    addTag(question, 'theme:roco')
    if (question.category === 'applied') addTag(question, 'form:applied')
    if (question.difficulty === 3 && question.category === 'probe') addTag(question, 'challenge')
  }
  for (const question of chosen) {
    if (!chooseOptions(question)) continue
    addTag(question, 'form:choice')
  }
  for (const question of questions) {
    if (question.format !== 'choice' && question.category !== 'applied') addTag(question, 'form:fill')
  }
  return {
    total: questions.length,
    choice: questions.filter((question) => question.format === 'choice').length,
    applied: questions.filter((question) => question.category === 'applied').length,
    fill: questions.filter((question) => question.tags.includes('form:fill')).length,
    challenge: questions.filter((question) => question.tags.includes('challenge')).length,
  }
}
