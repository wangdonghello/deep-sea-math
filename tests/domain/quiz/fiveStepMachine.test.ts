import { describe, expect, it } from 'vitest'

import { FIVE_STEP_TYPES, type FiveStepType } from '../../../src/domain/model/types'
import {
  FIVE_STEP_ORDER,
  completeCurrentStep,
  createFiveStepMachine,
  isFinished,
  resumeProgress,
  revisitStep,
  type StepTemplate,
} from '../../../src/domain/quiz/fiveStepMachine'

/**
 * `domain/quiz/fiveStepMachine` 的行为契约。
 *
 * 覆盖四类断言：合法链 KNOWN→UNKNOWN→RELATION→EXPRESSION→ANSWER 逐步推进、
 * 非法迁移（重做已完成步 / 回看未完成步 / 越界）稳定抛错、回看后的
 * `resumeProgress` 回到前沿，以及「已完成步可回看不可重做」。
 */

/**
 * 五步标准链。
 *
 * 直接引用 `model/types` 的 `FIVE_STEP_TYPES` 而不是在手写字面量：步骤链
 * 只有一处真源，`types.ts` 增删一步时这里立刻跟着变——否则测试会用一个
 * 过期的私夯副本继续全绿，把真源的变化悄悄漏掉。
 */
const CANONICAL = FIVE_STEP_TYPES

/** 把标准链包成题目 steps 的最小模板（判链只用 type）。 */
function canonicalTemplates() {
  return CANONICAL.map((type) => ({ type, prompt: `${type} 引导语` }))
}

/** 造一个初始状态机（全部用标准五步链）。 */
function fresh() {
  return createFiveStepMachine(canonicalTemplates())
}

describe('domain/quiz: fiveStepMachine — 初始状态', () => {
  it('初始停在第一步 known，且没有任何已完成步', () => {
    const machine = fresh()

    expect(machine.current).toBe('known')
    expect(machine.completed).toEqual([])
    expect(isFinished(machine)).toBe(false)
  })

  it('题目声明的步骤模板原样进入状态（不新增也不裁剪）', () => {
    const steps = [
      { type: 'known', prompt: '读题，找出已知条件' },
      { type: 'unknown', prompt: '这道题要求什么？' },
      { type: 'relation', prompt: '它们是什么数量关系？' },
      { type: 'expression', prompt: '试着列出算式' },
      { type: 'answer', prompt: '算出最后的结果' },
    ] as const

    const machine = createFiveStepMachine(steps)

    expect(machine.steps).toEqual([...CANONICAL])
    expect(machine.current).toBe('known')
  })

  it('FIVE_STEP_ORDER 与 model/types 的 FIVE_STEP_TYPES 同源', () => {
    // 同一处真源：状态机不再手写字面量链。若哪天 types.ts 增删一步而这里
    // 没跟上，这条会红——而不是让两处链静默漂移。
    expect([...FIVE_STEP_ORDER]).toEqual([...CANONICAL])
    expect(FIVE_STEP_ORDER).toBe(FIVE_STEP_TYPES)
  })
})

describe('domain/quiz: fiveStepMachine — resumeProgress（回看后回到前沿）', () => {
  it('回看后 resumeProgress 把焦点移回首个未完成步，可继续完成下去', () => {
    let machine = fresh()
    machine = completeCurrentStep(machine) // known done → unknown
    machine = completeCurrentStep(machine) // unknown done → relation
    machine = completeCurrentStep(machine) // relation done → expression

    const reviewed = revisitStep(machine, 'known')
    // 回看把焦点带到已完成步：此时直接推进会抛错（见上方"不可重做"用例）
    expect(() => completeCurrentStep(reviewed)).toThrow()

    const resumed = resumeProgress(reviewed)
    expect(resumed.current).toBe('expression')

    // 回到前沿后五步能一路走完，不再卡死。
    let finished = resumed
    while (!isFinished(finished)) {
      finished = completeCurrentStep(finished)
    }
    expect(finished.completed).toEqual([...CANONICAL])
  })

  it('未回看时 resumeProgress 不改变焦点（幂等于前沿）', () => {
    let machine = fresh()
    machine = completeCurrentStep(machine)

    const resumed = resumeProgress(machine)

    expect(resumed.current).toBe(machine.current)
    expect(resumed.completed).toEqual(machine.completed)
  })

  it('全部完成后 resumeProgress 焦点停在最后一步', () => {
    let machine = fresh()
    while (!isFinished(machine)) {
      machine = completeCurrentStep(machine)
    }

    const resumed = resumeProgress(machine)

    expect(resumed.current).toBe('answer')
    expect(resumed.completed).toEqual([...CANONICAL])
    // 已完成的状态上再调一次仍是最后一步：幂等，不会越界。
    expect(resumeProgress(resumed).current).toBe('answer')
  })

  it('resumeProgress 返回新对象且不共享可变数组', () => {
    const machine = completeCurrentStep(fresh())
    const resumed = resumeProgress(machine)

    expect(resumed).not.toBe(machine)
    expect(resumed.steps).not.toBe(machine.steps)
    expect(resumed.completed).not.toBe(machine.completed)
    expect(resumed.completed).toEqual(machine.completed)
  })

  it('自定义短链（known→answer）也能正确回到前沿', () => {
    let machine = createFiveStepMachine([
      { type: 'known', prompt: 'a' },
      { type: 'answer', prompt: 'b' },
    ])
    machine = completeCurrentStep(machine)

    expect(resumeProgress(revisitStep(machine, 'known')).current).toBe('answer')
    expect(resumeProgress(completeCurrentStep(machine)).current).toBe('answer')
  })
})

describe('domain/quiz: fiveStepMachine — 新状态不共享可变数组（I1）', () => {
  it('revisitStep 拷贝 completed 与 steps，不与入参共享引用', () => {
    const machine = completeCurrentStep(fresh())
    const reviewed = revisitStep(machine, 'known')

    expect(reviewed.completed).not.toBe(machine.completed)
    expect(reviewed.steps).not.toBe(machine.steps)
  })

  it('completeCurrentStep 拷贝 completed 与 steps，不与入参共享引用', () => {
    const machine = fresh()
    const advanced = completeCurrentStep(machine)

    expect(advanced.completed).not.toBe(machine.completed)
    expect(advanced.steps).not.toBe(machine.steps)
  })

  it('cast 掉 readonly 后写入新状态不污染上一份快照', () => {
    const machine = completeCurrentStep(fresh())
    const reviewed = revisitStep(machine, 'known')

    // readonly 只是编译期约束；运行时强制写入必须只影响到新快照。
    const mutable = reviewed.completed as FiveStepType[]
    mutable.push('relation')
    expect(machine.completed).toEqual(['known'])
    expect(reviewed.completed).toEqual(['known', 'relation'])
  })
})

describe('domain/quiz: fiveStepMachine — 合法迁移', () => {
  it('KNOWN→UNKNOWN→RELATION→EXPRESSION→ANSWER 逐步推进', () => {
    let machine = fresh()

    machine = completeCurrentStep(machine)
    expect(machine.current).toBe('unknown')
    expect(machine.completed).toEqual(['known'])

    machine = completeCurrentStep(machine)
    expect(machine.current).toBe('relation')
    expect(machine.completed).toEqual(['known', 'unknown'])

    machine = completeCurrentStep(machine)
    expect(machine.current).toBe('expression')
    expect(machine.completed).toEqual(['known', 'unknown', 'relation'])

    machine = completeCurrentStep(machine)
    expect(machine.current).toBe('answer')
    expect(machine.completed).toEqual(['known', 'unknown', 'relation', 'expression'])
  })

  it('完成 ANSWER 步后标记完成，finished 为 true 且 current 仍可读', () => {
    let machine = fresh()
    for (let index = 0; index < 4; index += 1) {
      machine = completeCurrentStep(machine)
    }

    machine = completeCurrentStep(machine)

    expect(machine.completed).toEqual([...CANONICAL])
    expect(isFinished(machine)).toBe(true)
    expect(machine.current).toBe('answer')
    expect(isFinished(machine)).toBe(true)
  })

  it('自定义步骤链（少于五步）同样按链推进', () => {
    let machine = createFiveStepMachine([
      { type: 'known', prompt: '找出已知' },
      { type: 'relation', prompt: '找关系' },
    ])

    machine = completeCurrentStep(machine)
    expect(machine.current).toBe('relation')
    expect(machine.completed).toEqual(['known'])

    machine = completeCurrentStep(machine)
    expect(machine.current).toBe('relation')
    expect(isFinished(machine)).toBe(true)
  })
})

describe('domain/quiz: fiveStepMachine — 非法迁移抛错', () => {
  it('对已完成步再次判完成抛错（不可重做）', () => {
    const machine = completeCurrentStep(fresh()) // known 已完成，停在 unknown
    const reviewed = revisitStep(machine, 'known') // 回看 known

    expect(reviewed.current).toBe('known')
    expect(() => completeCurrentStep(reviewed)).toThrow(/不可|已完成/)
  })

  it('整链走完后继续完成抛错', () => {
    let machine = fresh()
    for (let index = 0; index < 5; index += 1) {
      machine = completeCurrentStep(machine)
    }

    expect(machine.completed).toEqual([...CANONICAL])
    expect(isFinished(machine)).toBe(true)
    expect(() => completeCurrentStep(machine)).toThrow(/已完成|不可/)
  })

  it('回看未开始的步抛错', () => {
    expect(() => revisitStep(fresh(), 'answer')).toThrow()
  })

  it('回看一个不在步骤链里的类型抛错', () => {
    const custom = createFiveStepMachine([
      { type: 'known', prompt: 'a' },
      { type: 'answer', prompt: 'b' },
    ])

    expect(() => revisitStep(custom, 'relation')).toThrow()
  })

  it('空步骤链构造时抛错', () => {
    expect(() => createFiveStepMachine([])).toThrow()
  })

  it('步骤链含未知类型时构造抛错', () => {
    const invalid = [{ type: 'skip', prompt: 'a' }] as unknown as readonly StepTemplate[]

    expect(() => createFiveStepMachine(invalid)).toThrow(/未知步骤类型/)
  })

  it('步骤链顺序倒退时构造抛错', () => {
    expect(() =>
      createFiveStepMachine([
        { type: 'answer', prompt: 'a' },
        { type: 'known', prompt: 'b' },
      ]),
    ).toThrow(/严格前进/)
  })

  it('步骤链含重复类型时构造抛错（链必须是严格前进的）', () => {
    expect(() =>
      createFiveStepMachine([
        { type: 'known', prompt: 'a' },
        { type: 'known', prompt: 'b' },
      ]),
    ).toThrow()
  })
})

describe('domain/quiz: fiveStepMachine — 已完成步可回看不可重做', () => {
  it('回看已完成的 known 步可以，且不改变完成记录', () => {
    let machine = fresh()
    machine = completeCurrentStep(machine) // known done → 停在 unknown
    machine = completeCurrentStep(machine) // unknown done → 停在 relation

    const reviewed = revisitStep(machine, 'known')

    expect(reviewed.current).toBe('known')
    expect(reviewed.completed).toEqual(['known', 'unknown'])
    expect(isFinished(reviewed)).toBe(false)
    // 原对象不被改写
    expect(machine.current).toBe('relation')
  })

  it('回看后不能对该步重新判完成', () => {
    let machine = fresh()
    machine = completeCurrentStep(machine)
    machine = completeCurrentStep(machine)

    const reviewed = revisitStep(machine, 'unknown')
    expect(() => completeCurrentStep(reviewed)).toThrow()
  })

  it('回看动作是纯的：反复回看同一已完成步得到等价状态', () => {
    const machine = completeCurrentStep(fresh())

    const first = revisitStep(machine, 'known')
    const second = revisitStep(machine, 'known')

    expect(second.current).toBe(first.current)
    expect(second.completed).toEqual(first.completed)
  })
})

describe('domain/quiz: fiveStepMachine — 非法迁移稳定抛错（全枚举）', () => {
  it('遍历标准链上每一个「步 × 状态下」的非法动作都抛错', () => {
    for (const start of CANONICAL) {
      let machine = fresh()

      // 推进到 start 成为当前步：把 start 之前的步全部完成。
      while (machine.current !== start) {
        machine = completeCurrentStep(machine)
      }
      // start 之后的步此时都未开始（completed 里都是 start 之前的步）。
      const notStarted = CANONICAL.filter((step) => !machine.completed.includes(step))

      // 1. 回看任何未开始的步 → 抛错。
      for (const step of notStarted) {
        expect(() => revisitStep(machine, step)).toThrow()
      }

      // 2. 完成当前步后，回看任何一个已完成步再"重做" → 抛错。
      const advanced = completeCurrentStep(machine)
      for (const step of machine.completed) {
        const reviewed = revisitStep(advanced, step)
        expect(() => completeCurrentStep(reviewed)).toThrow()
      }
      // 3. 不回看，直接在已完成步上再判一次完成，同样抛错。
      //    取 advanced 的最后一个已完成步（= 刚完成的 start），它必然在
      //    完成记录里，因此索引一定有值。
      const redone = revisitStep(advanced, advanced.completed[advanced.completed.length - 1])
      expect(() => completeCurrentStep(redone)).toThrow()
    }
  })

  it('全部走完后，任何重做/回看之外的动作都不改变状态', () => {
    let machine = fresh()
    while (!isFinished(machine)) {
      machine = completeCurrentStep(machine)
    }

    const snapshot = { current: machine.current, completed: [...machine.completed] }
    expect(() => completeCurrentStep(machine)).toThrow()

    // 抛错是稳定的：同一个入参重复调用结果一致，状态也没有被写坏。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => completeCurrentStep(machine)).toThrow(/不可重做/)
    }
    expect(machine.current).toBe(snapshot.current)
    expect(machine.completed).toEqual(snapshot.completed)
  })
})

describe('domain/quiz: fiveStepMachine — 纯函数（返回新对象，不原地修改）', () => {
  it('completeCurrentStep 返回新对象，入参状态保持不变', () => {
    const machine = fresh()
    const advanced = completeCurrentStep(machine)

    expect(advanced).not.toBe(machine)
    expect(machine.current).toBe('known')
    expect(machine.completed).toEqual([])
    expect(advanced.current).toBe('unknown')
  })

  it('revisitStep 返回新对象，入参状态保持不变', () => {
    const machine = completeCurrentStep(fresh())
    const reviewed = revisitStep(machine, 'known')

    expect(reviewed).not.toBe(machine)
    expect(machine.current).toBe('unknown')
    expect(reviewed.current).toBe('known')
  })

  it('completed 先前的快照不被后续推进污染', () => {
    const first = completeCurrentStep(fresh())
    const second = completeCurrentStep(first)

    expect(first.completed).toEqual(['known'])
    expect(second.completed).toEqual(['known', 'unknown'])
  })

  it('从同一初始状态出发的两次推进互不影响（可重放）', () => {
    const machine = fresh()
    const left = completeCurrentStep(machine)
    const right = completeCurrentStep(machine)

    expect(left.completed).toEqual(right.completed)
    // 原状态仍可再推一次：状态机没有"消耗"过自己
    const third = completeCurrentStep(machine)
    expect(third.completed).toEqual(['known'])
  })
})
