# 接入深海生物的实拍影像

本文说明如何把一个**许可明确**的真实影像接入图鉴与观察舱。家长已经明确否掉
"原创示意插画"，四个图鉴条目都必须有真实照片。

## 1. 确认许可

| 条件 | 说明 |
|---|---|
| 许可允许商用与再分发 | 儿童产品属商业用途；公有领域、CC0、CC BY、CC BY-SA 可用，**CC BY-NC 不可** |
| 能引用到原始素材页 | 必须给出 Commons / NOAA 等可复核的素材页 URL，以及许可页 URL |
| 照片真的拍到了它 | 属级实拍可以，但必须写明"只鉴定到属" |

**找不到许可页的图一律不接入**——页面上的署名无法替代授权。许可分级按
风险从低到高：公有领域 / CC0 → CC BY → CC BY-SA（衍生作品必须同许可）。

## 2. 文件落位

```
public/photos/<ref>.jpg          # 影像本体（ref 与条目 photo.ref 一致）
public/photos/ATTRIBUTION.txt    # 逐张署名与许可（原文照抄）
docs/photo-assets.md             # 本文件：接入口径与来源清单
```

- `<ref>` 用小写 kebab-case（如 `jewel-squid`）。schema 用
  `^[a-z0-9]+(?:-[a-z0-9]+)*$` 校验，同时挡住 `../` 之类的路径穿越。
- 构图规则按内容定，不强行统一比例（`object-fit: contain` 会处理）：
  - 横向贯穿整幅的（蜥鱼）保留 16:9 `960×540`，裁 3:2 会切掉头部或尾尖；
  - 竖构图的（鱿鱼）就保持竖构图 `721×982`，**不要补边凑成 3:2**——补出来的
    纯黑矩形在深色玻璃卡上是一块看得见的黑框，而原图左右各有一列 1px 亮边，
    补边后还会变成两条竖线。裁掉那两列即可。
- 长边 ≥ 900、短边 ≥ 480（卡片最大约 320×224 CSS px，2 倍屏够用）。
- 单张 **≤ 250 KB**（`tests/features/bestiary/photoArtwork.test.ts` 锁死）。
  四张实拍合计 236 KB，比一个 3D 模型小一个数量级。

重编码用 `Pillow`（尺寸按上面的构图规则定，示例取 3:2）：

```python
from PIL import Image
im = Image.open('原始.jpg').convert('RGB')
im.resize((960, 640), Image.LANCZOS).save(
    'public/photos/<ref>.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
```

## 3. 在图鉴内容里登记

`src/data/content/creatures.json` 每条物种加 `photo` 字段：

```json
"photo": {
  "ref": "jewel-squid",
  "creditSummary": "NOAA 实拍 · CC0 1.0",
  "attribution": "\"<素材标题>\" by <作者> (<素材页 URL>), CC0 1.0 (<许可 URL>). 本站版本仅做裁剪与缩放。",
  "license": "CC0 1.0",
  "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:NOAA_Histioteuthis_sp.jpg",
  "note": "真实影像：NOAA 拍摄的宝石鱿鱼属（Histioteuthis）个体……该影像只鉴定到属，未必就是本页的 Histioteuthis bonnellii。"
}
```

字段由 `assertValidCreatures` 强制校验（见 `src/data/content/schema.ts`）：

- `ref` 非空且是安全的小写资产键；
- `creditSummary` / `attribution` / `license` / `note` 非空，且
  `creditSummary + attribution + license` 里必须真的出现许可口径
  （`CC` 或 `公有领域`）——"图片来自网上"这种署名会被直接拒绝；
- `sourceUrl` 与 `licenseUrl` 必须是 HTTPS；
- `note` 必须写清**影像实际是什么**：活体实拍 / 博物馆藏品 / 模型，以及鉴定到
  属还是种。

`attribution` 请照抄许可方的信用句式，只追加"本站做了什么改动"（裁剪、缩放、
补边、压缩）。

## 4. 在哪里显示

- **图鉴卡片**：`<CreatureCanvas :creature="c" :thumbnail="true" allow-model prefer-model />`
  — 有授权模型的物种默认显示模型 + 紧凑模型署名（`creditSummary` 默认可见，
  完整 `attribution` 与来源、许可链接收进可展开说明）；没有模型时显示影像 +
  紧凑影像署名。
- **观察舱**：`<CreatureCanvas :creature="c" allow-model prefer-model />` —
  有模型时默认显示模型 + 完整模型署名，点「看真实照片」切回影像；没有模型时
  显示影像 + 完整署名。
- 影像加载失败：文字占位（`photo-fallback`），知识卡与任务不受影响。
- 署名必须跟着作品出现：显示 3D 模型时显示模型署名，切回影像时显示影像署名。

## 5. 当前影视素材来源清单

| 物种 | 素材 | 作者 / 来源 | 许可 |
|---|---|---|---|
| 约翰逊鮟鱇鱼 | 伦敦自然历史博物馆馆藏照 | Fernando Losada Rodríguez / Wikimedia Commons | CC BY-SA 4.0（裁剪版同许可） |
| 深海大鼬鳚 | Davidson Seamount 3,288 m 水下实拍 | NOAA / MBARI / Wikimedia Commons | 公有领域（PD-USGov-NOAA） |
| 深海蜥鱼 | NOAA 海床实拍（属级鉴定） | NOAA Photo Library / Wikimedia Commons | 公有领域（PD-NOAA） |
| 宝石鱿鱼 | NOAA 实拍（属级鉴定） | NOAA / Wikimedia Commons | CC0 1.0 |

上表与 `public/photos/ATTRIBUTION.txt` 必须同步更新。

## 6. 接入后要跑

```bash
npm test -- tests/features/bestiary/photoArtwork.test.ts \
  tests/data/content/creatures.test.ts \
  tests/features/bestiary/CreatureCanvas.test.ts
npm run build      # 确认 three 仍单独成块、public/photos 被复制进 dist
```

再在真机上确认：卡片里照片不被裁掉主体、深色背景上看得清、署名链接可点开。
