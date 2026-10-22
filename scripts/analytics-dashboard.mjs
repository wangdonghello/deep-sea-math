/**
 * 生成只在本机查看的匿名统计图表页面。
 *
 * HTML 本身不包含统计快照；每次打开、点击“刷新数据”或自动刷新时，
 * 都直接请求最新计数器。输出到 reports/analytics-dashboard.html，
 * 该目录已加入 .gitignore，不会提交或部署。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = process.env.ANALYTICS_READ_BASE ?? 'https://abacus.jasoncameron.dev/get/deep-sea-math-v2'
const config = {
  base,
  pages: [
    ['page-home', '首页'],
    ['page-profiles', '档案选择'],
    ['page-bestiary', '图鉴'],
    ['page-mistakes', '错题本'],
    ['page-mistakes-print', '错题打印'],
    ['page-quest', '答题页'],
    ['page-parent', '家长区'],
  ],
  grades: [1, 2, 3],
  themes: [
    ['deep-sea', '深海', '#54b8e8'],
    ['dinosaur', '恐龙', '#e49b4c'],
    ['space', '太空', '#a88cff'],
  ],
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>深海数学探险 · 匿名使用统计</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07101f;color:#e9f3ff;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
main{max-width:920px;margin:0 auto;padding:28px 20px 60px}h1{font-size:26px;margin:0 0 6px}.muted{color:#8ea6c4;margin:0}
.header{display:flex;align-items:center;justify-content:space-between;gap:16px}.refresh{min-height:42px;padding:0 18px;border:1px solid #5c7da3;border-radius:10px;background:#142944;color:#e9f3ff;font:inherit;font-weight:700;cursor:pointer}.refresh:disabled{opacity:.55;cursor:wait}
.notice{margin:18px 0;padding:12px 14px;border:1px solid #29415f;border-radius:12px;background:#0d192b;color:#b9cce4;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.card{padding:16px;border:1px solid #223b5a;border-radius:14px;background:#0b1729}.card span{display:block;color:#8ea6c4;font-size:12px}.card strong{display:block;margin-top:4px;font-size:28px;color:#ffbf69}
section{margin-top:24px;padding-top:18px;border-top:1px solid #223b5a}h2{font-size:16px;margin:0 0 12px}
.bar-row{display:grid;grid-template-columns:72px minmax(0,1fr) 44px;gap:10px;align-items:center;margin:7px 0}.bar-label{color:#9fb4cf;font-size:12px}.bar-track{display:flex;height:12px;border-radius:99px;background:#13233a;overflow:hidden}.bar-fill{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#ff9f43,#ffd18a)}.bar-seg{display:block;height:100%;min-width:0}.bar-row strong{text-align:right;font-size:12px;font-weight:600}
.legend{display:flex;gap:14px;margin-top:8px;color:#9fb4cf;font-size:12px}.legend span{display:inline-flex;align-items:center;gap:4px}.legend i{display:inline-block;width:8px;height:8px;border-radius:50%}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}th,td{padding:7px 8px;border-bottom:1px solid #1d3049;text-align:left}th{color:#8ea6c4;font-weight:500}td:last-child,th:last-child{text-align:right}
@media(max-width:600px){.header{align-items:flex-start;flex-direction:column}.cards{grid-template-columns:1fr}.bar-row{grid-template-columns:60px minmax(0,1fr) 36px}}
</style>
</head>
<body><main>
<div class="header"><div><h1>匿名使用统计</h1><p id="status" class="muted">正在读取最新计数…</p></div><button id="refresh" class="refresh" type="button">刷新数据</button></div>
<p class="notice">本机独立图表，不部署到公开站点。只显示累计匿名计数，不含姓名、PIN、答案或档案编号；计数器接口为公开只读，任何知道接口地址的人都可以读取汇总值。</p>
<div class="cards">
  <div class="card"><span>页面访问</span><strong id="page-total">—</strong></div>
  <div class="card"><span>创建档案</span><strong id="profile-total">—</strong></div>
  <div class="card"><span>完成题组</span><strong id="session-total">—</strong></div>
</div>
<section><h2>页面访问</h2><div id="page-chart"></div></section>
<section><h2>创建档案 · 年级 × 主题</h2><div id="profile-chart"></div><div id="legend-profile" class="legend"></div></section>
<section><h2>完成题组 · 年级 × 主题</h2><div id="session-chart"></div><div id="legend-session" class="legend"></div></section>
<section><h2>明细</h2><div id="detail-table"></div></section>
</main>
<script>
const CONFIG = ${JSON.stringify(config)};
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const counterKey = (kind, grade, theme) => kind + '-g' + grade + '-' + theme;
async function readCounter(key, stamp) {
  try {
    const url = CONFIG.base.replace(/\\/$/, '') + '/' + encodeURIComponent(key) + '?refresh=' + stamp;
    const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' });
    if (response.status === 404) return { value: 0, failed: false };
    if (!response.ok) return { value: 0, failed: true };
    const body = await response.json();
    return { value: typeof body.value === 'number' ? body.value : 0, failed: false };
  } catch (_) { return { value: 0, failed: true }; }
}
function renderStackedRows(hostId, rows) {
  document.getElementById(hostId).innerHTML = rows.map((row) => {
    const total = row.segments.reduce((sum, s) => sum + s.count, 0);
    const segments = row.segments.map((s) => s.count === 0 ? '' : '<span class="bar-seg" style="width:' + (s.count / Math.max(1, total) * 100) + '%;background:' + s.color + '" title="' + esc(s.label) + ' ' + s.count + '"></span>').join('');
    return '<div class="bar-row"><span class="bar-label">' + row.grade + ' 年级</span><span class="bar-track">' + segments + '</span><strong>' + total + '</strong></div>';
  }).join('');
}
function renderLegend(hostId) {
  document.getElementById(hostId).innerHTML = CONFIG.themes.map(([id, label, color]) => '<span><i style="background:' + color + '"></i>' + esc(label) + '</span>').join('');
}
async function refreshDashboard() {
  const button = document.getElementById('refresh');
  const status = document.getElementById('status');
  button.disabled = true;
  status.textContent = '正在读取最新计数…';
  const stamp = Date.now();
  const keys = [
    ...CONFIG.pages.map(([key]) => key),
    ...CONFIG.grades.flatMap((g) => CONFIG.themes.map(([theme]) => counterKey('profile-created', g, theme))),
    ...CONFIG.grades.flatMap((g) => CONFIG.themes.map(([theme]) => counterKey('session-completed', g, theme))),
  ];
  const results = await Promise.all(keys.map((key) => readCounter(key, stamp)));
  const counts = Object.fromEntries(keys.map((key, index) => [key, results[index].value]));
  const failures = results.filter((result) => result.failed).length;
  const pages = CONFIG.pages.map(([key, label]) => ({ key, label, count: counts[key] || 0 }));
  const pageTotal = pages.reduce((sum, page) => sum + page.count, 0);
  const makeRows = (kind) => CONFIG.grades.map((grade) => ({
    grade,
    segments: CONFIG.themes.map(([theme, label, color]) => ({
      label, color, count: counts[counterKey(kind, grade, theme)] || 0,
    })),
  }));
  const profileRows = makeRows('profile-created');
  const sessionRows = makeRows('session-completed');
  const profileTotal = profileRows.reduce((sum, row) => sum + row.segments.reduce((s, seg) => s + seg.count, 0), 0);
  const sessionTotal = sessionRows.reduce((sum, row) => sum + row.segments.reduce((s, seg) => s + seg.count, 0), 0);
  document.getElementById('page-total').textContent = String(pageTotal);
  document.getElementById('profile-total').textContent = String(profileTotal);
  document.getElementById('session-total').textContent = String(sessionTotal);
  const pageMax = Math.max(1, ...pages.map((page) => page.count));
  document.getElementById('page-chart').innerHTML = pages.map((page) => '<div class="bar-row"><span class="bar-label">' + esc(page.label) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.max(2, page.count / pageMax * 100) + '%"></span></span><strong>' + page.count + '</strong></div>').join('');
  renderStackedRows('profile-chart', profileRows);
  renderStackedRows('session-chart', sessionRows);
  renderLegend('legend-profile'); renderLegend('legend-session');
  const detailRows = [
    ...pages.map((page) => ['页面 · ' + page.label, page.count]),
    ...profileRows.flatMap((row) => row.segments.map((s) => ['建档 · ' + row.grade + ' 年级 · ' + s.label, s.count])),
    ...sessionRows.flatMap((row) => row.segments.map((s) => ['完成 · ' + row.grade + ' 年级 · ' + s.label, s.count])),
  ];
  document.getElementById('detail-table').innerHTML = '<table><thead><tr><th>指标</th><th>计数</th></tr></thead><tbody>' + detailRows.map(([label, count]) => '<tr><td>' + esc(label) + '</td><td>' + count + '</td></tr>').join('') + '</tbody></table>';
  const updated = new Date().toLocaleString('zh-CN');
  status.textContent = (failures ? '部分指标暂时不可用 · ' : '已更新 · ') + updated;
  button.disabled = false;
}
document.getElementById('refresh').addEventListener('click', () => { void refreshDashboard(); });
void refreshDashboard();
setInterval(() => { void refreshDashboard(); }, 60_000);
</script>
</body></html>`

const out = resolve('reports/analytics-dashboard.html')
await mkdir(resolve('reports'), { recursive: true })
await writeFile(out, html, 'utf8')
console.log(`已生成可实时刷新的本机统计图表：${out}`)
console.log('页面打开时自动加载，点击“刷新数据”强制重读，并每 60 秒自动更新。')
