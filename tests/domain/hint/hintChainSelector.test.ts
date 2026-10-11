import { describe, expect, it } from 'vitest'

import { createQuestion, type Question, type QuizType } from '../../../src/domain/model/types'
import {
  HINT_LAYER_LABELS,
  MAX_HINT_LAYERS,
  revealHint,
  revealStepHint,
  stepHintLayer,
} from '../../../src/domain/hint/hintChainSelector'

/**
 * `domain/hint/hintChainSelector` 的行为契约。
 *
 * 锁三件事（对应 spec `hint-and-correction` §分层提示链 与 design §3 五步）：
 * 1. 同一题第 n 次取提示返回第 n 层（逐层展开，不一次全给）
 * 2. 超过 5 层不再前进（clamp 在第 5 层）
 * 3. 五步「步内提示」返回该步专属文案（某一步的第 m 层）
 *
 * 固定 5 层顺序即规格：审题提醒 → 已知/未知识别 → 数量关系 → 算式提示 →
 * 讲解示例。文案 MUST NOT 含责备（这里用中性教学文案的假数据锁形状）。
 */

/**
 * 造一道带五步的应用题：5 层提示 + 5 个步骤（每步专属 prompt）。
 *
 * 提示文案带 `L{n}` 前缀，让「第 n 层」的断言可逐层区分，也能验证
 * 一次只返回一层、不串层。步骤 prompt 带 `S-<type>` 前缀，让每步的
 * 专属文案可互相区分。
 */
function makeFiveStepQuestion(): Question {
  return createQuestion({
    id: 'q-two-step',
    type: 'two-step-app' as QuizType,
    difficulty: 1,
    category: 'applied',
    story: { title: '深海补给', body: '潜水艇要给 4 只NPC各发 6 颗能量糖。' },
    requiresFiveStep: true,
    steps: [
      { type: 'known', prompt: 'S-known 先点出题目告诉你的已知条件。' },
      { type: 'unknown', prompt: 'S-unknown 再点出这道题要求的是什么。' },
      { type: 'relation', prompt: 'S-relation 说一说已知和未知之间的数量关系。' },
      { type: 'expression', prompt: 'S-expression 试着把关系写成一个算式。' },
      { type: 'answer', prompt: 'S-answer 算一算，写下最后的结果。' },
    ],
    hints: [
      'L1 把题目慢慢读一遍，看看它讲了什么。',
      'L2 找一找里面已经知道的数和还不知道的数。',
      'L3 想一想它们之间是加、减、乘还是除的关系。',
      'L4 试着用这些数列出求结果的算式。',
      'L5 我们一起看一个差不多的例子是怎么算的。',
    ],
    answer: { value: 24 },
    tags: [],
    sources: ['https://example.invalid/numbers'],
  })
}

describe('domain/hint: 第 n 层取法（同一题逐层展开）', () => {
  const Q = makeFiveStepQuestion()

  it('固定 5 层，MAX_HINT_LAYERS === 5', () => {
    expect(MAX_HINT_LAYERS).toBe(5)
    expect(HINT_LAYER_LABELS).toHaveLength(5)
  })

  it('第 1 次取提示返回第 1 层，文本为该层文案', () => {
    const hint = revealHint(Q, 0)
    expect(hint.layer).toBe(1)
    expect(hint.text).toBe(Q.hints[0])
  })

  it('第 2 次返回第 2 层、第 3 次返回第 3 层（逐层推进）', () => {
    expect(revealHint(Q, 1).layer).toBe(2)
    expect(revealHint(Q, 1).text).toBe(Q.hints[1])
    expect(revealHint(Q, 2).layer).toBe(3)
    expect(revealHint(Q, 2).text).toBe(Q.hints[2])
  })

  it('同一题连续取到第 5 层，与前 4 层互不重复', () => {
    const layerNumbers = [0, 1, 2, 3, 4].map((used) => revealHint(Q, used).layer)
    expect(layerNumbers).toEqual([1, 2, 3, 4, 5])
  })

  it('超过 5 层不再前进：第 6、7… 次仍停在第 5 层', () => {
    // 已展开满 5 层后再取，layer 5 不再前进，文案仍是最后一层。
    expect(revealHint(Q, 5).layer).toBe(5)
    expect(revealHint(Q, 6).layer).toBe(5)
    expect(revealHint(Q, 99).layer).toBe(5)
    expect(revealHint(Q, 99).text).toBe(Q.hints[4])
  })

  it('MUST NOT 一次全部显示：单次只返回一层，不返回整链', () => {
    const hint = revealHint(Q, 0)
    expect(hint.text).not.toContain(Q.hints[1])
    expect(hint.layer).toBe(1)
  })
})

describe('domain/hint: 步内提示取法（某一步的专属文案）', () => {
  const Q = makeFiveStepQuestion()

  it('每一层提示有固定的规格标签（审题→…→讲解示例）', () => {
    expect(HINT_LAYER_LABELS).toEqual(['审题提醒', '已知/未知识别', '数量关系', '算式提示', '讲解示例'])
  })

  it('stepHintLayer 把五步按顺序映射到 1..5 层', () => {
    expect(stepHintLayer('known')).toBe(1)
    expect(stepHintLayer('unknown')).toBe(2)
    expect(stepHintLayer('relation')).toBe(3)
    expect(stepHintLayer('expression')).toBe(4)
    expect(stepHintLayer('answer')).toBe(5)
  })

  it('步内提示返回该步专属 prompt，与其他步的文案互不串', () => {
    const relation = revealStepHint(Q, 'relation')
    // relation 对应第 3 层，文案取自该步自己的 prompt。
    expect(relation.layer).toBe(3)
    expect(relation.text).toContain('S-relation')
    expect(relation.text).toBe(Q.steps?.[2].prompt)
    // 与别的步、与题级第 1 层都不同：步内专属，不串层。
    expect(relation.text).not.toBe(revealStepHint(Q, 'expression').text)
    expect(relation.text).not.toBe(revealHint(Q, 0).text)
  })

  it('五个步骤各自返回互不相同的专属文案', () => {
    const copies = (['known', 'unknown', 'relation', 'expression', 'answer'] as const).map((step) =>
      revealStepHint(Q, step).text,
    )
    expect(new Set(copies).size).toBe(5)
  })

  it('步内提示的 layer 等于该步在提示链上的专属层，不越到其他步', () => {
    expect(revealStepHint(Q, 'known').layer).toBe(1)
    expect(revealStepHint(Q, 'answer').layer).toBe(5)
  })
})

describe('domain/hint: 边界与防御（正反用例的另一半）', () => {
  const Q = makeFiveStepQuestion()

  it('步内提示的 layer 与专属层一致（relation=3）', () => {
    expect(revealStepHint(Q, 'relation').layer).toBe(stepHintLayer('relation'))
    expect(revealStepHint(Q, 'relation').layer).toBe(3)
  })

  it('步内提示对基础题（无 steps）抛错', () => {
    // 基础题直答、不走五步，没有步内专属提示可给。
    const basic = createQuestion({
      id: 'q-basic',
      type: 'add-sub' as QuizType,
      difficulty: 1,
      category: 'basic',
      story: { title: '采珍珠', body: '采到 3 颗珍珠，又采到 3 颗。' },
      requiresFiveStep: false,
      hints: ['L1 读题', 'L2 已知未知', 'L3 关系', 'L4 算式', 'L5 示例'],
      answer: { value: 6 },
      tags: [],
      sources: ['https://example.invalid/add'],
    })
    expect(() => revealStepHint(basic, 'relation')).toThrow()
  })

  it('题目层数不等于 5 时 revealHint 抛错（防止规格漂移）', () => {
    const broken = { ...Q, hints: ['只有一层'] }
    expect(() => revealHint(broken, 0)).toThrow(/5/)
  })

  it('stepHintLayer 对未知步骤类型抛错', () => {
    expect(() => stepHintLayer('nope' as never)).toThrow()
  })

  it('步内提示不泄露后续步的 prompt（专属性反向用例）', () => {
    // 卡在 relation 步时，只给 relation 的 prompt，不含 answer 步的解法提示。
    const relation = revealStepHint(Q, 'relation')
    const answerPrompt = Q.steps?.[4].prompt ?? ''
    expect(relation.text).not.toContain('S-answer')
    expect(answerPrompt).toContain('S-answer')
  })
})

describe('domain/hint: 跨链对齐与入参不可变', () => {
  const Q = makeFiveStepQuestion()

  it('步内 layer 与题级 HINT_LAYER_LABELS 主题对应（至少锁 answer ↔ 讲解示例）', () => {
    // Finding 2 焊死：stepHintLayer(step) 指向的题级层标签，应和该步 prompt
    // 的环节主题一致。规格若改题级链顺序而五步链不变，两处 1..5 会静默错位；
    // 这里逐条断言语义对应，防止错位无人察觉。
    for (const step of ['known', 'unknown', 'relation', 'expression', 'answer'] as const) {
      const label = HINT_LAYER_LABELS[stepHintLayer(step) - 1]
      const prompt = revealStepHint(Q, step).text
      // 每一层标签都必须是规格固定五标签之一且与 prompt 的 S-<step> 环节对应。
      expect(HINT_LAYER_LABELS).toContain(label)
      expect(prompt).toContain(`S-${step}`)
    }
    // 最敏感的一条：answer 步 MUST NOT 被误对齐到「讲解示例」以外的层。
    expect(HINT_LAYER_LABELS[stepHintLayer('answer') - 1]).toBe('讲解示例')
  })

  it('revealHint 负向 clamp：used 为负按第 1 层', () => {
    expect(revealHint(Q, -3).layer).toBe(1)
    expect(revealHint(Q, -3).text).toBe(Q.hints[0])
  })

  it('revealHint 拒绝非整数 used（NaN / 小数），防 0 基与 1 基混用', () => {
    expect(() => revealHint(Q, Number.NaN)).toThrow()
    expect(() => revealHint(Q, 1.5)).toThrow()
  })

  it('入参被冻结后 revealHint / revealStepHint 不改动它', () => {
    // 与 mastery 的锁定强度对称：即便调用方传入冻结对象，函数也只读不写。
    // freeze 后类型变 deeply-readonly，与 Question 不完全兼容；本测试关心的是
    // 运行时只读，故 cast 回 Question 调用（生产调用方拿到的是普通可变对象）。
    const frozenWithSteps = Object.freeze({
      ...Q,
      hints: Object.freeze([...Q.hints]),
      steps: Object.freeze((Q.steps ?? []).map((step) => Object.freeze({ ...step }))),
    }) as Question
    const snapshot = JSON.stringify(frozenWithSteps)

    revealHint(frozenWithSteps, 0)
    revealStepHint(frozenWithSteps, 'answer')

    expect(JSON.stringify(frozenWithSteps)).toBe(snapshot)
  })
})
