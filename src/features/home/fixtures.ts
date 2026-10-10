/**
 * `features/home/fixtures.ts` —— Task 8 落地前的**过渡题池**。
 *
 * ⚠️ 这是临时产物：等 `data/content/questionBank.json`（Task 8）就位后，本文件
 * 整体删除，首页改从题库取题。之所以现在就放 4 道而不是等 T8：首页要在没有
 * 题库的条件下也能跑通「领取 → 组题 → 下潜」全链路（TDD 无法测一条不存在的
 * 路径），而组题的确定性、难度回落、重复取题都只依赖 `pool` 的形态，与题目
 * 具体是什么数学题无关。
 *
 * 刻意做成**小池**（4 道，覆盖 5/3/1 三个槽位但不足量）：这样首页的演示数据
 * 会自然走「池不足 → 循环取用 → repeatCount」这条真实分支，而不是悄悄退化
 * 成一条永不执行的兜底路径。题目文案仍按深海宠物任务包装（design §2）。
 */

import { createQuestion } from '@/domain/model/types'
import type { Question } from '@/domain/model/types'

/**
 * 过渡题池：3 道基础 + 1 道应用 + 1 道探测中的可用子集。
 *
 * 类别分布刻意不齐（探测题只有一道且难度 1）：`buildDailyQuest` 在探测槽位
 * 会因题量不足重复取用它，正好把 `repeatCount` 的真实行为暴露在首页演示里。
 */
export const DEMO_QUESTION_POOL: readonly Question[] = [
  createQuestion({
    id: 'demo-basic-1',
    type: 'add-sub',
    difficulty: 1,
    category: 'basic',
    story: { title: '点亮深海灯笼', body: '小灯笼鱼已经点亮 3 盏，还要点亮 4 盏，一共几盏？' },
    hints: ['先数已经点亮的', '再数还要点亮的', '把两部分合起来', '3 + 4 = ?', '一共 7 盏'],
    answer: { value: 7, unit: '盏' },
    similarQuestionIds: [],
    tags: ['demo', 'add-sub'],
    creatureRef: 'lanternfish',
    sources: ['过渡数据：Task 8 落地后替换为 questionBank.json'],
  }),
  createQuestion({
    id: 'demo-basic-2',
    type: 'mul-div',
    difficulty: 1,
    category: 'basic',
    story: { title: '平分珍珠', body: '8 颗珍珠平均分给 2 只海马，每只几颗？' },
    hints: ['一共有几颗', '分给几只', '平均分就是除法', '8 ÷ 2 = ?', '每只 4 颗'],
    answer: { value: 4, unit: '颗' },
    similarQuestionIds: [],
    tags: ['demo', 'mul-div'],
    creatureRef: 'seahorse',
    sources: ['过渡数据：Task 8 落地后替换为 questionBank.json'],
  }),
  createQuestion({
    id: 'demo-applied-1',
    type: 'unit-time-route',
    difficulty: 2,
    category: 'applied',
    story: { title: '下潜航程', body: '潜水艇每分钟下潜 12 米，5 分钟后下潜到多少米？' },
    requiresFiveStep: true,
    hints: ['已知每分钟下潜多少', '已知过了几分钟', '求一共下潜多少米', '12 × 5 = ?', '一共 60 米'],
    answer: { value: 60, unit: '米' },
    similarQuestionIds: [],
    tags: ['demo', 'unit-time-route'],
    creatureRef: 'submarine',
    sources: ['过渡数据：Task 8 落地后替换为 questionBank.json'],
  }),
  createQuestion({
    id: 'demo-probe-1',
    type: 'unknown-relation',
    difficulty: 1,
    category: 'probe',
    story: { title: '鮟鱇鱼的诱饵', body: '鮟鱇鱼灯下藏着一些磷虾，吃掉 3 只后还剩 5 只，原来有几只？' },
    requiresFiveStep: true,
    hints: ['已知吃掉几只', '已知还剩几只', '求原来有几只', '? - 3 = 5', '原来 8 只'],
    answer: { value: 8, unit: '只' },
    similarQuestionIds: [],
    tags: ['demo', 'unknown-relation'],
    creatureRef: 'anglerfish',
    sources: ['过渡数据：Task 8 落地后替换为 questionBank.json'],
  }),
]
