import raw from './themePacks.json'
import { THEME_IDS, type ThemeId } from '../../domain/model/types'

/** 一个主题收藏条目；2D 展示以 emoji 为最小素材，不依赖外部图片。 */
export interface ThemeEntry {
  id: string
  stage: 1 | 2 | 3 | 4
  name: string
  emoji: string
  summary: string
  knowledgeCards: readonly string[]
  sources: readonly string[]
  /** 可选 3D 模型（当前用于恐龙知识卡）；ref 对应 public/models/dino/<ref>.glb。 */
  modelRef?: string
  /** 模型来源页（CC0 素材也保留来源，便于审计）。 */
  modelSource?: string
  /** 模型许可证，例如 CC0。 */
  modelLicense?: string
  /** 可选真实馆藏/化石照片（当前用于恐龙卡片和 3D 加载占位图）。 */
  photoRef?: string
  photoSource?: string
  photoCredit?: string
  photoLicense?: string
}

/** 一个兴趣主题包：4 个阶段、每阶段 2 个条目。 */
export interface ThemePack {
  id: ThemeId
  name: string
  stageNames: readonly [string, string, string, string]
  entries: readonly ThemeEntry[]
}

interface ThemePacksFile {
  version: string
  packs: ThemePack[]
}

const file = raw as unknown as ThemePacksFile

function assertValid(): void {
  if (file.packs.length !== THEME_IDS.length) throw new Error('themePacks: expected 3 packs')
  for (const pack of file.packs) {
    if (!THEME_IDS.includes(pack.id)) throw new Error(`themePacks: unknown theme ${pack.id}`)
    if (pack.stageNames.length !== 4) throw new Error(`themePacks: ${pack.id} stage names`)
    if (pack.entries.length !== 8) throw new Error(`themePacks: ${pack.id} expected 8 entries`)
    for (const stage of [1, 2, 3, 4] as const) {
      const count = pack.entries.filter((entry) => entry.stage === stage).length
      if (count !== 2) throw new Error(`themePacks: ${pack.id} stage ${stage} needs 2 entries`)
    }
    for (const entry of pack.entries) {
      if (entry.knowledgeCards.length < 2) throw new Error(`themePacks: ${entry.id} knowledge cards`)
      if (entry.sources.length === 0) throw new Error(`themePacks: ${entry.id} sources`)
    }
  }
}

assertValid()

/** 已校验的主题包，按主题 id 取用。 */
export const THEME_PACKS: readonly ThemePack[] = file.packs

/** 按主题取包；未发布主题回退深海，避免界面空白。 */
export function themePackById(id: ThemeId): ThemePack {
  return THEME_PACKS.find((pack) => pack.id === id) ?? THEME_PACKS[0]
}
