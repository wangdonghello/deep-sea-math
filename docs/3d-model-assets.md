# 接入新的深海鱼 3D 模型

本文说明如何把一个**授权许可明确**的第三方 3D 模型接入观察舱。引入新模型前
必须先取得许可文件；拿不到许可的模型不要放进 `public/`。

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
  "attribution": "This work is based on \"<标题>\" (<模型页 URL>) by <作者> (<作者页 URL>) licensed under CC-BY-4.0 (<许可 URL>). Changes: <改了什么>.",
  "license": "CC BY 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "sourceUrl": "<模型页 URL>",
  "note": "这是<类群>的授权示意模型，不代表<物种>的精确解剖复原。"
}
```

字段由 `assertValidCreatures` 强制校验（见 `src/data/content/schema.ts`）：

- `ref` 必须匹配上面的文件名，挡住 `../` 之类的路径穿越；
- `attribution` / `license` / `note` 非空；
- `sourceUrl` 与 `licenseUrl` 必须是 HTTPS；
- `note` 必须说明模型**不是**精确物种复原——除非真的做了物种级考证，
  否则不要删掉这句免责。

`attribution` 请**原文照抄**许可文件给出的信用句式（CC BY 4.0 要求署名，
且给出的是可逐字复制的模板），只追加 "Changes:" 说明你改了什么。

## 5. 在哪里显示

只有观察舱显示 3D：

```vue
<CreatureCanvas :creature="creature" :prefer-model="true" />
```

- `prefer-model` 缺省为 `false` → 图鉴卡片继续用轻量 2D 插画。不要给列表页
  打开它：一个 1–2 MB 的模型乘以 N 个物种会直接把首屏拖死。
- 渲染组件 `features/bestiary/CreatureModelViewer.vue` 按需懒加载
  （`defineAsyncComponent`），Three.js 只在真正打开观察舱时才下载。
- 失败即回退：WebGL 不可用、模型加载失败、`webglcontextlost` 都会退回原创
  插画，`modelAttribution` 的署名与许可链接仍然显示（CC BY 要求不因降级而消失）。

## 6. 接入后要跑

```bash
npm test -- tests/data/content/creatures.test.ts \
  tests/features/bestiary/CreatureCanvasModel.test.ts \
  tests/features/bestiary/CreatureModelViewer.test.ts
npm run build                                   # 确认 three 单独成块、无体积告警
```

再在真机上确认三件事：模型能转、按钮能缩放、横竖屏都不裁切。
