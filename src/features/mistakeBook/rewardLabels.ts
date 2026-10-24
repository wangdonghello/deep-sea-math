/**
 * 错题练习奖励的展示名。
 *
 * id 与 `replay.practiceProgress` 的 `badgeIds` / `decorationIds` 一一对应；
 * 界面与家长报告都从这里取中文名，避免把 `mistake-fix-5` 这种 id 直接给孩子看。
 */
export const REWARD_LABELS: Readonly<Record<string, string>> = {
  'mistake-fix-5': '修复徽章 I',
  'mistake-fix-10': '修复徽章 II',
  'mistake-fix-20': '修复徽章 III',
  'mistake-star-5': '图鉴装饰 · 珊瑚星',
  'mistake-star-10': '图鉴装饰 · 海萤灯',
  'mistake-star-15': '图鉴装饰 · 贝壳相框',
  'mistake-star-20': '图鉴装饰 · 金色潜航徽记',
}

/** 取奖励展示名；未知 id 回退成 id 本身（不静默隐藏已解锁奖励）。 */
export function rewardLabel(id: string): string {
  return REWARD_LABELS[id] ?? id
}
