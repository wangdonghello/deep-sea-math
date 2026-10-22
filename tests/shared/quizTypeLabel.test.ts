import { describe, expect, it } from 'vitest'

import { QUIZ_TYPES } from '@/domain/model/types'
import {
  QUIZ_TYPE_FALLBACK,
  QUIZ_TYPE_LABELS,
  quizTypeLabel,
} from '@/shared/quizTypeLabel'

describe('quizTypeLabel', () => {
  it('为七类题型各提供中文名，且不把内部键名漏到界面', () => {
    for (const type of QUIZ_TYPES) {
      const label = quizTypeLabel(type)
      expect(label).not.toBe(type)
      expect(label).toMatch(/[\u4e00-\u9fa5]/)
      expect(label).not.toMatch(/[a-z]/i)
    }
  })

  it('中文名与年级适用题型逐项对齐', () => {
    expect(QUIZ_TYPE_LABELS).toEqual({
      'add-sub': '加减法',
      'number-sense': '数的认识',
      'mul-div': '乘除法',
      'two-step-app': '两步应用题',
      'unknown-relation': '未知数关系',
      'unit-time-route': '单位·时间·路线',
      'pattern-data': '规律与数据',
    })
  })

  it('题型缺失时退回中性占位，而不是回显 null 或内部键', () => {
    expect(quizTypeLabel(null)).toBe(QUIZ_TYPE_FALLBACK)
    expect(quizTypeLabel(undefined)).toBe(QUIZ_TYPE_FALLBACK)
    expect(QUIZ_TYPE_FALLBACK).toBe('题型待补充')
  })
})
