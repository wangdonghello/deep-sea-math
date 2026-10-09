import type { Answer } from '../model/types'

/**
 * `src/domain/quiz/answerJudgement` —— 答案判等。
 *
 * 承担 design §2「判等规则」的三条支路：数值型取整后比对、带单位型归一化
 * 单位后比对数值、算式型按 token 序列比对。判等的输入是**孩子提交的原始
 * 字符串**（未归一化），输出只有布尔值——因此本模块是纯函数集合，不 import
 * Vue、不触碰浏览器/Node 全局，可在 Node 下被直接单测。
 */

/**
 * 单位别名表：规范单位 → 等价写法。
 *
 * 只收录小学段真实会出现的六类：通用计数（个/只/颗…）、配对与集体单位
 * （双/对/群）、长度与距离（米/厘米/千米…）、质量（克/千克/吨）、金额
 * （元/角）、时间（秒/分钟/小时/天）。**刻意不收**两类歧义写法：
 * - `度`：温度的「度」与角度的「度」同形，会让 `6度` 的判定变成抛硬币；
 * - `分`：时间的「3分」与金额的「5分」同形，同理。
 *
 * 宁可让歧义单位退回字符串相等，也不能悄悄把它们判成同一个单位——那会
 * 把「6小时」判成「6分钟」对，比判错更难被发现。
 *
 * key 即规范单位，value 首元素必须是它自己（单测钉住）；英制写法大小写
 * 分别显式列出，不依赖大小写折叠（`M` 与 `m` 都要能命中）。
 *
 * 用法上的取舍：数值相等**不足以**判对，单位也要对得上才有意义——
 * `3双 ≠ 3根`。因此配对/集体单位保持独立规范单位，只与自身互认。
 */
export const unitAliases: Record<string, readonly string[]> = {
  个: ['个', '只', '枚', '颗', '粒', '条', '头', '匹', '名', '位', '件', '张', '本', '支', '页', '节', '段', '层', '排', '列', '朵', '片', '面', '首', '句', '顿', '桶', '袋', '盒', '包', '篮', '笼', '艘', '架', '辆', '间', '座', '根', '棵', '株', '盏', '台', '块', '户', '顶', '把'],
  // 配对/成双单位与集体名词**不**并入通用计数：`3双` 是 6 只而 `3根` 是 3 根，
  // 改变量仍然相等；把它们并进 `个` 会让「换了单位但数值相同」判对，那
  // 比判错更糟——孩子学到的是单位可以随便换。
  双: ['双'],
  对: ['对'],
  群: ['群'],
  米: ['米', 'm', 'M'],
  厘米: ['厘米', '公分', 'cm', 'CM'],
  毫米: ['毫米', 'mm', 'MM'],
  千米: ['千米', '公里', 'km', 'KM'],
  克: ['克', 'g', 'G'],
  千克: ['千克', '公斤', 'kg', 'KG'],
  吨: ['吨', 't', 'T'],
  元: ['元', '圆'],
  角: ['角'],
  秒: ['秒', 's', 'sec'],
  分钟: ['分钟', '分', 'min'],
  小时: ['小时', '时', 'hr'],
  天: ['天', '日', 'd', 'day'],
}

/**
 * 数值答案的判定：孩子提交串 → 归一化 → 与 `answer.value` 取整比对，
 * 若答案带单位再要求提交串里的单位与 `answer.unit` 归一化后一致。
 *
 * "孩子提交串"可能是裸数字（`6`）、带单位（`6颗`）、带空格（`6 颗`）、
 * 全角数字（`６`）或前导小数（`.5`，与算式路径能力一致）。单位缺失时
 * 不判错——孩子很有可能只想填数字，规格「数值答案判对」场景正是这一种
 * （提交 `6` 对答案 6 颗）。
 */
export function matchesNumericValue(submitted: string, value: number, unit?: string): boolean {
  const parsed = parseNumericSubmission(submitted)
  if (parsed === null) {
    return false
  }

  if (Math.round(parsed.value) !== Math.round(value)) {
    return false
  }

  // 单位比对只在「答案声明了单位」且「提交确实带了单位文本」时发生；
  // 孩子填了别的单位（6米 对 6颗）判错，忘填单位则放行。
  if (unit !== undefined && parsed.unit !== undefined) {
    return normalizeUnit(parsed.unit) === normalizeUnit(unit)
  }

  return true
}

/**
 * 算式答案的判定：把提交串与预期算式各自切成 token 序列后逐项比对。
 *
 * 切 token 前做三件事：全角转半角、去掉全部空白与零宽字符、乘号/除号异写
 * 收敛（`x`/`X`/`*` → `×`，`/` → `÷`）。因此 `6/24` 会被切成
 * `['6','÷','24']`，与预期 `['24','÷','4']` 不等，判错。
 *
 * **空的目标算式一律判错**：题库里 `expression: ''` 是内容缺失而不是
 * "接受任意提交"，若走"两侧皆空则相等"的常规序列比较，这道题会被
 * 任何输入判对且没有任何报错——那是静默放空，比判错更难被发现。
 *
 * @param submitted 孩子提交的原始字符串。
 * @param expected 题目声明的预期算式。
 * @returns 判对返回 `true`。
 */
export function matchesExpression(submitted: string, expected: string): boolean {
  const target = tokenizeExpression(expected)
  if (target.length === 0) {
    return false
  }

  const actual = tokenizeExpression(submitted)
  if (actual.length === 0) {
    return false
  }

  if (actual.length !== target.length) {
    return false
  }

  return actual.every((token, index) => token === target[index])
}

/**
 * 判等总入口：按答案声明的形态走对应支路。
 *
 * - `answer.expression` 存在 → 算式判等（**不看数值**：`24÷4` 与 `6` 是
 *   同一结果但不同表达，课程要求的是算式本身）。
 * - 否则 → 数值判等（含单位归一化）。
 *
 * 这样安排是因为「算式题」的考察点是列式过程而非算得数，若允许用结果
 * 代替算式，孩子会跳过关系表达这一步，五步引导的 EXPRESSION 步就形同
 * 虚设。
 *
 * @param submitted 孩子提交的原始字符串（未归一化）。
 * @param answer 题目声明的答案形态。
 * @returns 判对返回 `true`。
 */
export function isCorrect(submitted: string, answer: Answer): boolean {
  if (answer.expression !== undefined) {
    return matchesExpression(submitted, answer.expression)
  }

  return matchesNumericValue(submitted, answer.value, answer.unit)
}

/**
 * 别名 → 规范单位的反查表，由 {@link unitAliases} 推导。
 *
 * {@link unitAliases} 以「规范单位 → 别名列表」声明，便于人读；而判定时需要
 * 的反而是「孩子写了 `颗`，它规范单位是什么」。这里在模块加载时一次性反转，
 * 判定路径就是一次 Map 查找，不在循环里反复扫别名列表。
 */
const canonicalUnitByAlias: ReadonlyMap<string, string> = new Map(
  Object.entries(unitAliases).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [alias, canonical] as const),
  ),
)

/**
 * 把单位文本收敛到规范单位。
 *
 * 先做去空白与全角转半角，再查 {@link canonicalUnitByAlias}；查不到的原样
 * 返回（未知单位不会误判成别的单位，只会与同样未知的单位做字符串相等）。
 *
 * 例：`只`/`枚`/`颗` → `个`；`公斤` → `千克`；`cm` → `厘米`。
 */
export function normalizeUnit(unit: string): string {
  const canonical = unit.replace(/[\s\u3000]/g, '').normalize('NFKC')
  return canonicalUnitByAlias.get(canonical) ?? canonical
}

/**
 * 输入清洗：去掉所有"看不见"的字符。
 *
 * 覆盖三类零宽字符：`\u200b-\u200f`（零宽空格/连接符/不连字/左右向标记）、
 * `\u2060`（word joiner）、`\ufeff`（BOM / 零宽不换行空格）。它们在编辑器里
 * 完全不可见——孩子从别处复制算式粘进输入框时很可能带上，若不清掉，一个
 * "看起来与预期完全相同"的提交会被判错，而孩子根本看不出差在哪。
 *
 * 注意 JS 的 `\s` **不包含**上述字符，也**不包含** `\u3000`（全角空格），
 * 所以这里显式并列，而不是指望 `\s` 兜住。
 */
const INVISIBLE_PATTERN = /[\s\u200b-\u200f\u2060\ufeff]/g

/**
 * 去掉全部不可见字符。零宽字符在 NFKC 归一**之后**清（NFKC 会把一些字符
 * 分解出零宽成分），因此调用方应当先 `normalize` 再 `strip` 的顺序不能反。
 */
function stripInvisible(input: string): string {
  return input.replace(INVISIBLE_PATTERN, '')
}

/**
 * 算式切分：数字/运算符交替的 token 序列。
 *
 * 数字 token 归一为十进制（`04` → `4`，`2.50` → `2.5`），因此前导零与
 * 尾随零不影响判等；运算符 token 只保留 `+ - × ÷` 四种。任何无法识别的
 * 字符（中文、字母）使整个序列作废——返回空数组，调用方据此判错。
 *
 * `=` 只允许出现在最前面（`=24÷4` 这种从"列式"习惯带入的写法）；
 * 中途出现 `=` 视为无效输入，防止 `24÷4=6` 冒充算式通过。
 */
export function tokenizeExpression(expression: string): string[] {
  const compact = stripInvisible(expression.normalize('NFKC'))
  const body = compact.startsWith('=') ? compact.slice(1) : compact

  const tokens: string[] = []
  let index = 0

  while (index < body.length) {
    const char = body[index]

    if (startsNumber(body, index)) {
      let literal = ''
      while (index < body.length && (isDigit(body[index]) || body[index] === '.')) {
        literal += body[index]
        index += 1
      }
      // 尾随小数点（`5.`）是残缺写法：`Number('5.')` 会静默返回 5，把它
      // 归一成 `5` 会让 `3..4` 之外的另一种手滑被悄悄放过。宁可整串作废。
      if (literal.endsWith('.')) {
        return []
      }
      const numeric = Number(literal)
      // `3..4` 这类写法 Number 出来是 NaN，宁可整串作废也不拿 NaN 去比。
      if (!Number.isFinite(numeric)) {
        return []
      }
      tokens.push(String(numeric))
      continue
    }

    const operator = toOperator(char)
    if (operator !== null) {
      tokens.push(operator)
      index += 1
      continue
    }

    // 未识别字符：中文算式（`二十四除以四`）、字母、`=` 全部落在这里。
    return []
  }

  return tokens
}

/** ASCII 数字判断。NFKC 之后全角数字已转半角，这里只需认 ASCII。 */
function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

/**
 * `body` 的 `index` 处是否开始一个数字。
 *
 * 除了普通数字，还接受前导小数（`.5`）——这与数值路径的解析能力**刻意
 * 保持一致**：两条路径都吃 `.5`，孩子不会因为换了输入框就忽然填不进去。
 *  `.` 后面没跟数字时不算（那是运算符位或残缺输入，交给后面判非法）。
 */
function startsNumber(body: string, index: number): boolean {
  const char = body[index]
  if (isDigit(char)) {
    return true
  }
  return char === '.' && index + 1 < body.length && isDigit(body[index + 1])
}

/**
 * 运算符归一：把乘号/除号的各种写法收敛到 `×` 与 `÷`。
 *
 * 覆盖孩子可能从键盘、题库或课本里带来的写法：ASCII `*` `x` `X`、间隔号
 * `·` `⋅`、花式星号 `∗`、U+00D7 的 `×` 与 `÷`、分数斜杠 `/`。**目标算式的
 *  `×`/`÷` 本身也要能被识别**——否则预期算式里出现乘号会被当成"未识别
 * 字符"而整串作废，孩子无论填什么都是错。
 *
 * 这里刻意**不**把加减号做多映射：加减只有一种常见写法，多映射只会让
 * 拼写错误被悄悄放过。
 */
function toOperator(char: string): string | null {
  switch (char) {
    case '+':
      return '+'
    case '-':
      return '-'
    case '*':
    case 'x':
    case 'X':
    case '\u00b7': // ·
    case '\u22c5': // ⋅
    case '\u2217': // ∗
    case '\u00d7': // × 本身
      return '×'
    case '/':
    case '\u00f7': // ÷ 本身
      return '÷'
    default:
      return null
  }
}

/**
 * 解析孩子的数值提交：`6` / `6颗` / `6 颗` / `６` / `.5`。
 *
 * 取**开头**的数值字面量（支持负号、小数，以及 `.5` 这种前导小数写法——
 * 与 {@link tokenizeExpression} 对 `.5` 的接受度保持一致，两条路径能力
 * 对称，孩子不会因为换了个输入框就忽然填不进去）。其余文本视为单位。剩余
 * 文本里若出现数字或运算符（如 `6/24` 的 `/24`、`6+1` 的 `+1`），判定为
 * "这不是一次数值提交"而返回 `null`——否则 `6+1` 会因为开头是 6 而被
 * 误判成对的，那等于在教孩子瞎填。
 *
 * @returns 解析成功时给出数值与可选单位；不是数值提交时返回 `null`。
 */
function parseNumericSubmission(submitted: string): { value: number; unit?: string } | null {
  const compact = stripInvisible(submitted.normalize('NFKC'))

  const match = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)/.exec(compact)
  if (match === null) {
    return null
  }

  const value = Number(match[0])
  if (!Number.isFinite(value)) {
    return null
  }

  const rest = compact.slice(match[0].length)
  if (rest === '') {
    return { value }
  }

  // 剩余文本必须是"纯单位"：不含数字、不含运算符，否则是算式不是数值答案。
  if (/[\d+\-*/×÷.=%]/.test(rest)) {
    return null
  }

  return { value, unit: rest }
}
