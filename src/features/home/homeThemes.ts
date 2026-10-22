import { BASE_ZONE, ZONES } from './zones'
import type { ThemeId } from '@/domain/model/types'

/** 首页地图的一段：深海叫区域，恐龙/太空叫阶段。 */
export interface HomeZoneView {
  id: string
  name: string
  depthLabel: string
}

/** 一个主题在首页的展示配置（只放文字与视觉类型，不放业务规则）。 */
export interface HomeTheme {
  id: ThemeId
  name: string
  baseName: string
  baseIcon: string
  zones: readonly HomeZoneView[]
  backdrop: 'sea' | 'dinosaur' | 'space'
  zoneLabel: string
  rewardLabel: string
  doneLabel: string
}

const SEA_THEME: HomeTheme = {
  id: 'deep-sea',
  name: '深海',
  baseName: BASE_ZONE.name,
  baseIcon: '⚓',
  zones: ZONES.map((zone) => ({ id: zone.id, name: zone.name, depthLabel: zone.depthLabel })),
  backdrop: 'sea',
  zoneLabel: '区域',
  rewardLabel: '下一区图鉴卡 + 徽章',
  doneLabel: '今天的题组已完成，明天再来探索更深的海域',
}

const DINOSAUR_THEME: HomeTheme = {
  id: 'dinosaur',
  name: '恐龙',
  baseName: '化石营地',
  baseIcon: '🦴',
  zones: [
    { id: 'fern-forest', name: '蕨类森林', depthLabel: '第 1 阶段' },
    { id: 'volcano-valley', name: '火山谷', depthLabel: '第 2 阶段' },
    { id: 'dino-park', name: '恐龙乐园', depthLabel: '第 3 阶段' },
    { id: 'ancient-sea', name: '远古海洋', depthLabel: '第 4 阶段' },
  ],
  backdrop: 'dinosaur',
  zoneLabel: '阶段',
  rewardLabel: '下一站恐龙图鉴 + 徽章',
  doneLabel: '今天的题组已完成，明天再去发现新的恐龙',
}

const SPACE_THEME: HomeTheme = {
  id: 'space',
  name: '太空',
  baseName: '近地轨道',
  baseIcon: '🛰️',
  zones: [
    { id: 'moon-base', name: '月球基地', depthLabel: '第 1 阶段' },
    { id: 'mars-outpost', name: '火星前哨', depthLabel: '第 2 阶段' },
    { id: 'deep-space', name: '深空航线', depthLabel: '第 3 阶段' },
    { id: 'galaxy-edge', name: '星系边缘', depthLabel: '第 4 阶段' },
  ],
  backdrop: 'space',
  zoneLabel: '阶段',
  rewardLabel: '下一站太空图鉴 + 徽章',
  doneLabel: '今天的题组已完成，明天继续飞向更远的星球',
}

/** 三个主题的首页配置；未知主题回退深海。 */
export const HOME_THEMES: readonly HomeTheme[] = [SEA_THEME, DINOSAUR_THEME, SPACE_THEME]

/** 按主题取首页配置。 */
export function homeThemeById(id: ThemeId): HomeTheme {
  return HOME_THEMES.find((theme) => theme.id === id) ?? SEA_THEME
}
