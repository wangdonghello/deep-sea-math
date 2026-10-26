/**
 * 深海 10 关配置（v3.0）。
 *
 * 这是关卡名、深度区、每关 3 条图鉴的**唯一真源**：首页地图、深海图鉴、
 * 通关反馈都从这里取，不能在模板或投影里各写一份关卡表。
 *
 * 推进规则：完成 1 组每日题 = 推进 1 关（见 `features/bestiary/deepSeaProgress.ts`）。
 * 区域解锁阈值：第 1 / 3 / 6 / 9 关分别进入暮光 / 深海 / 深渊 / 海沟区。
 */

/** 关卡与区域标识。 */
export type DeepSeaZoneId = 'twilight' | 'midnight' | 'abyss' | 'hadal'

/** 一个深海关卡。 */
export interface DeepSeaStage {
  /** 1–10，顺序即下潜顺序，不得重排。 */
  readonly stage: number
  readonly name: string
  readonly zoneId: DeepSeaZoneId
  readonly depthLabel: string
  /** 本关的 3 条图鉴；顺序即卡片顺序。 */
  readonly creatureIds: readonly [string, string, string]
}

/** 区域配置：用于地图分段与图鉴区域筛选。 */
export interface DeepSeaZone {
  readonly id: DeepSeaZoneId
  readonly name: string
  readonly depthLabel: string
  /** 完成到第几关时解锁（含该关）。 */
  readonly unlockAtStage: number
  readonly min: number
  readonly max: number | null
}

export const DEEP_SEA_ZONES: readonly DeepSeaZone[] = [
  { id: 'twilight', name: '暮光区', depthLabel: '约 200–1,000 米', unlockAtStage: 1, min: 200, max: 1000 },
  { id: 'midnight', name: '深海区', depthLabel: '约 1,000–4,000 米', unlockAtStage: 3, min: 1000, max: 4000 },
  { id: 'abyss', name: '深渊区', depthLabel: '约 4,000–6,000 米', unlockAtStage: 6, min: 4000, max: 6000 },
  { id: 'hadal', name: '海沟区', depthLabel: '约 6,000 米以下', unlockAtStage: 9, min: 6000, max: null },
]

export const DEEP_SEA_STAGES: readonly DeepSeaStage[] = [
  {
    stage: 1, name: '珊瑚浅滩', zoneId: 'twilight', depthLabel: '约 0–100 米',
    creatureIds: ['golden-trevally', 'seahorse', 'leafy-seadragon'],
  },
  {
    stage: 2, name: '暮光之门', zoneId: 'twilight', depthLabel: '约 200–1,000 米',
    creatureIds: ['lanternfish', 'johnson-anglerfish', 'viperfish'],
  },
  {
    stage: 3, name: '鲸落绿洲', zoneId: 'midnight', depthLabel: '约 1,000–2,000 米',
    creatureIds: ['humpback-whale', 'whale-shark', 'manta-ray'],
  },
  {
    stage: 4, name: '蓝鲸航道', zoneId: 'midnight', depthLabel: '约 1,000–3,000 米',
    creatureIds: ['blue-whale', 'great-white-shark', 'hammerhead-shark'],
  },
  {
    stage: 5, name: '黑暗猎场', zoneId: 'midnight', depthLabel: '约 2,000–4,000 米',
    creatureIds: ['tiger-shark', 'shortfin-mako', 'giant-squid'],
  },
  {
    stage: 6, name: '热泉花园', zoneId: 'abyss', depthLabel: '约 2,000–4,000 米',
    creatureIds: ['giant-tube-worm', 'yeti-crab', 'giant-isopod'],
  },
  {
    stage: 7, name: '幽灵水层', zoneId: 'abyss', depthLabel: '约 3,000–5,000 米',
    creatureIds: ['vampire-squid', 'dumbo-octopus', 'oarfish'],
  },
  {
    stage: 8, name: '深渊巨影', zoneId: 'abyss', depthLabel: '约 4,000–6,000 米',
    creatureIds: ['giant-cusk-eel', 'deep-sea-lizardfish', 'jewel-squid'],
  },
  {
    stage: 9, name: '海沟边缘', zoneId: 'hadal', depthLabel: '约 6,000–8,000 米',
    creatureIds: ['mariana-snailfish', 'abyssobrotula-galatheae', 'gulper-eel'],
  },
  {
    stage: 10, name: '海沟最深处', zoneId: 'hadal', depthLabel: '约 8,000 米以下',
    creatureIds: ['hadal-amphipod', 'hadal-jellyfish', 'hadal-sea-cucumber'],
  },
]

/** 按关号取关卡；越界返回 undefined。 */
export function deepSeaStageById(stage: number): DeepSeaStage | undefined {
  return DEEP_SEA_STAGES.find((entry) => entry.stage === stage)
}

/** 按区域取关卡（顺序保持）。 */
export function deepSeaStagesByZone(zoneId: DeepSeaZoneId): readonly DeepSeaStage[] {
  return DEEP_SEA_STAGES.filter((entry) => entry.zoneId === zoneId)
}

/** 按鱼 id 找所属关卡。 */
export function deepSeaStageForCreature(creatureId: string): DeepSeaStage | undefined {
  return DEEP_SEA_STAGES.find((entry) => entry.creatureIds.includes(creatureId))
}
