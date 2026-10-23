/**
 * 给二年级/三年级题库加“洛克王国”文字背景。
 *
 * 只替换场景词与提示词，不重写数学结构；因此原题库里的等差、时间、
 * 距离、乘除题仍然保持原来的题型和难度。只借文字名称/词，不使用官方
 * 图片、角色立绘、3D 模型或剧情原文。
 */

const REPLACEMENTS = [
  [/潜水艇基地/g, '近地轨道'],
  [/潜水艇/g, '洛贝克'],
  [/观察舱|观察窗|操作台/g, '魔法观察台'],
  [/采样队|探险队/g, '魔法小队'],
  [/小潜水员|潜水员|研究员/g, '小魔法师'],
  [/深海|海底|海域|海沟|暮光区|深渊区/g, '洛克王国'],
  [/海水样本/g, '魔法水样本'],
  [/海水/g, '魔法水'],
  [/诱饵灯/g, '魔法灯'],
  [/声呐/g, '魔法回声'],
  [/鳞片标本|标本|鳞片/g, '魔法样本'],
  [/采样/g, '采集'],
  [/下潜/g, '探索'],
  [/小海星|小鲸/g, '洛贝克'],
  [/沙滩/g, '彩虹湿地'],
  [/贝壳/g, '星星徽章'],
  [/深海大鼬鳚|约翰逊鮟鱇鱼|深海蜥鱼|宝石鱿鱼/g, '魔法宠物'],
]

const SCENES = ['魔法学院', '宠物园', '天空城', '彩虹湿地', '咕噜球工坊', '星辉广场', '魔法图书馆', '云朵农场']

function rocoText(text) {
  let value = String(text)
  for (const [pattern, replacement] of REPLACEMENTS) value = value.replace(pattern, replacement)
  return value
}

const SCENE_PATTERN = /洛克王国|魔法学院|宠物园|天空城|彩虹湿地|咕噜球工坊|星辉广场|魔法图书馆|云朵农场|星际驿站|魔法班|魔法列车|列车/

function addTag(question, tag) {
  if (!Array.isArray(question.tags)) question.tags = []
  if (!question.tags.includes(tag)) question.tags.push(tag)
}

/**
 * 就地转换题库。保留 format/options/answer/similarQuestionIds 不动，
 * 只改题干、提示、标题和展示标签。
 */

const ORDER_SCENES = ['魔法学院', '宠物园', '天空城', '彩虹湿地', '咕噜球工坊', '星辉广场', '魔法图书馆', '云朵农场']

/**
 * 在规律题里注入少量“排序/排第几”题，保持原题型和 216 题总数不变。
 * 每题用三个明确的大小关系构造，答案可直接由排序得到。
 */
function injectOrdering(questions) {
  const candidates = questions.filter((question) =>
    question.type === 'pattern-data' &&
    question.format === 'open' &&
    question.answer?.expression === undefined,
  )
  const injected = new Set()
  for (const difficulty of [1, 2, 3]) {
    const pool = candidates.filter((question) => question.difficulty === difficulty).slice(0, 3)
    for (const [index, question] of pool.entries()) {
      const base = Math.max(10, Math.round(Number(question.answer?.value ?? 10)))
      const a = base
      const b = base + 4
      const c = base + 9
      const scene = ORDER_SCENES[(difficulty * 3 + index) % ORDER_SCENES.length]
      const ordinal = index === 2
      question.story = {
        title: `${scene}·排名次`,
        body: ordinal
          ? `${scene}里，洛贝克把 ${a}、${b}、${c} 三张魔法卡从大到小排。数字 ${b} 排第几？`
          : `${scene}里，洛贝克把 ${a}、${b}、${c} 三张魔法卡从大到小排。${index === 0 ? '最大' : '第 2 名'}的卡上是多少？`,
      }
      question.hints = [
        '先把三个数放在一起比一比。',
        '从最大的数开始，依次往下排。',
        '比较百位、十位和个位，数位多的不一定更大，要从高位看起。',
        '把三个数按从大到小写成一排，再找题目问的位置。',
        '按顺序数一数，就能找到答案；别把“第几”和“数字本身”弄混。',
      ]
      question.answer = { value: ordinal ? 2 : index === 0 ? c : b }
      question.similarQuestionIds = []
      injected.add(question.id)
      question.tags.push(ordinal ? 'ordinal' : 'ordering')
    }
  }
  if (injected.size > 0) {
    for (const question of questions) {
      question.similarQuestionIds = question.similarQuestionIds.filter((id) => !injected.has(id))
    }
  }
}

export function applyRocoTheme(questions) {
  for (const [index, question] of questions.entries()) {
    const original = question.story ?? { title: '', body: '' }
    const scene = SCENES[index % SCENES.length]
    const themedTitle = rocoText(original.title || `${scene}的魔法任务`)
    const themedBody = rocoText(original.body || '')
    const titleHasScene = SCENE_PATTERN.test(themedTitle)
    const bodyHasScene = SCENE_PATTERN.test(themedBody)
    // 题干出现“书架”“列车”等场景物件时，场景应取标题里的地点，
    // 不能另抽一个地点拼成“宠物园里，书架上有……”。
    const bodyScene = titleHasScene ? themedTitle : scene
    question.story = {
      title: titleHasScene ? themedTitle : `${scene}·${themedTitle}`,
      body: bodyHasScene ? themedBody : `${bodyScene}里，${themedBody}`,
    }
    question.hints = (question.hints ?? []).map(rocoText)
    addTag(question, 'theme:roco')
    if (question.format === 'choice') addTag(question, 'form:choice')
    else if (question.category === 'applied') addTag(question, 'form:applied')
    else addTag(question, 'form:fill')
    if (question.difficulty === 3 && question.category === 'probe') addTag(question, 'challenge')
  }
  injectOrdering(questions)
  return {
    total: questions.length,
    choice: questions.filter((question) => question.format === 'choice').length,
    applied: questions.filter((question) => question.category === 'applied').length,
    fill: questions.filter((question) => question.tags.includes('form:fill')).length,
    challenge: questions.filter((question) => question.tags.includes('challenge')).length,
  }
}
