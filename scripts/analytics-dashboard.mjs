/**
 * 生成只在本机查看的匿名统计图表。
 *
 * 不部署、不提交；输出到 reports/analytics-dashboard.html。
 * 计数器接口本身是公开只读的，因此这是“只在本机展示”的独立报表，
 * 不是服务端权限系统。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const BASE = process.env.ANALYTICS_READ_BASE ?? 'https://abacus.jasoncameron.dev/get/deep-sea-math-v2'
const PAGES = [
  ['page-home', '首页'],
  ['page-profiles', '档案选择'],
  ['page-bestiary', '图鉴'],
  ['page-mistakes', '错题本'],
  ['page-mistakes-print', '错题打印'],
  ['page-quest', '答题页'],
  ['page-parent', '家长区'],
]
const GRADES = [1, 2, 3]
const THEMES = [['deep-sea', '深海'], ['dinosaur', '恐龙'], ['space', '太空']]
const themeColor = { 'deep-sea': '#54b8e8', dinosaur: '#e49b4c', space: '#a88cff' }

async function read(key) {
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(key)}`)
    if (!response.ok) return 0
    const body = await response.json()
    return typeof body.value === 'number' ? body.value : 0
  } catch {
    return 0
  }
}

const keys = [
  ...PAGES.map(([key]) => key),
  ...GRADES.flatMap((grade) => THEMES.map(([theme]) => `profile-created-g${grade}-${theme}`)),
  ...GRADES.flatMap((grade) => THEMES.map(([theme]) => `session-completed-g${grade}-${theme}`)),
]
const values = new Map(await Promise.all(keys.map(async (key) => [key, await read(key)])))
const get = (key) => values.get(key) ?? 0

const pages = PAGES.map(([key, label]) => ({ key, label, count: get(key) }))
const profileRows = GRADES.map((grade) => ({
  grade,
  total: THEMES.reduce((sum, [theme]) => sum + get(`profile-created-g${grade}-${theme}`), 0),
  segments: THEMES.map(([theme, label]) => ({ theme, label, count: get(`profile-created-g${grade}-${theme}`) })),
}))
const sessionRows = GRADES.map((grade) => ({
  grade,
  total: THEMES.reduce((sum, [theme]) => sum + get(`session-completed-g${grade}-${theme}`), 0),
  segments: THEMES.map(([theme, label]) => ({ theme, label, count: get(`session-completed-g${grade}-${theme}`) })),
}))
const pageTotal = pages.reduce((sum, page) => sum + page.count, 0)
const profileTotal = profileRows.reduce((sum, row) => sum + row.total, 0)
const sessionTotal = sessionRows.reduce((sum, row) => sum + row.total, 0)
const pageMax = Math.max(1, ...pages.map((page) => page.count))

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const barRows = (rows) => rows.map((row) => `
  <div class="bar-row">
    <span class="bar-label">${row.grade} 年级</span>
    <span class="bar-track">${row.segments.map((segment) => segment.count === 0 ? '' : `<span class="bar-seg" style="width:${(segment.count / Math.max(1, row.total)) * 100}%;background:${themeColor[segment.theme]}" title="${esc(segment.label)} ${segment.count}"></span>`).join('')}</span>
    <strong>${row.total}</strong>
  </div>`).join('')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>深海数学探险 · 匿名使用统计</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07101f;color:#e9f3ff;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
main{max-width:920px;margin:0 auto;padding:28px 20px 60px}h1{font-size:26px;margin:0 0 6px}.muted{color:#8ea6c4;margin:0}
.notice{margin:18px 0;padding:12px 14px;border:1px solid #29415f;border-radius:12px;background:#0d192b;color:#b9cce4;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.card{padding:16px;border:1px solid #223b5a;border-radius:14px;background:#0b1729}.card span{display:block;color:#8ea6c4;font-size:12px}.card strong{display:block;margin-top:4px;font-size:28px;color:#ffbf69}
section{margin-top:24px;padding-top:18px;border-top:1px solid #223b5a}h2{font-size:16px;margin:0 0 12px}
.bar-row{display:grid;grid-template-columns:72px minmax(0,1fr) 44px;gap:10px;align-items:center;margin:7px 0}.bar-label{color:#9fb4cf;font-size:12px}.bar-track{display:flex;height:12px;border-radius:99px;background:#13233a;overflow:hidden}.bar-fill{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ff9f43,#ffd18a)}.bar-seg{display:block;height:100%}.bar-row strong{text-align:right;font-size:12px;font-weight:600}
.legend{display:flex;gap:14px;margin-top:8px;color:#9fb4cf;font-size:12px}.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}th,td{padding:7px 8px;border-bottom:1px solid #1d3049;text-align:left}th{color:#8ea6c4;font-weight:500}td:last-child,th:last-child{text-align:right}
@media(max-width:600px){.cards{grid-template-columns:1fr}.bar-row{grid-template-columns:60px minmax(0,1fr) 36px}}
</style>
</head>
<body><main>
<h1>匿名使用统计</h1>
<p class="muted">生成于 ${esc(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))} · 仅本机查看</p>
<p class="notice">这份 HTML 不部署、不提交；只在本机生成。计数器接口本身是公开只读的，所以这是“只在本机展示”的独立报表，不是服务端权限系统。统计不含姓名、PIN、答案或档案编号。</p>
<div class="cards">
  <div class="card"><span>页面访问</span><strong>${pageTotal}</strong></div>
  <div class="card"><span>创建档案</span><strong>${profileTotal}</strong></div>
  <div class="card"><span>完成题组</span><strong>${sessionTotal}</strong></div>
</div>
<section><h2>页面访问</h2>${pages.map((page) => `<div class="bar-row"><span class="bar-label">${esc(page.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, (page.count / pageMax) * 100)}%"></span></span><strong>${page.count}</strong></div>`).join('')}</section>
<section><h2>创建档案 · 年级 × 主题</h2>${barRows(profileRows)}<div class="legend">${THEMES.map(([theme, label]) => `<span><i style="background:${themeColor[theme]}"></i>${label}</span>`).join('')}</div></section>
<section><h2>完成题组 · 年级 × 主题</h2>${barRows(sessionRows)}<div class="legend">${THEMES.map(([theme, label]) => `<span><i style="background:${themeColor[theme]}"></i>${label}</span>`).join('')}</div></section>
<section><h2>明细</h2><table><thead><tr><th>指标</th><th>计数</th></tr></thead><tbody>
${pages.map((page) => `<tr><td>页面 · ${esc(page.label)}</td><td>${page.count}</td></tr>`).join('')}
${profileRows.flatMap((row) => row.segments.map((segment) => `<tr><td>建档 · ${row.grade} 年级 · ${esc(segment.label)}</td><td>${segment.count}</td></tr>`)).join('')}
${sessionRows.flatMap((row) => row.segments.map((segment) => `<tr><td>完成 · ${row.grade} 年级 · ${esc(segment.label)}</td><td>${segment.count}</td></tr>`)).join('')}
</tbody></table></section>
</main></body></html>`

const out = resolve('reports/analytics-dashboard.html')
await mkdir(resolve('reports'), { recursive: true })
await writeFile(out, html, 'utf8')
console.log(`已生成 ${out}`)
