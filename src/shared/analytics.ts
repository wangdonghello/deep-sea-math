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
const DEFAULT_ENDPOINT = 'https://abacus.jasoncameron.dev/hit/deep-sea-math-v2'

/** 读取当前浏览器的统计同意状态；localStorage 不可用时视为未同意。 */
export function hasAnalyticsConsent(): boolean {
  try {
    return globalThis.localStorage?.getItem(CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

/** 保存同意状态；只存 `granted` / 移除，不存任何身份信息。 */
export function setAnalyticsConsent(granted: boolean): void {
  try {
    if (granted) globalThis.localStorage?.setItem(CONSENT_KEY, 'granted')
    else globalThis.localStorage?.removeItem(CONSENT_KEY)
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
  const nav = globalThis.navigator
  if (nav?.doNotTrack === '1' || (nav as { globalPrivacyControl?: boolean } | undefined)?.globalPrivacyControl === true) return
  void fetch(endpointFor(key), { method: 'GET', mode: 'cors', keepalive: true }).catch(() => {
    // 统计失败不影响学习流程，也不重试/不排队。
  })
}

/** 页面访问：只使用路由名，不带 query、session 或题目 id。 */
export function trackPage(routeName: string): void {
  trackAnonymous(`page-${routeName.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`)
}

/** 建档：只按年级 + 主题聚合。 */
export function trackProfileCreated(grade: number, themeId: string): void {
  trackAnonymous(`profile-created-g${grade}-${themeId}`)
}

/** 完成题组：只按年级 + 主题聚合。 */
export function trackSessionCompleted(grade: number | undefined, themeId: string | undefined): void {
  trackAnonymous(`session-completed-g${grade ?? 'unknown'}-${themeId ?? 'unknown'}`)
}
