# 小猫头像重设计实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 重做盲盒小猫的 SVG 脸部，让它与小狗明显区分：圆脸、短吻、小三角鼻、分离胡须垫、竖瞳和粉色耳瓣。

**架构：** 继续使用 `CompanionAvatar.vue` 单组件与现有六动物 Look 数据。猫通过 `animalId === 'companion-cat'` 渲染专属脸；狗及其他伙伴继续使用当前脸部模板。身体、等级变形、互动与成长逻辑不变。

**技术栈：** Vue 3 `<script setup>`、内联 SVG、Vitest + Vue Test Utils、TypeScript。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/features/pet/CompanionAvatar.vue` | 小猫专属面部 SVG；保持共享身体与其他动物脸不变 |
| `tests/features/pet/CompanionAvatar.test.ts` | 参数化测试猫/狗特征差异、点击与低心情行为 |
| `docs/superpowers/specs/2026-11-10-cat-avatar-redesign-design.md` | 已确认设计规格 |

> 当前仓库在 `v4` 分支，开始前 `git status --short --branch` 显示只有本功能规格未提交；执行时保留用户工作区里的任何新改动，不 reset、不 stash pop。

### 任务 1：先锁定猫狗的特征差异

**文件：**
- 修改：`tests/features/pet/CompanionAvatar.test.ts`
- 参考：`src/features/pet/CompanionAvatar.vue`

- [ ] **步骤 1：编写失败测试，断言猫专属 SVG 结构**

在测试文件新增：

```ts
it('小猫使用猫科脸型，不复用小狗宽圆口鼻', () => {
  const cat = mount(CompanionAvatar, {
    props: { animalId: 'companion-cat', mood: 80, level: 1 },
  })
  expect(cat.find('[data-feature="cat-triangle-nose"]').exists()).toBe(true)
  expect(cat.find('[data-feature="cat-whisker-pads"]').exists()).toBe(true)
  expect(cat.find('[data-feature="cat-vertical-pupils"]').exists()).toBe(true)
  expect(cat.find('[data-feature="cat-inner-ears"]').exists()).toBe(true)
  expect(cat.find('[data-feature="generic-dog-muzzle"]').exists()).toBe(false)
})
```

保留现有六种动物全身测试。再新增狗脸测试：

```ts
it('小狗保留宽圆鼻与宽口鼻，不显示猫专属五官', () => {
  const dog = mount(CompanionAvatar, {
    props: { animalId: 'companion-dog', mood: 80, level: 1 },
  })
  expect(dog.find('[data-feature="generic-dog-muzzle"]').exists()).toBe(true)
  expect(dog.find('[data-feature="cat-triangle-nose"]').exists()).toBe(false)
  expect(dog.find('[data-feature="cat-whisker-pads"]').exists()).toBe(false)
  expect(dog.find('[data-feature="cat-vertical-pupils"]').exists()).toBe(false)
})
```

- [ ] **步骤 2：运行组件测试确认失败**

运行：`./node_modules/.bin/vitest run tests/features/pet/CompanionAvatar.test.ts`
预期：FAIL，猫脸 `data-feature` 标记尚不存在。

- [ ] **步骤 3：测试项必须对应明确图层**

猫图层最终使用以下测试标记：

```html
<g data-feature="cat-inner-ears">...</g>
<g data-feature="cat-whisker-pads">...</g>
<path data-feature="cat-triangle-nose" ... />
<g data-feature="cat-vertical-pupils">...</g>
```

狗口鼻图层使用 `data-feature="generic-dog-muzzle"`。这些标记作为组件测试接口保留，避免未来样式变动又把两种脸混为一谈。

- [ ] **步骤 4：再次运行测试确认仍然按预期失败**

运行：`./node_modules/.bin/vitest run tests/features/pet/CompanionAvatar.test.ts`
预期：仅新增猫狗外观测试失败，原有测试保持通过。

- [ ] **步骤 5：Commit 测试**

```bash
git add tests/features/pet/CompanionAvatar.test.ts
git commit -m "[DSM2001] test: specify cat and dog facial differences"
```

### 任务 2：绘制小猫专属圆脸五官

**文件：**
- 修改：`src/features/pet/CompanionAvatar.vue`
- 测试：`tests/features/pet/CompanionAvatar.test.ts`

- [ ] **步骤 1：按 animalId 分开猫脸与通用脸**

在 `<script setup>` 新增：

```ts
const isCat = computed(() => props.animalId === 'companion-cat')
```

将 SVG 中从 `<!-- 耳朵 -->` 到 `<!-- 胡须 -->` 的通用脸部区域拆为：

- `v-if="isCat"`：猫专属耳、头、脸颊、胡须垫、三角鼻、竖瞳与猫嘴；
- `v-else`：保留当前所有非猫伙伴的耳朵、头、狗式宽口鼻、圆鼻、眼睛、嘴。

猫眼和口鼻必须覆盖完整区域，不得再同时渲染通用圆鼻与宽口鼻。

- [ ] **步骤 2：运行组件测试确认仍失败/红灯范围缩小**

运行：`./node_modules/.bin/vitest run tests/features/pet/CompanionAvatar.test.ts`
预期：狗结构与现有六动物测试通过；猫的特征标记待补全的测试失败。

- [ ] **步骤 3：添加猫科五官 SVG**

猫头保留现有头部圆形，但专属脸层这样绘制（坐标系 320×300，置于现有头部组内部）：

```vue
<g v-if="isCat" class="companion__cat-face">
  <!-- 粉色内耳，与尖耳轮廓分别绘制，能完整看见耳瓣 -->
  <path data-feature="cat-inner-ears"
    d="M49 91 L45 64 L75 82 Z M127 82 L157 64 L153 91 Z"
    :fill="look.accent" />

  <!-- 分开的猫咪胡须垫：左右两瓣，中间留出鼻梁空间 -->
  <g data-feature="cat-whisker-pads">
    <ellipse cx="70" cy="160" rx="20" ry="15" :fill="look.belly" :stroke="look.dark" stroke-width="1.5" />
    <ellipse cx="116" cy="160" rx="20" ry="15" :fill="look.belly" :stroke="look.dark" stroke-width="1.5" />
  </g>

  <!-- 短小的倒三角鼻，明显区别于狗的宽圆鼻 -->
  <path data-feature="cat-triangle-nose"
    d="M89 153 Q93 150 97 153 L93 160 Z"
    :fill="look.dark" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1" />

  <!-- 猫嘴：鼻下短竖线 + 两个小弧，低心情也保留猫嘴轮廓 -->
  <path d="M93 160 L93 166 M93 166 Q86 173 79 168 M93 166 Q100 173 107 168"
    fill="none" :stroke="look.dark" stroke-width="2.5" stroke-linecap="round" />

  <!-- 每侧三根胡须，由脸颊向外展开，不穿过胡须垫 -->
  <g class="companion__cat-whiskers" :stroke="look.dark" stroke-width="1.8" stroke-linecap="round">
    <path d="M52 157 L27 150 M51 162 L22 162 M53 168 L28 176" />
    <path d="M134 157 L159 150 M135 162 L164 162 M133 168 L158 176" />
  </g>

  <!-- 竖瞳猫眼；每只眼是浅色眼白 + 窄竖椭圆瞳孔 + 高光 -->
  <g data-feature="cat-vertical-pupils">
    <ellipse cx="76" cy="128" rx="10" ry="12" fill="#fff8e8" :stroke="look.dark" stroke-width="1.5" />
    <ellipse cx="110" cy="128" rx="10" ry="12" fill="#fff8e8" :stroke="look.dark" stroke-width="1.5" />
    <ellipse cx="76" cy="129" rx="3.5" ry="8" :fill="look.dark" />
    <ellipse cx="110" cy="129" rx="3.5" ry="8" :fill="look.dark" />
    <circle cx="77" cy="126" r="1.8" fill="#fff" />
    <circle cx="111" cy="126" r="1.8" fill="#fff" />
  </g>
</g>
```

注意：尖耳主体在当前模板的耳朵分支中。把猫内耳单独放在猫脸组顶部不会遮掉耳朵外轮廓；其余动物继续走原来的模板分支。

- [ ] **步骤 4：低心情猫表情**

低心情时以两条半闭眼曲线替代竖瞳，但猫耳瓣、分离胡须垫、三角鼻、猫嘴和胡须继续存在。按下列结构包住眼层：

```vue
<g v-if="!low" data-feature="cat-vertical-pupils">...竖瞳眼...</g>
<g v-else class="companion__cat-sleepy-eyes">
  <path d="M66 130 Q76 124 86 130 M100 130 Q110 124 120 130"
    fill="none" :stroke="look.dark" stroke-width="2.5" stroke-linecap="round" />
</g>
```

测试需要断言低心情下猫专属耳/鼻/胡须垫保留，低落眼线存在。

- [ ] **步骤 5：运行组件测试确认通过**

运行：`./node_modules/.bin/vitest run tests/features/pet/CompanionAvatar.test.ts`
预期：PASS，猫狗的猫科/犬科差异都由 data-feature 标记锁定。

- [ ] **步骤 6：Commit 实现**

```bash
git add src/features/pet/CompanionAvatar.vue tests/features/pet/CompanionAvatar.test.ts
git commit -m "[DSM2001] feat: give kitten distinct feline face"
```

### 任务 3：视觉预览与回归验收

**文件：**
- 临时测试：`tests/features/pet/render-cat.tmp.test.ts`（检查后删除，不提交）
- 修改：如验收发现遮挡，仅修改 `src/features/pet/CompanionAvatar.vue`
- 测试：`tests/features/pet/CompanionAvatar.test.ts`

- [ ] **步骤 1：渲染猫与狗各一张 SVG**

临时测试代码：

```ts
import { writeFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { it } from 'vitest'
import CompanionAvatar from '@/features/pet/CompanionAvatar.vue'

it('renders cat and dog previews', () => {
  for (const animalId of ['companion-cat', 'companion-dog'] as const) {
    const view = mount(CompanionAvatar, { props: { animalId, level: 1, mood: 85 } })
    writeFileSync(`/tmp/${animalId}.svg`, view.get('svg').element.outerHTML)
  }
})
```

- [ ] **步骤 2：运行预览测试并转换 PNG**

```bash
./node_modules/.bin/vitest run tests/features/pet/render-cat.tmp.test.ts
rsvg-convert -w 480 /tmp/companion-cat.svg -o /tmp/cat-new.png
rsvg-convert -w 480 /tmp/companion-dog.svg -o /tmp/dog-compare.png
```

预期：命令成功；人工确认猫的三角鼻/分离胡须垫/竖瞳明显，狗仍然是宽鼻长吻垂耳。

- [ ] **步骤 3：检查等级边界**

组件测试猫 Lv.1 与 Lv.15，确保 `headTransform` 缩放后猫科脸层仍在正确位置，Lv.10+ 颊毛不盖住胡须垫和胡须。狗 Lv.1/Lv.15 同样保持犬科脸型。

- [ ] **步骤 4：删除临时渲染测试并跑全量检查**

```bash
rm tests/features/pet/render-cat.tmp.test.ts
npm run type-check
./node_modules/.bin/vitest run
VITE_BASE=/v4/ npm run build
```

预期：类型检查、所有 Vitest 和构建均成功；测试总数增加猫狗脸部与低心情用例。

- [ ] **步骤 5：Commit 任一视觉微调**

```bash
git add src/features/pet/CompanionAvatar.vue tests/features/pet/CompanionAvatar.test.ts
git commit -m "[DSM2001] fix: polish kitten face rendering"
```

## 部署说明

本计划只规定测试构建；部署应遵循仓库当前流程并先确认用户希望部署的目标。不要通过重置分支或丢弃工作区改动来整理环境。

## 规格覆盖自检

- 猫独有三角鼻、圆脸短吻、分离胡须垫、三根胡须、竖瞳、内耳瓣：任务 2/测试覆盖。
- 狗宽鼻/长吻/垂耳不变、无猫专属图层：任务 1 与任务 2。
- Lv.10+ 颊毛、低心情、等级缩放不遮挡：任务 2/3。
- 六种其它伙伴和身体/互动/成长规则不改：任务范围与回归测试。
- 全量 Vitest、type-check、build：任务 3。
- 计划无未定义 API、无占位步骤；测试结构选择器、属性名称及命令保持一致。
