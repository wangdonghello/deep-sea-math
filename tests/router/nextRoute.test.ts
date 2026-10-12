import { describe, expect, it } from 'vitest'

import {
  HOME_PATH,
  PARENT_MANAGE_PATH,
  PARENT_OVERVIEW_PATH,
  PARENT_PATH,
  PARENT_SETTINGS_PATH,
  PROFILES_PATH,
  nextRoute,
  pathnameOf,
} from '@/router/nextRoute'

/**
 * `src/router/nextRoute` 的行为契约（Task 17 REFACTOR + P1 家长门禁）。
 *
 * 守卫要做 I/O（读会话态、初始化存储），因此"该去哪"被抽成不碰任何全局的
 * 纯函数。这里穷举它的规则与 pathname 归一化——守卫本身怎么 await 都可以改，
 * 这些规则只有一处实现，也必须在此被钉住：
 *
 * 1. 未选档案 → `/profiles`：孩子常驻页面没有档案时 MUST NOT 渲染数据；
 * 2. 已选档案 → 目标路径（query/hash 由路由层保留，纯函数只认 pathname）；
 * 3. 已有档案却落在档案选择页 → `/home`：那是死路（登录后又回到选档案）；
 * 4. 家长子路径（overview/settings/manage）未解锁本次家长会话 → `/parent`
 *    门禁页；门禁页自身不受此规则约束，否则会自redirect。
 */

/** 一份默认的守卫输入：无档案、家长区未解锁。 */
function state(
  path: string,
  hasProfile: boolean,
  parentUnlocked = false,
): { path: string; hasProfile: boolean; parentUnlocked: boolean } {
  return { path, hasProfile, parentUnlocked }
}

describe('router: nextRoute — 档案规则', () => {
  it('未选档案时一律去档案选择页', () => {
    for (const path of ['/home', '/quest', '/bestiary', '/observation/abc', '/mistakes', '/map', '/']) {
      expect(nextRoute(state(path, false))).toBe(PROFILES_PATH)
    }
  })

  it('家长区在没有档案时仍可访问（第一个档案只能在这里建）', () => {
    // 否则首次安装点"家长区"会被守卫打回档案选择页，永远建不了第一个档案。
    expect(nextRoute(state(PARENT_PATH, false))).toBe(PARENT_PATH)
  })

  it('已选档案时放行目标路径', () => {
    for (const path of [HOME_PATH, '/quest', '/bestiary', '/observation/abc', '/mistakes', '/map', PARENT_PATH]) {
      expect(nextRoute(state(path, true))).toBe(path)
    }
  })

  it('已有档案却落在档案选择页时回首页（不让人卡在选档案）', () => {
    expect(nextRoute(state(PROFILES_PATH, true))).toBe(HOME_PATH)
  })

  it('档案选择页自身在未选档案时保持原地', () => {
    // 已在目标页还重定向会造成导航循环（vue-router 会抛 "too many redirects"）。
    expect(nextRoute(state(PROFILES_PATH, false))).toBe(PROFILES_PATH)
  })
})

describe('router: nextRoute — 家长门禁规则', () => {
  const children = [PARENT_OVERVIEW_PATH, PARENT_SETTINGS_PATH, PARENT_MANAGE_PATH]

  it('未解锁时：不管有没有档案，三个子路径一律打回门禁页', () => {
    for (const path of children) {
      expect(nextRoute(state(path, true, false))).toBe(PARENT_PATH)
      // 无档案时也要回门禁页（而不是档案选择页）：建档入口在家长区内。
      expect(nextRoute(state(path, false, false))).toBe(PARENT_PATH)
    }
  })

  it('已解锁时：子路径原样放行（有档案与无档案都一样）', () => {
    for (const path of children) {
      expect(nextRoute(state(path, true, true))).toBe(path)
      expect(nextRoute(state(path, false, true))).toBe(path)
    }
  })

  it('门禁页自身不受"未解锁"规则约束（否则会无限自redirect）', () => {
    expect(nextRoute(state(PARENT_PATH, true, false))).toBe(PARENT_PATH)
    expect(nextRoute(state(PARENT_PATH, false, false))).toBe(PARENT_PATH)
  })
})

describe('router: pathnameOf', () => {
  it('pathnameOf 剥掉 query 与 hash，只留路径段', () => {
    expect(pathnameOf('/quest?session=s-1')).toBe('/quest')
    expect(pathnameOf('/observation/abc#card')).toBe('/observation/abc')
    expect(pathnameOf('/quest?session=s-1&x=1#y')).toBe('/quest')
    expect(pathnameOf('/parent/settings?tab=report')).toBe('/parent/settings')
    expect(pathnameOf('/home')).toBe('/home')
  })
})
