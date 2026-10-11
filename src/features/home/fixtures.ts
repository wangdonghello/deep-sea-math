/**
 * `features/home/fixtures.ts` —— 首页 composable 的**演示题池**（缺省池）。
 *
 * 定位：`useHomeQuest` 在调用方没有注入 `pool` 时用它（见 `home/types.ts` 的
 * `HomeQuestOptions.pool`）。题库（`data/content/questionBank.json`）已落地，
 * 正式路由路径由 `app/productionStores.ts` 装配真实题库，本文件保留两个作用：
 *   1. 没有题库上下文时首页仍可跑通「领取 → 组题 → 下潜」全链路（组件测试与
 *      `.vue` 预览都靠它）；
 *   2. **刻意维持小池**（4 道，覆盖 5/3/1 三个槽位但不足量）：这样演示数据会
 *      自然走「池不足 → 循环取用 → repeatCount」这条真实分支，而不是悄悄退化
 *      成一条永不执行的兜底路径。
 *
 * 题目文案仍按深海宠物任务包装（design §2）。
 */

import { createQuestion } from '@/domain/model/types'
import type { Question } from '@/domain/model/types'

/**
 * 演示题池：3 道基础 + 1 道应用 + 1 道探测中的可用子集。
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
    sources: ['演示题池数据：正式路径见 data/content/questionBank.json'],
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
    sources: ['演示题池数据：正式路径见 data/content/questionBank.json'],
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
    sources: ['演示题池数据：正式路径见 data/content/questionBank.json'],
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
    sources: ['演示题池数据：正式路径见 data/content/questionBank.json'],
  }),
]
