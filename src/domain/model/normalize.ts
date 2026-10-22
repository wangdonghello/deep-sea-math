import type { Grade, Profile, Question, ThemeId } from './types'

/** 第一版档案/题组升级时使用的缺省值。 */
export const DEFAULT_GRADE: Grade = 3
export const DEFAULT_THEME_ID: ThemeId = 'deep-sea'

/** 规范化后的档案：年级与主题一定存在。 */
export type NormalizedProfile = Profile & { grade: Grade; themeId: ThemeId }

/**
 * 档案规范化。
 *
 * 第一版档案没有 `grade`/`themeId`；读取时补 3 年级 + 深海，写入存储时仍可
 * 保持旧形状，避免一次全量迁移。新档案由家长表单显式写入两个字段。
 */
export function normalizeProfile(input: Profile): NormalizedProfile {
  return {
    ...input,
    grade: input.grade ?? DEFAULT_GRADE,
    themeId: input.themeId ?? DEFAULT_THEME_ID,
  }
}

/** 读取档案年级（缺省 3 年级）。 */
export function profileGrade(profile: Pick<Profile, 'grade'>): Grade {
  return profile.grade ?? DEFAULT_GRADE
}

/** 读取档案主主题（缺省深海）。 */
export function profileThemeId(profile: Pick<Profile, 'themeId'>): ThemeId {
  return profile.themeId ?? DEFAULT_THEME_ID
}

/** 题组的年级/主题快照；旧事件缺省按 3 年级/深海。 */
export interface SessionSnapshot {
  grade: Grade
  themeId: ThemeId
}

/** 规范化题组快照。 */
export function normalizeSessionSnapshot(input: { grade?: Grade; themeId?: ThemeId }): SessionSnapshot {
  return {
    grade: input.grade ?? DEFAULT_GRADE,
    themeId: input.themeId ?? DEFAULT_THEME_ID,
  }
}

/**
 * 题目规范化。
 *
 * 第一版题库没有 `grade`/`format`，按 3 年级、开放题处理；新版内容由生成器
 * 显式写出这两个字段。这里不校验内容（校验在 `data/content/schema`）。
 */
export function normalizeQuestion(input: Question): Question {
  return {
    ...input,
    grade: input.grade ?? DEFAULT_GRADE,
    format: input.format ?? 'open',
  }
}
