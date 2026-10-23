import type { QuizType } from '@/domain/model/types'

/**
 * `src/shared/quizTypeLabel.ts` —— 年级适用题型的界面中文名。
 *
 * 内部标识（`add-sub` / `mul-div` …）是事件日志、题库与投影里的稳定键，
 * **不能**直接展示给家长和孩子：`ReportPanel` 的「题型掌握分布」与错题详情
 * 曾直接渲染键名，界面上出现的是英文。这里作为展示层的唯一真源，错题本筛选、
 * 错题详情与家长报告共用，避免三处各写一份中文名后漂移。
 *
 * 本模块只有数据与纯函数，不含业务规则。
 */
export const QUIZ_TYPE_LABELS: Readonly<Record<QuizType, string>> = {
  'add-sub': '加减法',
  'number-sense': '数的认识',
  'mul-div': '乘除法',
  'two-step-app': '两步应用题',
  'unknown-relation': '未知数关系',
  'unit-time-route': '单位·时间·路线',
  'pattern-data': '规律与排序',
}

/** 题型未知或缺失时的中性占位；MUST NOT 退回内部键名。 */
export const QUIZ_TYPE_FALLBACK = '题型待补充'

/**
 * 把内部题型键翻成中文。
 *
 * @param type 题型键；`null` / `undefined` 表示题库里查不到这道题的题型。
 * @returns 对应的中文名；未知值退回 {@link QUIZ_TYPE_FALLBACK}。
 */
export function quizTypeLabel(type: QuizType | null | undefined): string {
  if (type === null || type === undefined) return QUIZ_TYPE_FALLBACK
  return QUIZ_TYPE_LABELS[type] ?? QUIZ_TYPE_FALLBACK
}
