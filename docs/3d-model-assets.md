# 接入新的深海鱼 3D 模型

本文说明如何把一个**授权许可明确**的第三方 3D 模型接入观察舱。引入新模型前
必须先取得许可文件；拿不到许可的模型不要放进 `public/`。

图鉴与观察舱在**有授权模型时默认展示 3D 模型**；真实影像是每个物种的必备
素材（见 `docs/photo-assets.md`），负责快速识别、一键切回与加载失败兜底。
接入模型会让默认页面多下载 GLB（当前压缩后约 1.3 MB），因此接入前先确认体积
与低端机表现。

## 1. 确认许可

放进 `public/models/` 的模型必须满足：

| 条件 | 说明 |
|---|---|
| 许可允许商用与修改 | 儿童产品属商业用途；CC BY、CC0 均可，CC BY-NC 不可 |
| 能拿到原始许可文本 | Sketchfab 下载包自带 `license.txt`，必须一并提交 |
| 允许再分发 | 静态托管的本质就是把文件发给每位访客 |

**只拿到模型、拿不到许可文件的，先不要接入**——页面上的署名无法替代授权。

## 2. 文件落位

```
public/models/<ref>.glb              # 模型本体
public/models/<ref>-license.txt      # 原作者的许可文本（原文照抄）
```

- `<ref>` 用小写 kebab-case（如 `deep-sea-fish-3dsm4`）。schema 用
  `^[a-z0-9]+(?:-[a-z0-9]+)*$` 校验，写错会在启动时抛错。
-  `.glb` 是唯一推荐格式：单文件、Three.js 可直接加载；`.gltf + .bin + 贴图`
  也可以但要多维护几个文件的相对路径。

## 3. 压缩到手机可用

Sketchfab 原包通常 10–15 MB、上百万面。接入前先压：

```bash
npx @gltf-transform/cli inspect <模型.glb>          # 先看网格/贴图/绘制调用

npx @gltf-transform/cli optimize <模型.glb> public/models/<ref>.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 \
  --simplify-ratio 0.35 --simplify-error 0.001
```

- `--compress meshopt`：Three.js 用 `MeshoptDecoder` 解，不需额外下载 Draco 解码器。
- 目标体积 **≤ 2 MB**；`tests/data/content/creatures.test.ts` 对现有模型锁了这条。

如果场景里混进了与目标生物无关的网格（Sketchfab 常见：示例地面、备用道具），
先用 `@gltf-transform/core` 的 `NodeIO` 按名字摘掉再 optimize。改动必须在
`model.attribution` 的 "Changes:" 一句里写清楚。

## 4. 在图鉴内容里登记

`src/data/content/creatures.json` 中对应物种加 `model` 字段：

```json
"model": {
  "ref": "deep-sea-fish-3dsm4",
  "creditSummary": "Deep Sea Fish #3DSM4 · Carlo Bergonzini · CC BY 4.0",
  "attribution": "This work is based on \"<标题>\" (<模型页 URL>) by <作者> (<作者页 URL>) licensed under CC-BY-4.0 (<许可 URL>). Changes: <改了什么>.",
  "license": "CC BY 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "sourceUrl": "<模型页 URL>",
  "note": "这是<类群>的授权示意模型，不代表<物种>的精确解剖复原。"
}
```

字段由 `assertValidCreatures` 强制校验（见 `src/data/content/schema.ts`）：

- `ref` 必须匹配上面的文件名，挡住 `../` 之类的路径穿越；
- `creditSummary` 非空：用于卡片默认可见的短署名（模型名、作者、许可证）；
- `attribution` / `license` / `note` 非空；
- `sourceUrl` 与 `licenseUrl` 必须是 HTTPS；
- `note` 必须说明模型**不是**精确物种复原——除非真的做了物种级考证，
  否则不要删掉这句免责。

`attribution` 请**原文照抄**许可文件给出的信用句式（CC BY 4.0 要求署名，
且给出的是可逐字复制的模板），只追加 "Changes:" 说明你改了什么。

## 5. 在哪里显示

图鉴卡片与观察舱使用同一套切换逻辑，有模型时默认 3D：

```vue
<!-- 观察舱：有模型时默认 3D，点「看真实照片」切回影像 -->
<CreatureCanvas :creature="creature" allow-model prefer-model />

<!-- 图鉴卡片：同样默认 3D，模型授权收进紧凑的展开说明 -->
<CreatureCanvas :creature="creature" :thumbnail="true" allow-model prefer-model />
```

- `allow-model` 缺省为 `false` → 只显示真实影像。地图、错题本等次要位置
  不要打开它。
- `prefer-model` 决定"先看哪个"：与 `allow-model` 同时为真且该物种有模型时
  默认渲染 3D；点「看真实照片」切回影像，切回后按钮变「看 3D 模型」。没有
  模型、未解锁或 WebGL 不可用时仍以影像/剪影为默认视觉。
- 图鉴卡片与观察舱的 3D 用同一个 `CreatureModelViewer`；卡片用 `thumbnail`
  紧凑署名，完整模型授权与来源收进可展开说明，署名仍随作品出现。
- 渲染组件 `features/bestiary/CreatureModelViewer.vue` 按需懒加载
  （`defineAsyncComponent`），Three.js 只在真正渲染 3D 时才下载。
- 失败即回退：WebGL 不可用、模型加载失败、`webglcontextlost` 都会退回真实
  影像并撤掉切换按钮；模型署名与许可链接只要模型在屏就显示
  （CC BY 要求署名不因降级而消失，看到什么就署什么名）。
- 深海图鉴当前 30 条，其中 **4 个物种**有现成模型；其余先展示真实影像。
  10 个明星物种的 3D 仍在接入中（CC0 优先，缺模型时用原创低模并标注）。
- 恐龙主题有独立的 8 个 CC0 模型，走 `DinoModelViewer.vue`（恐龙知识卡），
  与深海 `CreatureModelViewer` 不共用资产目录。

## 5.1 当前已接入模型

| 物种 | 模型 | 作者 | 许可 | 本地体积 |
|---|---|---|---|---|
| 约翰逊鮟鱇鱼 | Deep Sea Fish #3DSM4 | Carlo Bergonzini | CC BY 4.0 | 1.3 MB |
| 深海大鼬鳚 | Bassozetus Cusk | paumarti | CC BY 4.0 | 189 KB |
| 深海蜥鱼 | LizardfishV3 | aloxr | CC BY 4.0 | 644 KB |
| 宝石鱿鱼 | Squid | Morphin | CC BY 4.0 | 506 KB |

后三个模型均由 `@gltf-transform/cli optimize` 处理：合并网格、几何简化、
贴图压到 1024px WebP、meshopt 压缩；原始 `license.txt` 原文保存在
`public/models/<ref>-license.txt`。

### 5.2 恐龙主题模型

恐龙图鉴使用 `public/models/dino/*.glb` 共 8 个模型（霸王龙、迅猛龙、三角龙、
梁龙、副栉龙、剑龙、阿普吐龙、无齿翼龙），全部来自 Poly Pizza，许可为 **CC0**。
来源与许可原文见 `public/models/dino/LICENSE.txt`；恐龙卡片还配真实博物馆
化石照片，授权见 `public/photos/dino/LICENSE.txt`。模型加载失败或设备不支持
WebGL 时，卡片回退到化石照片。

## 6. 接入后要跑

```bash
npm test -- tests/data/content/creatures.test.ts \
  tests/features/bestiary/CreatureCanvasModel.test.ts \
  tests/features/bestiary/CreatureModelViewer.test.ts
npm run build                                   # 确认 three 单独成块、无体积告警
```

再在真机上确认三件事：模型能转、按钮能缩放、横竖屏都不裁切。
