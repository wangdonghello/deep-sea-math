import { FIVE_STEP_TYPES, type FiveStepType } from '../model/types'

/**
 * `src/domain/quiz/fiveStepMachine` —— 五步思考引导状态机。
 *
 * design §3：`KNOWN → UNKNOWN → RELATION → EXPRESSION → ANSWER`，每步绑定
 * 一个最小动作，完成后自动前进；**步内答错不判负**，只给该步提示、不扣
 * 进度——所以本状态机只表达「走到哪一步、哪些步已完成」，没有任何
 * 「答错」相关的状态与转移。
 *
 * 四条硬约束，各自对应一条实现选择：
 * 1. **只用于 `requiresFiveStep` 题**：创建入口要求调用方传入题目声明的
 *    `steps`，基础题（无 steps）根本不会创建状态机，直答即可。
 * 2. **已完成步可回看不可重做**：完成记录只增不减；回看只改当前焦点，
 *    且回看是只读的，孩子不可能靠「回看 + 完成」把进度推重。
 * 3. **纯函数**：所有转移返回**新**状态对象，且新状态与原状态**不共享任何
 *    可变数组**（`steps` / `completed` 都拷贝）。`readonly` 只是编译期约束，
 *    运行时 cast 后可写，共享引用会让一次转移悄悄污染上一份快照；Vue 3 的
 *    `watch` 也依赖引用变化才能触发，共享数组会漏更新。
 * 4. **`current` 同时承担两个职责**：既是「进度前沿」，也是「注视点」。
 *    {@link completeCurrentStep} 只允许推进前沿，因此回看之后焦点会停在一个
 *    已完成步上——此时必须先调 {@link resumeProgress} 把焦点移回首个未完成
 *    步，才能继续 {@link completeCurrentStep}。
 */

/**
 * 五步标准链，与 design §3 逐字对应。
 *
 * 它引用 {@link FIVE_STEP_TYPES}（`model/types` 的运行时真源）而不是在这里
 * 重写字面量：步骤链只有一处定义，`types.ts` 增删一步时编译期与运行时的
 * 校验基准同步变化。本地保留 `FIVE_STEP_ORDER` 这个名字，是为了让调用方读
 * 到的仍是"顺序"语义（`createFiveStepMachine` 校验的就是顺序）。
 */
export const FIVE_STEP_ORDER: readonly FiveStepType[] = FIVE_STEP_TYPES

/** 步骤模板的最小形态：只依赖 `type` 判链，不读 `prompt`。 */
export interface StepTemplate {
  readonly type: FiveStepType
  readonly prompt: string
}

/**
 * 五步状态机的不可变状态。
 *
 * 用步骤**类型**而不是索引表达 `current` / `completed`：进度条要按类型渲染
 * 每一步的引导语，索引会让 UI 层再持有一份题目数据才能对上号。构造时已排除
 * 重复类型，因此 `indexOf` 查找无歧义。
 *
 * `current` 是**注视点**而非单纯的"进度前沿"：回看会把它挪到已完成步上，
 * 此时想看前沿要调 {@link resumeProgress}。UI 通常更需要前沿而非注视点。
 */
export interface FiveStepState {
  /** 题目声明的步骤类型链（快照，长度 ≥ 1）。 */
  readonly steps: readonly FiveStepType[]
  /** 当前注视点所在步（可能是已完成步，见上）。 */
  readonly current: FiveStepType
  /** 已完成的步，按完成顺序记录，只增不减。 */
  readonly completed: readonly FiveStepType[]
}

/**
 * 由题目声明创建五步状态机，初始停在第一步。
 *
 * @param steps 题目的五步模板，MUST NOT 为空，且 `type` 序列 MUST 与
 *   {@link FIVE_STEP_ORDER} 同向无重复（`['known','answer']` 这种跳过中间
 *   步的链是合法的，`['answer','known']` 不是）。
 * @returns 初始状态：`current` 为首步、`completed` 为空。
 * @throws {Error} steps 为空、type 不在标准链上，或顺序倒退/重复 —— 这三种
 *   输入会让"前进"失去意义（倒退链第一步之后无处可去），宁可在创建期炸掉。
 */
export function createFiveStepMachine(steps: readonly StepTemplate[]): FiveStepState {
  if (steps.length === 0) {
    throw new Error('createFiveStepMachine: 步骤链不能为空')
  }

  let previousIndex = -1
  for (const step of steps) {
    const index = FIVE_STEP_ORDER.indexOf(step.type)
    if (index === -1) {
      throw new Error(`createFiveStepMachine: 未知步骤类型 "${step.type}"`)
    }
    if (index <= previousIndex) {
      throw new Error(`createFiveStepMachine: 步骤链必须严格前进，${step.type} 倒退或重复`)
    }
    previousIndex = index
  }

  return {
    steps: steps.map((step) => step.type),
    current: steps[0].type,
    completed: [],
  }
}

/**
 * 完成当前步并前进到下一步；已是最后一步时标记完成、焦点留在这步。
 *
 * 「已完成步不可重做」就在这里落地：当前步已在 `completed` 里就抛错，
 * 覆盖两种对孩子完全一样的动作——回看到已完成步后再点完成，以及整链走完
 * 后继续点完成。
 *
 * @returns 新状态对象（入参不被修改）；`steps` 与 `completed` 均为拷贝，
 *   不与入参共享数组。
 * @throws {Error} 当前步已完成时 —— 见上。
 */
export function completeCurrentStep(machine: FiveStepState): FiveStepState {
  if (machine.completed.includes(machine.current)) {
    throw new Error(`completeCurrentStep: 步骤 ${machine.current} 已完成，不可重做`)
  }

  const steps = machine.steps
  const nextIndex = steps.indexOf(machine.current) + 1
  // 走到最后一步时 `nextIndex === steps.length`，此时焦点保持不动（留着回看）。
  const next = nextIndex < steps.length ? steps[nextIndex] : machine.current

  return {
    steps: [...steps],
    current: next,
    completed: [...machine.completed, machine.current],
  }
}

/**
 * 把焦点移回**首个未完成步**，即回到进度前沿。
 *
 * 为什么需要它：{@link completeCurrentStep} 只推进前沿，而 {@link revisitStep}
 * 会把 `current` 改成一个已完成步。回看之后若还想继续往前走，唯一合法路径
 * 就是先调本函数把焦点挪回来——否则 {@link completeCurrentStep} 必然抛错，
 * 孩子除了往更早回看以外无路可走（这是回看把状态机卡死的直接原因）。
 *
 * 全部完成时焦点停在最后一步（不再有"未完成步"可回，且最后一步通常正是
 * 要留给孩子回看的结果）。
 *
 * @returns 新状态对象；`steps` 与 `completed` 均为拷贝，不与入参共享数组。
 */
export function resumeProgress(machine: FiveStepState): FiveStepState {
  const next = machine.steps.find((step) => !machine.completed.includes(step))
  const current = next ?? machine.steps[machine.steps.length - 1]

  return {
    steps: [...machine.steps],
    current,
    completed: [...machine.completed],
  }
}

/**
 * 回看一个已完成的步：只改焦点，不动完成记录。
 *
 * 已完成的步「置灰可回看」见规格「五步自动前进」场景。回看是**只读**的，
 * 完成记录内容原样带入新状态（拷贝而非共享引用），孩子不可能靠「回看 +
 * 完成」把进度推重。
 *
 * 注意回看会让焦点离开进度前沿，想继续推进要先调 {@link resumeProgress}。
 *
 * @param step 要回看的步骤类型，MUST 已在 `completed` 中。
 * @returns 新状态对象；`steps` 与 `completed` 均为**拷贝**，不与入参共享
 *   数组——共享引用既让运行时写入可污染上一份快照，也让 Vue 3 `watch`
 *   因引用未变而漏触发。
 * @throws {Error} 该步未完成（尚未开始或还没走到）时 —— 未开始的步没有
 *   "可回看的内容"，放行会让孩子看到一步从未发生过的引导。
 */
export function revisitStep(machine: FiveStepState, step: FiveStepType): FiveStepState {
  if (!machine.steps.includes(step) || !machine.completed.includes(step)) {
    throw new Error(`revisitStep: 步骤 ${step} 尚未完成，不可回看`)
  }

  return {
    steps: [...machine.steps],
    current: step,
    completed: [...machine.completed],
  }
}

/**
 * 五步是否已全部完成。
 *
 * 最后一步完成后 `current` 仍指 ANSWER（焦点留着供回看），因此"走完了"
 * 只能由完成记录判断，不能看 `current` 是否越界。
 */
export function isFinished(machine: FiveStepState): boolean {
  return machine.completed.length === machine.steps.length
}
