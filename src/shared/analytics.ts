/**
 * 匿名使用统计。
 *
 * 只上报计数器 key（页面名、年级、主题这类粗粒度维度），从不上传：
 * 姓名、昵称、PIN、答案、题目 id、档案 id、完整 URL 或精确位置。
 *
 * 默认关闭：家长在“学习设置与报告”里明确勾选后才开始发送；关闭后立即停止。
 * 这是儿童产品的最小化口径——匿名不等于无个人信息，IP 仍会经过第三方服务，
 * 因此必须让家长先选择。
 */
const CONSENT_KEY = 'dsm.analytics-consent'
const DENIED = 'denied'
const DEFAULT_ENDPOINT = 'https://abacus.jasoncameron.dev/hit/deep-sea-math-v2'

/**
 * 读取当前浏览器的统计同意状态。
 *
 * 产品选择“默认开启、可随时关闭”：没有存过值时返回 true；家长明确关闭后
 * 写入 `denied`，之后一直保持关闭。localStorage 不可用时保守返回 false。
 */
export function hasAnalyticsConsent(): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(CONSENT_KEY)
    if (stored === DENIED) return false
    return true
  } catch {
    return false
  }
}

/** 保存同意状态；只存 `granted` / 移除，不存任何身份信息。 */
export function setAnalyticsConsent(granted: boolean): void {
  try {
    if (granted) globalThis.localStorage?.setItem(CONSENT_KEY, 'granted')
    else globalThis.localStorage?.setItem(CONSENT_KEY, DENIED)
  } catch {
    // 隐私模式或禁用存储：静默失败，保持关闭。
  }
}

function endpointFor(key: string): string {
  const base = (import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined) ?? DEFAULT_ENDPOINT
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(key)}`
}

/** 发送一个匿名计数；未同意、Do Not Track 或网络失败时静默跳过。 */
export function trackAnonymous(key: string): void {
  if (!hasAnalyticsConsent()) return
  if (typeof globalThis.fetch !== 'function') return
  const nav = globalThis.navigator
  if (nav?.doNotTrack === '1' || (nav as { globalPrivacyControl?: boolean } | undefined)?.globalPrivacyControl === true) return
  void fetch(endpointFor(key), { method: 'GET', mode: 'cors', keepalive: true }).catch(() => {
    // 统计失败不影响学习流程，也不重试/不排队。
  })
}

/**
 * 本次浏览器标签页的首次打开：每个标签页每天只计一次。
 *
 * 页面访问计数器会把每次路由切换都算一次；这个计数器用来近似“有多少次
 * 独立打开”，刷新页面不会重复计（sessionStorage 在同标签页内保留）。
 */
export function trackSessionStart(): void {
  if (!hasAnalyticsConsent()) return
  const day = new Date().toISOString().slice(0, 10)
  try {
    const key = 'dsm.analytics-session'
    if (globalThis.sessionStorage?.getItem(key) === day) return
    globalThis.sessionStorage?.setItem(key, day)
  } catch {
    return
  }
  trackAnonymous('visit-session-total')
  trackAnonymous(`visit-session-${day}`)
}

/** 页面访问：只使用路由名，不带 query、session 或题目 id。 */
export function trackPage(routeName: string): void {
  trackAnonymous(`page-${routeName.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`)
}

/** 建档：只按年级 + 主题聚合。 */
export function trackProfileCreated(grade: number, themeId: string): void {
  trackAnonymous(`profile-created-g${grade}-${themeId}`)
}

/** 领养/孵化宠物：只按动物种类聚合，不含档案或昵称。 */
export function trackPetAdopted(animalId: string, profileId?: string): void {
  if (!hasAnalyticsConsent()) return
  const safe = animalId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  // 同一档案、同一只宠物只上报一次；这样老档案下次打开宠物房时也能补记，
  // 又不会因为刷新/切换页面重复增加。
  if (profileId !== undefined) {
    try {
      const key = `dsm.analytics-pet-${profileId}-${safe}`
      if (globalThis.localStorage?.getItem(key) === '1') return
      globalThis.localStorage?.setItem(key, '1')
    } catch {
      return
    }
  }
  trackAnonymous('pet-adopted-total')
  trackAnonymous(`pet-adopted-${safe}`)
}

/** 完成题组：只按年级 + 主题聚合。 */
export function trackSessionCompleted(grade: number | undefined, themeId: string | undefined): void {
  trackAnonymous(`session-completed-g${grade ?? 'unknown'}-${themeId ?? 'unknown'}`)
}
