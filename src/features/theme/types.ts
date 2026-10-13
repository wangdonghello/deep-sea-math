/**
 * `features/theme/` 的类型与常量。
 *
 * 与 `features/profileSelect/types.ts` 同一分工：只放被组件与测试共同引用的
 * 常量，不放业务逻辑。`MAX_BACKDROP_FISH` 必须住在可 import 的模块里而不是
 * `.vue` 文件 —— `<script setup>` 不允许 `export`，常量一旦写进 SFC，测试
 * 就只能复写一份字面量，两边迟早漂移。
 */

/**
 * 背景鱼群条数上限。
 *
 * 决策来源：RETRO R7 第 1 行（"`FishBackdrop.vue:43` `count` 无上限，传入
 * 10000 会掉帧，影响'孩子用家长旧手机'场景"）。调用方目前只传 5–10，但
 * `count` 是公开 prop，任何一处图省事传个大数都会把整页合成层拖垮。
 *
 * 取值理由：24 条在 360px 宽的低端机上仍能保持每屏 2–3 条同时可见的密度，
 * 再往上只是更密的纯装饰层，观感收益趋近于零而合成成本线性增长。
 */
export const MAX_BACKDROP_FISH = 24
