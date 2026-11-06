# 语文音频（真人录音）

本目录存放语文拼音/识字的真人录音，不使用 TTS 合成音。

## 规格

- 格式：MP3，44.1kHz，单声道，-16 LUFS 左右
- 时长：每条 1–3 秒；单条不超过 5 秒
- 命名：`chinese/<题目 id>.mp3`，与 `src/data/content/chinese/audio-manifest.json` 一致
- 环境：安静房间，无回声、无背景音乐；距麦克风 15–20cm
- 发音：普通话，语速偏慢；拼音先读字母/音节，再读声调或词语

## 录制流程

1. 按 `audio-manifest.json` 的 `text` 逐条录制；
2. 用 Audacity 降噪、剪掉首尾静音、统一响度；
3. 导出 MP3 到本目录 `chinese/`；
4. 把清单里的 `status` 改为 `recorded`，补 `speaker` 与 `recordedAt`；
5. 运行 `npm test -- tests/domain/chinese/audio.test.ts`，确认文件存在。

## 同意与署名

- 如果使用孩子的声音，必须取得监护人书面同意；
- 在 `ATTRIBUTION.txt` 记录录音者（可匿名，如“家长志愿者”）与日期；
- 不录制可识别个人身份的信息（学校、住址、全名）。

## 已接入的 Commons 录音

`cn1-pinyin-002/003/004/005/006`、`cn1-character-001..006` 来自 Wikimedia Commons 的普通话发音（Wei Gao, Vion Nicolas / Yue Tan），已转 MP3、单声道、-16 LUFS。

- 许可：CC BY 2.0 FR / CC BY-SA 3.0 US
- 逐条来源见 `public/audio/ATTRIBUTION.txt`
- `cn1-pinyin-001`（mā）暂无合适单条录音，仍为 `pending`
