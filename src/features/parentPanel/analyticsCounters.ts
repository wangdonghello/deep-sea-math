/**
 * 读取匿名计数器并整理成图表数据。
 *
 * 计数器只包含聚合 key，不包含档案、姓名或答案；读失败按 0 处理，
 * 不让统计面板影响家长区其他功能。
 */
import type { ThemeId } from '@/domain/model/types'
import { THEME_IDS } from '@/domain/model/types'

export interface CounterRow {
  key: string
  label: string
  count: number
}

export interface GradeThemeRow {
  grade: 1 | 2 | 3
  themeId: ThemeId
  count: number
}

export interface AnalyticsSnapshot {
  pages: CounterRow[]
  profiles: GradeThemeRow[]
  sessions: GradeThemeRow[]
  pageTotal: number
  profileTotal: number
  sessionTotal: number
  updatedAt: number
}

const PAGES: readonly { key: string; label: string }[] = [
  { key: 'page-home', label: '首页' },
  { key: 'page-profiles', label: '档案选择' },
  { key: 'page-bestiary', label: '图鉴' },
  { key: 'page-mistakes', label: '错题本' },
  { key: 'page-mistakes-print', label: '错题打印' },
  { key: 'page-quest', label: '答题页' },
  { key: 'page-parent', label: '家长区' },
]
const GRADES = [1, 2, 3] as const
const THEME_LABELS: Record<ThemeId, string> = { 'deep-sea': '深海', dinosaur: '恐龙', space: '太空' }

function readBase(): string {
  const configured = import.meta.env.VITE_ANALYTICS_READ_ENDPOINT as string | undefined
  if (configured !== undefined && configured !== '') return configured
  const hit = (import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined) ?? 'https://abacus.jasoncameron.dev/hit/deep-sea-math-v2'
  return hit.replace('/hit/', '/get/')
}

async function readCounter(key: string, fetcher: typeof fetch): Promise<number> {
  try {
    const response = await fetcher(`${readBase()}/${encodeURIComponent(key)}`)
    if (!response.ok) return 0
    const body = await response.json() as { value?: unknown }
    return typeof body.value === 'number' && Number.isFinite(body.value) ? body.value : 0
  } catch {
    return 0
  }
}

/** 拉取全部计数；单 key 失败按 0 处理。 */
export async function loadAnalyticsSnapshot(fetcher: typeof fetch = globalThis.fetch): Promise<AnalyticsSnapshot> {
  const keys = [
    ...PAGES.map((page) => page.key),
    ...GRADES.flatMap((grade) => THEME_IDS.map((theme) => `profile-created-g${grade}-${theme}`)),
    ...GRADES.flatMap((grade) => THEME_IDS.map((theme) => `session-completed-g${grade}-${theme}`)),
  ]
  if (typeof fetcher !== 'function') {
    return emptySnapshot()
  }
  const values = await Promise.all(keys.map((key) => readCounter(key, fetcher)))
  const byKey = new Map(keys.map((key, index) => [key, values[index] ?? 0]))

  const pages = PAGES.map((page) => ({ ...page, count: byKey.get(page.key) ?? 0 }))
  const profiles = GRADES.flatMap((grade) => THEME_IDS.map((themeId) => ({
    grade,
    themeId,
    count: byKey.get(`profile-created-g${grade}-${themeId}`) ?? 0,
  })))
  const sessions = GRADES.flatMap((grade) => THEME_IDS.map((themeId) => ({
    grade,
    themeId,
    count: byKey.get(`session-completed-g${grade}-${themeId}`) ?? 0,
  })))
  return {
    pages,
    profiles,
    sessions,
    pageTotal: pages.reduce((sum, page) => sum + page.count, 0),
    profileTotal: profiles.reduce((sum, row) => sum + row.count, 0),
    sessionTotal: sessions.reduce((sum, row) => sum + row.count, 0),
    updatedAt: Date.now(),
  }
}

export function emptySnapshot(): AnalyticsSnapshot {
  return {
    pages: PAGES.map((page) => ({ ...page, count: 0 })),
    profiles: [],
    sessions: [],
    pageTotal: 0,
    profileTotal: 0,
    sessionTotal: 0,
    updatedAt: Date.now(),
  }
}

export { THEME_LABELS, GRADES }
