import { describe, expect, it } from 'vitest'

import {
  DEFAULT_GRADE,
  DEFAULT_THEME_ID,
  normalizeProfile,
  normalizeQuestion,
  normalizeSessionSnapshot,
  profileGrade,
  profileThemeId,
} from '@/domain/model/normalize'
import type { Profile, Question } from '@/domain/model/types'

describe('normalizeProfile', () => {
  it('为第一版档案补 3 年级与深海主题', () => {
    const legacy = {
      id: 'p1',
      nickname: '小海星',
      avatarId: 'avatar-1',
      pinHash: 'hash',
      salt: 'salt',
      createdAt: 1,
    } as Profile

    expect(normalizeProfile(legacy)).toMatchObject({
      grade: DEFAULT_GRADE,
      themeId: DEFAULT_THEME_ID,
    })
    expect(profileGrade(legacy)).toBe(3)
    expect(profileThemeId(legacy)).toBe('deep-sea')
  })

  it('保留显式年级与主题', () => {
    const profile = {
      id: 'p2',
      nickname: '小鲸',
      avatarId: 'avatar-2',
      pinHash: 'hash',
      salt: 'salt',
      createdAt: 2,
      grade: 1,
      themeId: 'dinosaur',
    } as Profile

    expect(normalizeProfile(profile)).toMatchObject({ grade: 1, themeId: 'dinosaur' })
  })
})

describe('normalizeQuestion', () => {
  it('为第一版题目补 3 年级与开放题型', () => {
    const legacy = {
      id: 'q1',
      answer: { value: 5 },
    } as unknown as Question

    expect(normalizeQuestion(legacy)).toMatchObject({
      grade: DEFAULT_GRADE,
      format: 'open',
    })
  })

  it('保留选择题的选项与正确答案', () => {
    const choice = {
      id: 'q2',
      grade: 1,
      format: 'choice',
      options: [
        { id: 'A', label: '1' },
        { id: 'B', label: '2' },
      ],
      answer: { value: 0, optionId: 'B' },
    } as unknown as Question

    expect(normalizeQuestion(choice)).toMatchObject({
      grade: 1,
      format: 'choice',
      answer: { optionId: 'B' },
    })
  })
})

describe('normalizeSessionSnapshot', () => {
  it('为旧题组补 3 年级与深海', () => {
    expect(normalizeSessionSnapshot({})).toEqual({ grade: 3, themeId: 'deep-sea' })
  })

  it('保留新题组快照', () => {
    expect(normalizeSessionSnapshot({ grade: 2, themeId: 'space' })).toEqual({
      grade: 2,
      themeId: 'space',
    })
  })
})
