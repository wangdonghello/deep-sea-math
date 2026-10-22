import { describe, expect, it } from 'vitest'

import {
  isCorrect,
  matchesExpression,
  matchesNumericValue,
  normalizeUnit,
  tokenizeExpression,
  unitAliases,
} from '../../../src/domain/quiz/answerJudgement'
import type { Answer } from '../../../src/domain/model/types'

/**
 * `domain/quiz/answerJudgement` 的行为契约。
 *
 * 三条判等路径各自都有正反用例：数值（含「裸数值答带单位题」的宽松）、
 * 单位（归一化后等值判定）、算式（token 序列比对）。任务清单里点名的六
 * 个用例（`6`/`6颗`/`6 颗` 判对、`8` 判错、`24÷4` 判对、`6/24` 判错）
 * 在对应的 describe 里逐条落地。
 */

describe('domain/quiz/ answerJudgement — 数值判等', () => {
  const answer: Answer = { value: 6, unit: '颗' }

  it('提交 6 对 {value:6, unit:"颗"} 判对（裸数值宽松）', () => {
    expect(isCorrect('6', answer)).toBe(true)
  })

  it('提交 6颗 判对', () => {
    expect(isCorrect('6颗', answer)).toBe(true)
  })

  it('提交 "6 颗"（带空格）判对', () => {
    expect(isCorrect('6 颗', answer)).toBe(true)
  })

  it('提交 8 判错', () => {
    expect(isCorrect('8', answer)).toBe(false)
  })

  it('提交其它数值判错', () => {
    expect(isCorrect('7', answer)).toBe(false)
    expect(isCorrect('60', answer)).toBe(false)
    expect(isCorrect('-6', answer)).toBe(false)
  })

  it('前导零仍按数值判等（06 即 6）', () => {
    expect(isCorrect('06', answer)).toBe(true)
  })

  it('单位不一致判错（6米 对 6颗）', () => {
    expect(isCorrect('6米', answer)).toBe(false)
  })

  it('非数值输入判错（空串、纯单位、无数字）', () => {
    expect(isCorrect('', answer)).toBe(false)
    expect(isCorrect('颗', answer)).toBe(false)
    expect(isCorrect('六', answer)).toBe(false)
  })

  it('小数答案按数值判等（四舍五入到整数后比对）', () => {
    // 取整后比对：3.4 与 3 视为相符，3.6 与 3 视为不符。
    expect(isCorrect('3.4', { value: 3 })).toBe(true)
    expect(isCorrect('3', { value: 3.4 })).toBe(true)
    expect(isCorrect('3.6', { value: 3 })).toBe(false)
  })

  it('无单位答案忽略提交里带的单位（6颗 对 {value:6}）', () => {
    expect(isCorrect('6颗', { value: 6 })).toBe(true)
    expect(isCorrect('8颗', { value: 6 })).toBe(false)
  })

  it('matchesNumericValue 单独暴露数值路径，供答题步骤直接判定', () => {
    expect(matchesNumericValue('6', 6)).toBe(true)
    expect(matchesNumericValue('6颗', 6, '颗')).toBe(true)
    expect(matchesNumericValue('6个', 6, '颗')).toBe(true)
    expect(matchesNumericValue('6米', 6, '颗')).toBe(false)
    expect(matchesNumericValue('六', 6)).toBe(false)
  })

  it('混在数字后面的运算符/数字不算数值提交（6/24、6+1 均判错）', () => {
    // 否则「开头正好是 6」会被当成蒙对：6+1 等于 7，不能因为键入以 6
    // 开头就放行——那等于在教孩子瞎填。
    expect(isCorrect('6/24', { value: 6 })).toBe(false)
    expect(isCorrect('6+1', { value: 6 })).toBe(false)
    expect(isCorrect('6+1', { value: 7 })).toBe(false)
  })

  it('数值后跟纯文本单位仍按数值判等', () => {
    expect(isCorrect('6颗。', { value: 6 })).toBe(true)
  })

  it('数字前的其他文字不算数值提交（约6 判错）', () => {
    // 数值必须在最前：输入框是"填数字"用的，前导文字（约6、一共6）说明
    // 孩子在填句子而不是答案，放行会把"填得随便"也判成对。
    expect(isCorrect('约6', { value: 6 })).toBe(false)
    expect(isCorrect('一共6', { value: 6 })).toBe(false)
  })

  it('零宽字符不算差异：复制粘贴带来的隐形字符被清洗掉（数值路径）', () => {
    // `6\u200b颗\u2060` 在屏幕上与 `6颗` 完全一致，但不清洗就会判错，
    // 而孩子根本看不出差在哪——这类"看起来相同却判错"最伤人。
    expect(isCorrect('6\u200b颗\u2060', { value: 6, unit: '颗' })).toBe(true)
    expect(isCorrect('6\ufeff', { value: 6 })).toBe(true)
    expect(isCorrect('\u200b6', { value: 6 })).toBe(true)
  })

  it('前导小数 .5 与算式路径能力对称', () => {
    // 两条路径都接受 `.5`：孩子不会因为换了个输入框就忽然填不进去。
    expect(isCorrect('.5', { value: 0.5 })).toBe(true)
    expect(matchesExpression('.5+1', '.5+1')).toBe(true)
  })
})

describe('domain/quiz: answerJudgement — 单位归一化', () => {
  it('同义单位判对：个/只/枚/颗 互为别名', () => {
    const answer: Answer = { value: 6, unit: '颗' }

    for (const submitted of ['6个', '6只', '6枚', '6粒', '6条']) {
      expect(isCorrect(submitted, answer)).toBe(true)
    }
  })

  it('英制与全角写法归一到同一单位', () => {
    expect(isCorrect('2m', { value: 2, unit: '米' })).toBe(true)
    expect(isCorrect('2厘米', { value: 2, unit: 'cm' })).toBe(true)
    expect(isCorrect('3kg', { value: 3, unit: '千克' })).toBe(true)
    expect(isCorrect('3分钟', { value: 3, unit: '分' })).toBe(true)
    expect(isCorrect('2小时', { value: 2, unit: '时' })).toBe(true)
  })

  it('量级不同的单位判错（6厘米 对 6米）', () => {
    expect(isCorrect('6厘米', { value: 6, unit: '米' })).toBe(false)
    expect(isCorrect('6克', { value: 6, unit: '千克' })).toBe(false)
    expect(isCorrect('6秒', { value: 6, unit: '分钟' })).toBe(false)
  })

  it('配对/成双/集体单位是独立单位，不与通用计数混同', () => {
    // 3双 是 6 只、3对 是 6 个、3群 是一群。并进 `个` 会让「换了单位但
    // 数值相同」判对，孩子学到的是单位可以随便换——比判错更糟。
    expect(isCorrect('3双', { value: 3, unit: '双' })).toBe(true)
    expect(isCorrect('3对', { value: 3, unit: '对' })).toBe(true)
    expect(isCorrect('3群', { value: 3, unit: '群' })).toBe(true)

    expect(isCorrect('3双', { value: 3, unit: '个' })).toBe(false)
    expect(isCorrect('3对', { value: 3, unit: '根' })).toBe(false)
    expect(isCorrect('3群', { value: 3, unit: '只' })).toBe(false)
  })

  it('时间单位缩写全覆盖（s/sec、min、hr、d/day）', () => {
    expect(isCorrect('5s', { value: 5, unit: '秒' })).toBe(true)
    expect(isCorrect('5sec', { value: 5, unit: '秒' })).toBe(true)
    expect(isCorrect('3d', { value: 3, unit: '天' })).toBe(true)
    expect(isCorrect('3day', { value: 3, unit: '天' })).toBe(true)

    // 缩写同样不能跨单位：5分钟 与 5秒 不是一回事。
    expect(isCorrect('5min', { value: 5, unit: '秒' })).toBe(false)
    expect(isCorrect('5hr', { value: 5, unit: '天' })).toBe(false)
  })

  it('normalizeUnit 把别名收敛到规范单位，未知单位原样返回', () => {
    expect(normalizeUnit('颗')).toBe('个')
    expect(normalizeUnit('只')).toBe('个')
    expect(normalizeUnit('公斤')).toBe('千克')
    expect(normalizeUnit('公里')).toBe('千米')
    expect(normalizeUnit('窝')).toBe('窝')
  })

  it('unitAliases 每个规范单位的别名列表自身以规范单位开头且无重复', () => {
    for (const [canonical, aliases] of Object.entries(unitAliases)) {
      expect(aliases[0]).toBe(canonical)
      expect(new Set(aliases).size).toBe(aliases.length)
    }
  })

  it('unitAliases 覆盖长度/距离、质量、金额、时间、配对单位五类常用单位', () => {
    const canonicalUnits = Object.keys(unitAliases)

    for (const required of ['米', '千米', '克', '千克', '元', '分钟', '小时', '秒', '天', '双', '对', '群']) {
      expect(canonicalUnits).toContain(required)
    }
  })

  it('unitAliases 的时间条目缩写成对出现（秒与天不再只有裸中文）', () => {
    expect(unitAliases.秒).toEqual(['秒', 's', 'sec'])
    expect(unitAliases.天).toEqual(['天', '日', 'd', 'day'])
  })

  it('通用计数桶不含配对/集体单位', () => {
    for (const forbidden of ['双', '对', '群']) {
      expect(unitAliases.个).not.toContain(forbidden)
    }
  })
})

describe('domain/quiz: answerJudgement — 算式 token 比对', () => {
  it('提交 24÷4 对 {expression:"24÷4"} 判对', () => {
    expect(isCorrect('24÷4', { value: 6, expression: '24÷4' })).toBe(true)
  })

  it('提交 6/24 判错（token 序列与预期不符）', () => {
    expect(isCorrect('6/24', { value: 6, expression: '24÷4' })).toBe(false)
  })

  it('答案只有 expression 时也走算式路径（不因缺 value 崩溃）', () => {
    // 用转型构造一个只声明 expression 的答案：JSON 解析出来的题目对象
    // 不保证字段齐全，判等 MUST NOT 在 value 缺失时把 NaN 一路比下去。
    const expressionOnly = { expression: '24÷4' } as unknown as Answer

    expect(isCorrect('24÷4', expressionOnly)).toBe(true)
    expect(isCorrect('6', expressionOnly)).toBe(false)
  })

  it('算式的等价数值结果不作为判对依据（6 对 24÷4 判错）', () => {
    // design §2：算式型按 token 序列比对，不是求值后比数值。
    expect(isCorrect('6', { value: 6, expression: '24÷4' })).toBe(false)
  })

  it('空格与全角半角不影响判等', () => {
    expect(isCorrect(' 2 4 ÷ 4 ', { value: 6, expression: '24÷4' })).toBe(true)
    expect(isCorrect('２４÷４', { value: 6, expression: '24÷4' })).toBe(true)
  })

  it('乘号三写法（×、*、x）互相等价', () => {
    const expected = { value: 12, expression: '3×4' }

    expect(isCorrect('3*4', expected)).toBe(true)
    expect(isCorrect('3 x 4', expected)).toBe(true)
    expect(isCorrect('3X4', expected)).toBe(true)
    expect(isCorrect('3×4', expected)).toBe(true)
  })

  it('除号两写法（÷、/）互相等价', () => {
    expect(isCorrect('24/4', { value: 6, expression: '24÷4' })).toBe(true)
    expect(isCorrect('24÷4', { value: 6, expression: '24/4' })).toBe(true)
  })

  it('数字前导零与小数点写法不影响判等', () => {
    expect(isCorrect('04+2', { value: 6, expression: '4+2' })).toBe(true)
    expect(isCorrect('2.5+3.5', { value: 6, expression: '2.50+3.50' })).toBe(true)
  })

  it('运算符、运算数顺序不同即判错', () => {
    expect(isCorrect('4÷24', { value: 6, expression: '24÷4' })).toBe(false)
    expect(isCorrect('24+4', { value: 6, expression: '24÷4' })).toBe(false)
    expect(isCorrect('24÷4÷1', { value: 6, expression: '24÷4' })).toBe(false)
    expect(isCorrect('24÷4', { value: 6, expression: '24÷4÷1' })).toBe(false)
  })

  it('前面带等号的提交仍可判对（孩子从"列式"习惯带入）', () => {
    expect(isCorrect('=24÷4', { value: 6, expression: '24÷4' })).toBe(true)
  })

  it('tokenizeExpression 产出数字与运算符交替的序列', () => {
    expect(tokenizeExpression('24÷4')).toEqual(['24', '÷', '4'])
    expect(tokenizeExpression(' 10 - 3 + 2 ')).toEqual(['10', '-', '3', '+', '2'])
    expect(tokenizeExpression('3*4')).toEqual(['3', '×', '4'])
  })

  it('残缺数字写法（3..4）使 token 序列作废', () => {
    expect(tokenizeExpression('3..4')).toEqual([])
    expect(isCorrect('3..4', { value: 6, expression: '24÷4' })).toBe(false)
  })

  it('尾随小数点（5.）使 token 序列作废（与 3..4 一致，不静默归一为 5）', () => {
    expect(tokenizeExpression('5.')).toEqual([])
    expect(tokenizeExpression('5.+3')).toEqual([])
    expect(isCorrect('5.', { value: 5, expression: '5+3' })).toBe(false)
    // 中间的 `5.` 同样作废，只有完整写法能过。
    expect(isCorrect('5+3', { value: 8, expression: '5+3' })).toBe(true)
  })

  it('零宽字符不算差异：复制粘贴带来的隐形字符被清洗掉（算式路径）', () => {
    expect(isCorrect('24\u200b÷\u200b4', { value: 6, expression: '24÷4' })).toBe(true)
    expect(tokenizeExpression('24\u2060÷\ufeff4')).toEqual(['24', '÷', '4'])
  })

  it('空算式答案下任何提交都判错且不抛异常', () => {
    // `expression: ''` 是内容缺失，不是"接受任意提交"。若走"两侧皆空则
    // 相等"的常规序列比较，这道题会被任何输入判对且无声无息。
    const empty = { value: 6, expression: '' }

    expect(isCorrect('6', empty)).toBe(false)
    expect(isCorrect('24÷4', empty)).toBe(false)
    expect(isCorrect('', empty)).toBe(false)
    expect(isCorrect('abc', empty)).toBe(false)
    expect(() => isCorrect('6', empty)).not.toThrow()
  })

  it('超长数字串不会溢出成 Infinity 后误判相等', () => {
    const huge = '9'.repeat(400)
    expect(isCorrect(huge, { value: 6 })).toBe(false)
    expect(matchesExpression(`${huge}+1`, '24÷4')).toBe(false)
  })

  it('matchesExpression 单独暴露算式路径', () => {
    expect(matchesExpression('24/4', '24÷4')).toBe(true)
    expect(matchesExpression('6/24', '24÷4')).toBe(false)
  })

  it('选择题按 optionId 判定，大小写不敏感', () => {
    expect(isCorrect('B', { value: 0, optionId: 'B' })).toBe(true)
    expect(isCorrect('b', { value: 0, optionId: 'B' })).toBe(true)
    expect(isCorrect('A', { value: 0, optionId: 'B' })).toBe(false)
    expect(isCorrect('', { value: 0, optionId: 'B' })).toBe(false)
  })

  it('算式路径不评估求值，纯文本算式也判错', () => {
    expect(isCorrect('二十四除以四', { value: 6, expression: '24÷4' })).toBe(false)
    expect(isCorrect('abc', { value: 6, expression: '24÷4' })).toBe(false)
  })
})
