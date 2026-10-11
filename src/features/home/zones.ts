/**
 * `features/home/zones.ts` —— 下潜视角的四区配置（数据驱动的地图区）。
 *
 * spec `creature-bestiary` §深海地图与深度进度 已冻结这份配置：潜水艇基地为
 * 起点，四个可探索深度区域（暮光 / 深海 / 深渊 / 海沟）。这里把它抽成**配置
 * 数组**而不是在模板里写四个 `<div>`：区域的数量与深度范围是内容事实（design
 * §7 冻结），Task 8 的题库与图鉴条目落地后，区域表要与 `creatures.json` 的
 * 深度区间对齐——把内容写进模板等于每次调内容都要改结构。
 *
 * 深度一律用**区间**表述（spec §深度为范围而非定点）：`depthLabel` 是给孩子
 * 看的「约 X–Y 米」，`min/max` 是给深度刻度定位用的米数。
 */

/** 单个可探索深度区域的配置。 */
export interface ZoneConfig {
  /** 区域标识（`unlock-granted` 的 `targetId` 同源）。 */
  id: string
  /** 区域名（给孩子看的中文名）。 */
  name: string
  /** 深度范围文案，MUST 是区间表述。 */
  depthLabel: string
  /** 区间下界（米），用于深度刻度定位；null 表示无下界。 */
  min: number | null
  /** 区间上界（米），用于深度刻度定位；null 表示无上界。 */
  max: number | null
}

/** 起点：潜水艇基地（新档案的当前位置，spec §起点为潜水艇基地）。 */
export const BASE_ZONE: ZoneConfig = {
  id: 'base',
  name: '潜水艇基地',
  depthLabel: '海面 · 0 米',
  min: 0,
  max: 0,
}

/**
 * 四个深度区域（design §7 / spec §深海地图与深度进度 冻结）。
 *
 * 顺序即下潜顺序：数组下标 = 第几区。`currentZoneIndex`（由已完成题组数量
 * 决定）按这个下标取区域，因此数组顺序 MUST NOT 打乱。
 */
export const ZONES: readonly ZoneConfig[] = [
  { id: 'twilight', name: '暮光区', depthLabel: '约 200–1,000 米', min: 200, max: 1000 },
  { id: 'midnight', name: '深海区', depthLabel: '约 1,000–4,000 米', min: 1000, max: 4000 },
  { id: 'abyss', name: '深渊区', depthLabel: '约 4,000–6,000 米', min: 4000, max: 6000 },
  { id: 'hadal', name: '海沟区', depthLabel: '约 6,000 米以下', min: 6000, max: null },
]

/** 深度刻度的节点（米）：起点 0 + 四个区域的边界。 */
export const DEPTH_TICKS: readonly { meters: number; label: string }[] = [
  { meters: 0, label: '0 米' },
  { meters: 200, label: '约 200 米' },
  { meters: 1000, label: '约 1,000 米' },
  { meters: 4000, label: '约 4,000 米' },
  { meters: 6000, label: '约 6,000 米' },
]
