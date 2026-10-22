/**
 * 读取第二版的匿名计数器。
 *
 * 只读聚合计数，不涉及任何档案、姓名、PIN 或答题内容。
 * 用法：npm run analytics:report
 */
const BASE = process.env.ANALYTICS_BASE ?? 'https://abacus.jasoncameron.dev/get/deep-sea-math-v2'

const pages = ['home', 'profiles', 'bestiary', 'mistakes', 'mistakes-print', 'quest', 'parent']
const grades = [1, 2, 3]
const themes = ['deep-sea', 'dinosaur', 'space']
const keys = [
  ...pages.map((page) => `page-${page}`),
  ...grades.flatMap((grade) => themes.map((theme) => `profile-created-g${grade}-${theme}`)),
  ...grades.flatMap((grade) => themes.map((theme) => `session-completed-g${grade}-${theme}`)),
]

const results = await Promise.all(keys.map(async (key) => {
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(key)}`)
    if (!response.ok) return [key, null]
    const body = await response.json()
    return [key, body.value ?? null]
  } catch {
    return [key, null]
  }
}))

for (const [key, value] of results) {
  console.log(`${key.padEnd(34)} ${value === null ? '—' : value}`)
}
