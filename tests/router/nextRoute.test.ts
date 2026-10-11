import { describe, expect, it } from 'vitest'

import { HOME_PATH, PARENT_PATH, PROFILES_PATH, nextRoute, pathnameOf } from '@/router/nextRoute'

/**
 * `src/router/nextRoute` 的行为契约（Task 17 REFACTOR）。
 *
 * 守卫要做 I/O（读会话态、初始化存储），因此"该去哪"被抽成不碰任何全局的
 * 纯函数。这里穷举它的三条规则与 pathname 归一化——守卫本身怎么 await 都
 * 可以改，这三条只有一处实现，也必须在此被钉住：
 *
 * 1. 未选档案 → `/profiles`：孩子常驻页面没有档案时 MUST NOT 渲染数据；
 * 2. 已选档案 → 目标路径（query/hash 由路由层保留，纯函数只认 pathname）；
 * 3. 已有档案却落在档案选择页 → `/home`：那是死路（登录后又回到选档案）。
 */

describe('router: nextRoute', () => {
  it('未选档案时一律去档案选择页', () => {
    for (const path of ['/home', '/quest', '/bestiary', '/observation/abc', '/mistakes', '/map', '/']) {
      expect(nextRoute({ path, hasProfile: false })).toBe(PROFILES_PATH)
    }
  })

  it('家长区在没有档案时仍可访问（第一个档案只能在这里建）', () => {
    // 否则首次安装点"家长区"会被守卫打回档案选择页，永远建不了第一个档案。
    expect(nextRoute({ path: PARENT_PATH, hasProfile: false })).toBe(PARENT_PATH)
  })

  it('已选档案时放行目标路径', () => {
    for (const path of [HOME_PATH, '/quest', '/bestiary', '/observation/abc', '/mistakes', '/map', PARENT_PATH]) {
      expect(nextRoute({ path, hasProfile: true })).toBe(path)
    }
  })

  it('已有档案却落在档案选择页时回首页（不让人卡在选档案）', () => {
    expect(nextRoute({ path: PROFILES_PATH, hasProfile: true })).toBe(HOME_PATH)
  })

  it('档案选择页自身在未选档案时保持原地', () => {
    // 已在目标页还重定向会造成导航循环（vue-router 会抛 "too many redirects"）。
    expect(nextRoute({ path: PROFILES_PATH, hasProfile: false })).toBe(PROFILES_PATH)
  })

  it('pathnameOf 剥掉 query 与 hash，只留路径段', () => {
    expect(pathnameOf('/quest?session=s-1')).toBe('/quest')
    expect(pathnameOf('/observation/abc#card')).toBe('/observation/abc')
    expect(pathnameOf('/quest?session=s-1&x=1#y')).toBe('/quest')
    expect(pathnameOf('/home')).toBe('/home')
  })
})
