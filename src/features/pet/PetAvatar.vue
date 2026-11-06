<script lang="ts">
/**
 * 模块级实例序号。
 *
 * `<script setup>` 顶层代码会编译进每个实例的 `setup()`，在那里声明 `let`
 * 每个实例都会从 0 开始；放到普通 `<script>` 才是真正的模块作用域。
 * 它兜住「同一 document 挂多个根实例」时 `useId()` 各自从 v-0 起步的
 * 情况，保证 `defs` 里的渐变/滤镜 id 仍不重复。
 */
let instanceSeq = 0
</script>

<script setup lang="ts">
/**
 * 宠物形象：五个成长阶段共用一套 SVG 骨架，靠比例、配色与装饰区分。
 *
 * 设计约束（Plan Task 7）：
 * - 纯内联 SVG + CSS，不引入图片、字体或动画依赖；
 * - 点击只做一件事：emit `tap`，并给按钮挂 220ms 的 `is-squish` 做挤压回弹；
 * - 心情低于 40 时换成没精神的表情（半闭眼 + 向下嘴角）并浮出小气泡；
 * - 所有动效交给 CSS，`prefers-reduced-motion` 下整体关闭；
 * - 图形一律用 `<defs>` 渐变/滤镜，emoji 不参与主体造型。
 *
 * 可访问性：可访问名称只写一份。`<svg role="img">` 带阶段、心情与
 * 「点我摸摸」的 `aria-label`；按钮本身**不**再挂 `aria-label`，否则读屏
 * 会用它覆盖图像名称、把同一段话念两遍。按钮的名称由内容里的图像名称
 * 组合而来，测试会同时锁住「按钮没有 aria-label」与「名称含阶段/心情」。
 */
import { computed, onBeforeUnmount, ref, useId } from 'vue'

import type { PetStage } from '@/domain/pet/growth'

const props = defineProps<{
  /** 当前成长阶段：蛋 → 幼体 → 少年 → 成体 → 完全体 */
  stage: PetStage
  /** 心情 0–100；低于 40 时显示没精神的表情 */
  mood: number
}>()

const emit = defineEmits<{ (event: 'tap'): void }>()

/** 挤压动画时长，必须与 CSS 的 `pet-squish` 保持一致。 */
const SQUISH_MS = 220
/** 进入「没精神」形态的心情阈值。 */
const LOW_MOOD = 40

const rootEl = ref<HTMLButtonElement | null>(null)
const squish = ref(false)
let squishTimer: number | undefined

/**
 * 重新触发挤压动画。
 *
 * 只把 `squish` 置回 false 再置 true 是不够的：Vue 会把同一个 tick 内的
 * 变更合并，DOM 上的 `is-squish` 根本没被摘掉，CSS 动画自然也不会重播。
 * 所以这里直接操作 classList：先摘类 → 读一次 `offsetWidth` 强制 reflow
 * → 再挂类，浏览器会把这次添加当成一次新动画。响应式状态仍然同步维护，
 * 供模板、测试与卸载清理使用。
 */
function restartSquish(): void {
  const el = rootEl.value
  if (!el) return
  el.classList.remove('is-squish')
  void el.offsetWidth
  el.classList.add('is-squish')
}

/**
 * 点击：重播挤压动画并通知父组件，220ms 后自动摘掉。
 *
 * 重复点击时先清旧定时器再重开，避免第一次的定时器把第二次的挤压动画
 * 提前打断；组件卸载时也要清掉，防止在已卸载实例上改状态。
 */
function tap(): void {
  if (squishTimer !== undefined) {
    window.clearTimeout(squishTimer)
    squishTimer = undefined
  }
  squish.value = false
  restartSquish()
  squish.value = true
  squishTimer = window.setTimeout(() => {
    squish.value = false
    squishTimer = undefined
  }, SQUISH_MS)
  emit('tap')
}

onBeforeUnmount(() => {
  if (squishTimer !== undefined) window.clearTimeout(squishTimer)
  squishTimer = undefined
})

/** 把外部心情收敛到 0–100 的整数；非法值按 0 处理。 */
const mood = computed(() => {
  const raw = Number.isFinite(props.mood) ? props.mood : 0
  return Math.min(100, Math.max(0, Math.round(raw)))
})

/** 是否处于「有点没精神」形态。 */
const lowMood = computed(() => mood.value < LOW_MOOD)

/** 每个阶段的形态说明，用于 `aria-label`。 */
const STAGE_NAMES: Record<PetStage, string> = {
  egg: '海蛋',
  baby: '幼体',
  child: '幼童',
  juvenile: '少年',
  adult: '成体',
  final: '完全体',
}

const moodWord = computed(() => {
  if (lowMood.value) return '有点没精神'
  return mood.value >= 80 ? '很精神' : '还不错'
})

/** 当前阶段的展示名；未知阶段回退到幼体，保证 aria-label 不出现 undefined。 */
const stageName = computed(() => STAGE_NAMES[props.stage] ?? STAGE_NAMES.baby)

/**
 * SVG 的可访问名称，也是按钮名称的唯一来源。
 *
 * 把「点我摸摸」放在这里而不是按钮的 aria-label 上，读屏只会念一次；
 * 文案同时包含阶段与心情，家长/孩子都能听出当前状态。
 */
const artLabel = computed(
  () => `${stageName.value}小海宠，${moodWord.value}（心情 ${mood.value}/100），点我摸摸`,
)

/**
 * 同一页面可能同时挂多个宠物预览（商店/相册/房间），渐变与滤镜 id
 * 必须唯一，否则后挂载的 `<defs>` 会覆盖先挂载的配色。
 *
 * `useId()` 只保证同一个 Vue app 内不重复；再叠一个模块级序号，是为了
 * 覆盖测试或微前端里「同一 document 挂多个根实例」的情况——那些实例
 * 各自的 useId 都会从 v-0 开始。
 */
const idBase = `pet-${useId()}-${instanceSeq++}`

const bodyGradientId = `${idBase}-body`
const bellyGradientId = `${idBase}-belly`
const finGradientId = `${idBase}-fin`
const auraGradientId = `${idBase}-aura`
const glowFilterId = `${idBase}-glow`

interface Palette {
  /** 背部渐变起点（受光面） */
  bodyTop: string
  /** 背部渐变终点（背光面） */
  bodyBottom: string
  /** 腹部高光中心 */
  bellyTop: string
  /** 腹部高光边缘 */
  bellyBottom: string
  /** 鳍的主色 */
  fin: string
  /** 鳍的高光色 */
  finLight: string
  /** 成体/完全体的点缀色 */
  accent: string
  /** 环境光晕 */
  glow: string
  /** 眼睛与嘴的墨色 */
  ink: string
}

/**
 * 五套配色。
 *
 * - egg：冰蓝蛋壳；
 * - baby：高饱和天蓝，腮红明显；
 * - juvenile：青绿，和幼体拉开色相；
 * - adult：深蓝身体 + 暖橙鳍/腹，第二套配色；
 * - final：蓝紫 + 金色，配合光晕与星星。
 */
const PALETTES: Record<PetStage, Palette> = {
  egg: {
    bodyTop: '#f7feff',
    bodyBottom: '#a6cfe5',
    bellyTop: '#ffffff',
    bellyBottom: '#dff3ff',
    fin: '#cfe9f7',
    finLight: '#ffffff',
    accent: '#ffd6e2',
    glow: '#bfe9ff',
    ink: '#3f7894',
  },
  baby: {
    bodyTop: '#a9efff',
    bodyBottom: '#2f88d6',
    bellyTop: '#f8feff',
    bellyBottom: '#c9ecff',
    fin: '#6fd0f5',
    finLight: '#b9f0ff',
    accent: '#ffd166',
    glow: '#7fe3ff',
    ink: '#06233c',
  },
  child: {
    bodyTop: '#2d4f73',
    bodyBottom: '#061522',
    bellyTop: '#ffffff',
    bellyBottom: '#cfe8f7',
    fin: '#17324c',
    finLight: '#8fd8f5',
    accent: '#ffd479',
    glow: '#5bd7ff',
    ink: '#020b14',
  },
  juvenile: {
    bodyTop: '#9df5dc',
    bodyBottom: '#1c8f88',
    bellyTop: '#f4fffb',
    bellyBottom: '#c8f6e9',
    fin: '#54d6bb',
    finLight: '#9bf3dd',
    accent: '#ffdf8a',
    glow: '#74ffe3',
    ink: '#052f2c',
  },
  adult: {
    bodyTop: '#7ea8ff',
    bodyBottom: '#1b2f6e',
    bellyTop: '#fff0d8',
    bellyBottom: '#ffb066',
    fin: '#ff9d4d',
    finLight: '#ffc37a',
    accent: '#ffb347',
    glow: '#ffb066',
    ink: '#04122c',
  },
  final: {
    bodyTop: '#d8fbff',
    bodyBottom: '#5c4dff',
    bellyTop: '#fff6d8',
    bellyBottom: '#ffdc8a',
    fin: '#ffd479',
    finLight: '#fff0bd',
    accent: '#ffd479',
    glow: '#9fe8ff',
    ink: '#0b0a33',
  },
}

const palette = computed(() => PALETTES[props.stage] ?? PALETTES.baby)

interface StageGeometry {
  bodyCx: number
  bodyCy: number
  bodyRx: number
  bodyRy: number
  /** 幼体独有的「大头」；其余阶段头身合一 */
  head?: { cx: number; cy: number; rx: number; ry: number }
  eyeCy: number
  eyeDx: number
  eyeR: number
  mouthCy: number
  mouthW: number
  blushCy: number
  /** 鳍相对身体的缩放，避免少年/成体的鳍被拉得比例失调 */
  finScale: number
}

/**
 * 各阶段的骨架尺寸（viewBox 320×300）。
 *
 * 蛋的数值只占位：模板走 egg 分支，不读这些字段。保持完整 Record
 * 是为了让 `geometry` 不必写成可能为 undefined 的联合类型。
 */
const GEOMETRY: Record<PetStage, StageGeometry> = {
  egg: {
    bodyCx: 160,
    bodyCy: 150,
    bodyRx: 70,
    bodyRy: 90,
    eyeCy: 150,
    eyeDx: 22,
    eyeR: 5,
    mouthCy: 150,
    mouthW: 6,
    blushCy: 150,
    finScale: 0.8,
  },
  baby: {
    bodyCx: 160,
    bodyCy: 206,
    bodyRx: 46,
    bodyRy: 36,
    head: { cx: 160, cy: 136, rx: 64, ry: 58 },
    eyeCy: 136,
    eyeDx: 23,
    eyeR: 13,
    mouthCy: 158,
    mouthW: 9,
    blushCy: 160,
    finScale: 0.82,
  },
  child: {
    bodyCx: 160,
    bodyCy: 208,
    bodyRx: 46,
    bodyRy: 34,
    head: { cx: 160, cy: 138, rx: 62, ry: 56 },
    eyeCy: 138,
    eyeDx: 22,
    eyeR: 11,
    mouthCy: 160,
    mouthW: 9,
    blushCy: 162,
    finScale: 0.84,
  },
  juvenile: {
    bodyCx: 160,
    bodyCy: 178,
    bodyRx: 54,
    bodyRy: 74,
    eyeCy: 136,
    eyeDx: 20,
    eyeR: 11,
    mouthCy: 160,
    mouthW: 10,
    blushCy: 178,
    finScale: 1,
  },
  adult: {
    bodyCx: 160,
    bodyCy: 176,
    bodyRx: 66,
    bodyRy: 82,
    eyeCy: 140,
    eyeDx: 24,
    eyeR: 12,
    mouthCy: 166,
    mouthW: 11,
    blushCy: 186,
    finScale: 1.12,
  },
  final: {
    bodyCx: 160,
    bodyCy: 174,
    bodyRx: 70,
    bodyRy: 84,
    eyeCy: 138,
    eyeDx: 25,
    eyeR: 12.5,
    mouthCy: 164,
    mouthW: 11,
    blushCy: 184,
    finScale: 1.18,
  },
}

const geometry = computed(() => GEOMETRY[props.stage] ?? GEOMETRY.baby)
const head = computed(() => geometry.value.head)

/**
 * 按阶段的骨架推导所有路径。
 *
 * 路径集中在这里而不是散进模板：模板只负责摆放，形状随阶段变化的部分
 * 保持在可读的数学式里，改一个比例不会漏掉另一处硬编码坐标。
 */
const art = computed(() => {
  const g = geometry.value
  const s = g.finScale
  const top = g.head ? g.head.cy - g.head.ry : g.bodyCy - g.bodyRy

  // 尾鳍根部稍微压进身体，避免出现一条断缝。
  const tailX = g.bodyCx + g.bodyRx - 8
  const tailY = g.bodyCy + g.bodyRy * 0.18
  // 侧鳍放在身体右下侧，别被腹部高光整个盖住。
  const finX = g.bodyCx + g.bodyRx * 0.58
  const finY = g.bodyCy + g.bodyRy * 0.3

  return {
    /*
     * 尾鳍：上、下两片叶尖在右侧分开，中间收一个凹口。
     * 基础版是一个圆瓣，远看像挂在身侧的球；分叉后才有「鱼尾」的辨识度。
     */
    tail: [
      `M${tailX} ${tailY - 10 * s}`,
      `Q${tailX + 24 * s} ${tailY - 34 * s} ${tailX + 46 * s} ${tailY - 26 * s}`,
      `Q${tailX + 32 * s} ${tailY - 10 * s} ${tailX + 27 * s} ${tailY}`,
      `Q${tailX + 36 * s} ${tailY + 14 * s} ${tailX + 41 * s} ${tailY + 28 * s}`,
      `Q${tailX + 14 * s} ${tailY + 26 * s} ${tailX} ${tailY + 12 * s}`,
      'Z',
    ].join(' '),
    // 尾鳍里的两缕鳍条：只做低透明度高光，让大片色块不显得闷。
    tailRayA: `M${tailX} ${tailY} Q${tailX + 20 * s} ${tailY - 16 * s} ${tailX + 38 * s} ${tailY - 22 * s}`,
    tailRayB: `M${tailX + 2 * s} ${tailY + 3 * s} Q${tailX + 20 * s} ${tailY + 13 * s} ${tailX + 34 * s} ${tailY + 22 * s}`,
    dorsal: [
      `M${g.bodyCx - 26 * s} ${top + 14 * s}`,
      `C${g.bodyCx - 14 * s} ${top - 20 * s} ${g.bodyCx + 18 * s} ${top - 26 * s} ${g.bodyCx + 30 * s} ${top - 4 * s}`,
      `C${g.bodyCx + 12 * s} ${top + 10 * s} ${g.bodyCx - 6 * s} ${top + 16 * s} ${g.bodyCx - 26 * s} ${top + 14 * s}`,
      'Z',
    ].join(' '),
    sideFin: [
      `M${finX} ${finY}`,
      `Q${finX + 26 * s} ${finY + 4 * s} ${finX + 16 * s} ${finY + 26 * s}`,
      `Q${finX + 6 * s} ${finY + 22 * s} ${finX - 2 * s} ${finY + 10 * s}`,
      'Z',
    ].join(' '),
  }
})

/** 少年期背部的浅色斑点。 */
const spots = computed(() => {
  if (props.stage !== 'juvenile') return []
  const g = geometry.value
  return [
    { x: g.bodyCx - g.bodyRx * 0.42, y: g.bodyCy + g.bodyRy * 0.04, r: 6.5 },
    { x: g.bodyCx + g.bodyRx * 0.24, y: g.bodyCy + g.bodyRy * 0.2, r: 5 },
    { x: g.bodyCx - g.bodyRx * 0.1, y: g.bodyCy + g.bodyRy * 0.42, r: 6 },
    { x: g.bodyCx + g.bodyRx * 0.46, y: g.bodyCy - g.bodyRy * 0.06, r: 4 },
  ]
})

const eyeXs = computed(() => {
  const g = geometry.value
  return [g.bodyCx - g.eyeDx, g.bodyCx + g.eyeDx]
})

/**
 * 没精神时的「半闭眼」：一个向下的半圆透镜 + 一条水平上眼睑。
 *
 * 只画下半只眼，视觉上就是眼皮压下来；再补一条眼睑线，避免低分辨率下
 * 变成一条模糊的黑色月牙。
 */
function sleepyLens(x: number, cy: number, r: number): string {
  return `M${x - r} ${cy} Q${x} ${cy + r * 1.2} ${x + r} ${cy} Z`
}

/** 心情好是上扬的嘴角，心情差把弧度翻到下面。 */
const mouthPath = computed(() => {
  const g = geometry.value
  return lowMood.value
    ? `M${g.bodyCx - g.mouthW} ${g.mouthCy + 5} Q${g.bodyCx} ${g.mouthCy - 5} ${g.bodyCx + g.mouthW} ${g.mouthCy + 5}`
    : `M${g.bodyCx - g.mouthW} ${g.mouthCy} Q${g.bodyCx} ${g.mouthCy + 9} ${g.bodyCx + g.mouthW} ${g.mouthCy}`
})

/**
 * 眨眼节奏：6s 一轮，每个阶段错开一个相位。
 *
 * 完全用 CSS `animation-delay`（模板里写成 `animationDelay`）而不是 JS
 * 定时器，既省一次重渲染，也天然随 `prefers-reduced-motion` 一起停掉。
 */
const BLINK_DELAYS: Record<PetStage, string> = {
  egg: '0s',
  baby: '0.8s',
  child: '1.4s',
  juvenile: '2.1s',
  adult: '3.4s',
  final: '4.6s',
}

const blinkDelay = computed(() => BLINK_DELAYS[props.stage] ?? BLINK_DELAYS.baby)

interface Bubble {
  cx: number
  cy: number
  r: number
  delay: string
  duration: string
}

/** 环境气泡：位置固定，只让 CSS 做上浮与淡出，测试里不会随机。 */
const BUBBLES: readonly Bubble[] = [
  { cx: 250, cy: 152, r: 8, delay: '0s', duration: '6.4s' },
  { cx: 268, cy: 116, r: 4.5, delay: '1.7s', duration: '7.4s' },
  { cx: 236, cy: 196, r: 3.5, delay: '3.1s', duration: '5.6s' },
]

interface Star {
  x: number
  y: number
  scale: number
  opacity: number
  delay: string
}

/** 完全体的四角星，围绕身体散开。 */
const STARS: readonly Star[] = [
  { x: 62, y: 74, scale: 1.1, opacity: 0.95, delay: '0s' },
  { x: 250, y: 62, scale: 0.8, opacity: 0.8, delay: '1.4s' },
  { x: 268, y: 212, scale: 0.95, opacity: 0.7, delay: '2.2s' },
  { x: 48, y: 206, scale: 0.7, opacity: 0.75, delay: '3.1s' },
  { x: 104, y: 46, scale: 0.55, opacity: 0.6, delay: '0.8s' },
]

/** 四角星路径：用两次曲线收腰，比多边形更接近「闪光」。 */
const STAR_PATH =
  'M0 -10 C1.2 -3.4 3.4 -1.2 10 0 C3.4 1.2 1.2 3.4 0 10 C-1.2 3.4 -3.4 1.2 -10 0 C-3.4 -1.2 -1.2 -3.4 0 -10 Z'
</script>

<template>
  <button
    type="button"
    class="pet-avatar"
    :class="[`pet-avatar--${stage}`, { 'is-squish': squish, 'is-low': lowMood }]"
    ref="rootEl"
    data-testid="pet-tap"
    @click="tap"
  >
    <svg
      class="pet-avatar__art"
      viewBox="0 0 320 300"
      role="img"
      :data-stage="stage"
      :aria-label="artLabel"
    >
      <defs>
        <linearGradient :id="bodyGradientId" x1="0.16" y1="0" x2="0.84" y2="1">
          <stop offset="0%" :stop-color="palette.bodyTop" />
          <stop offset="58%" :stop-color="palette.bodyBottom" />
          <stop offset="100%" :stop-color="palette.bodyBottom" />
        </linearGradient>
        <radialGradient :id="bellyGradientId" cx="50%" cy="32%" r="72%">
          <stop offset="0%" :stop-color="palette.bellyTop" />
          <stop offset="72%" :stop-color="palette.bellyBottom" stop-opacity="0.55" />
          <stop offset="100%" :stop-color="palette.bellyBottom" stop-opacity="0" />
        </radialGradient>
        <linearGradient :id="finGradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" :stop-color="palette.finLight" />
          <stop offset="100%" :stop-color="palette.fin" />
        </linearGradient>
        <radialGradient :id="auraGradientId" cx="50%" cy="50%" r="50%">
          <stop offset="0%" :stop-color="palette.glow" stop-opacity="0.55" />
          <stop offset="68%" :stop-color="palette.glow" stop-opacity="0.12" />
          <stop offset="100%" :stop-color="palette.glow" stop-opacity="0" />
        </radialGradient>
        <filter :id="glowFilterId" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- 环境光晕与落地阴影：深色背景上先给宠物一圈亮边，保证对比 -->
      <ellipse
        class="pet-avatar__aura"
        cx="160"
        cy="176"
        rx="130"
        ry="126"
        :fill="`url(#${auraGradientId})`"
        :opacity="stage === 'final' ? 0.95 : 0.55"
      />
      <ellipse
        class="pet-avatar__shadow"
        cx="160"
        cy="272"
        rx="88"
        ry="13"
        fill="#04101f"
        opacity="0.55"
      />

      <!-- 完全体：光环画在身体后面，虚线环缓慢自转 -->
      <g v-if="stage === 'final'" class="pet-avatar__halo" aria-hidden="true">
        <circle
          cx="160"
          cy="174"
          r="104"
          fill="none"
          :stroke="palette.accent"
          stroke-width="2"
          opacity="0.45"
          :filter="`url(#${glowFilterId})`"
        />
        <circle
          class="pet-avatar__halo-ring"
          cx="160"
          cy="174"
          r="96"
          fill="none"
          :stroke="palette.glow"
          stroke-width="1.4"
          stroke-dasharray="3 13"
          opacity="0.7"
        />
      </g>

      <!-- 蛋：蛋形 + 裂纹 + 轻微摇晃，只露一张闭着眼的小脸 -->
      <g v-if="stage === 'egg'" class="pet-avatar__egg">
        <ellipse
          cx="160"
          cy="150"
          rx="70"
          ry="90"
          :fill="`url(#${bodyGradientId})`"
          stroke="#ffffff"
          stroke-opacity="0.5"
          stroke-width="1.6"
        />
        <ellipse
          cx="136"
          cy="118"
          rx="21"
          ry="30"
          fill="#ffffff"
          opacity="0.32"
          transform="rotate(-18 136 118)"
        />
        <ellipse cx="160" cy="206" rx="50" ry="20" fill="#cfe9f7" opacity="0.45" />

        <g fill="#7fb3cd" opacity="0.5">
          <circle cx="130" cy="122" r="4" />
          <circle cx="196" cy="126" r="3" />
          <circle cx="202" cy="168" r="5" />
          <circle cx="126" cy="186" r="3.5" />
          <circle cx="168" cy="210" r="4" />
        </g>

        <path
          d="M134 96 l14 16 -10 12 16 10 -8 14"
          fill="none"
          stroke="#5e97b3"
          stroke-opacity="0.65"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M196 140 l-10 12 8 10"
          fill="none"
          stroke="#5e97b3"
          stroke-opacity="0.45"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <g class="pet-avatar__egg-face">
          <template v-if="lowMood">
            <path
              d="M138 158 h16 M166 158 h16"
              fill="none"
              stroke="#3f7894"
              stroke-width="2.6"
              stroke-linecap="round"
            />
            <path
              d="M154 180 q6 -6 12 0"
              fill="none"
              stroke="#3f7894"
              stroke-width="2.6"
              stroke-linecap="round"
            />
          </template>
          <template v-else>
            <path
              d="M138 156 q8 -8 16 0 M166 156 q8 -8 16 0"
              fill="none"
              stroke="#3f7894"
              stroke-width="2.6"
              stroke-linecap="round"
            />
            <path
              d="M154 178 q6 6 12 0"
              fill="none"
              stroke="#3f7894"
              stroke-width="2.6"
              stroke-linecap="round"
            />
          </template>
          <ellipse cx="128" cy="174" rx="9" ry="5" fill="#ffb3c7" opacity="0.45" />
          <ellipse cx="192" cy="174" rx="9" ry="5" fill="#ffb3c7" opacity="0.45" />
        </g>
      </g>

      <!-- 鱼形阶段：幼体大头短身、少年拉长带斑点、成体更大配暖橙、完全体发光 -->
      <g v-else class="pet-avatar__creature">
        <path
          class="pet-avatar__tail"
          :d="art.tail"
          :fill="`url(#${finGradientId})`"
          opacity="0.95"
        />
        <path
          :d="art.tailRayA"
          :stroke="palette.finLight"
          stroke-width="1.6"
          stroke-linecap="round"
          fill="none"
          opacity="0.45"
        />
        <path
          :d="art.tailRayB"
          :stroke="palette.finLight"
          stroke-width="1.6"
          stroke-linecap="round"
          fill="none"
          opacity="0.35"
        />
        <path
          class="pet-avatar__dorsal"
          :d="art.dorsal"
          :fill="`url(#${finGradientId})`"
          opacity="0.92"
        />

        <ellipse
          :cx="geometry.bodyCx"
          :cy="geometry.bodyCy"
          :rx="geometry.bodyRx"
          :ry="geometry.bodyRy"
          :fill="`url(#${bodyGradientId})`"
          stroke="#ffffff"
          stroke-opacity="0.28"
          stroke-width="1.6"
          :filter="stage === 'final' ? `url(#${glowFilterId})` : undefined"
        />

        <ellipse
          v-if="head"
          :cx="head.cx"
          :cy="head.cy"
          :rx="head.rx"
          :ry="head.ry"
          :fill="`url(#${bodyGradientId})`"
          stroke="#ffffff"
          stroke-opacity="0.28"
          stroke-width="1.6"
        />

        <!-- 腹部高光 -->
        <ellipse
          :cx="geometry.bodyCx"
          :cy="geometry.bodyCy + geometry.bodyRy * 0.26"
          :rx="geometry.bodyRx * 0.58"
          :ry="geometry.bodyRy * 0.42"
          :fill="`url(#${bellyGradientId})`"
          opacity="0.82"
        />

        <path
          class="pet-avatar__side-fin"
          :d="art.sideFin"
          :fill="`url(#${finGradientId})`"
          opacity="0.85"
        />

        <g v-if="stage === 'juvenile'" class="pet-avatar__spots">
          <circle
            v-for="(spot, index) in spots"
            :key="index"
            :cx="spot.x"
            :cy="spot.y"
            :r="spot.r"
            fill="#eafff9"
            opacity="0.5"
          />
        </g>



        <g v-if="stage === 'child'" class="pet-avatar__child-patches" aria-hidden="true">
          <ellipse v-for="(x, index) in eyeXs" :key="index" :cx="x" :cy="geometry.eyeCy - 2" :rx="geometry.eyeR + 7" :ry="geometry.eyeR + 5" fill="#f7feff" opacity="0.95" />
        </g>

        <g v-if="stage === 'child' && !lowMood" class="pet-avatar__child-brows" aria-hidden="true">
          <path v-for="(x, index) in eyeXs" :key="index"
            :d="`M${x - 10} ${geometry.eyeCy - 20} L${x + 8} ${geometry.eyeCy - 24}`"
            stroke="#ffd479" stroke-width="3" stroke-linecap="round" />
        </g>

        <g class="pet-avatar__face">
          <g
            v-for="(x, index) in eyeXs"
            :key="index"
            class="pet-avatar__eye"
            :style="{ animationDelay: blinkDelay }"
          >
            <template v-if="lowMood">
              <path :d="sleepyLens(x, geometry.eyeCy, geometry.eyeR)" :fill="palette.ink" />
              <path
                :d="`M${x - geometry.eyeR} ${geometry.eyeCy} H${x + geometry.eyeR}`"
                :stroke="palette.ink"
                stroke-width="2.4"
                stroke-linecap="round"
              />
            </template>
            <template v-else>
              <ellipse
                :cx="x"
                :cy="geometry.eyeCy"
                :rx="geometry.eyeR"
                :ry="geometry.eyeR * 1.08"
                :fill="palette.ink"
              />
              <circle
                :cx="x - geometry.eyeR * 0.32"
                :cy="geometry.eyeCy - geometry.eyeR * 0.34"
                :r="geometry.eyeR * 0.36"
                fill="#ffffff"
              />
              <circle
                :cx="x + geometry.eyeR * 0.3"
                :cy="geometry.eyeCy + geometry.eyeR * 0.34"
                :r="geometry.eyeR * 0.14"
                fill="#ffffff"
                opacity="0.65"
              />
            </template>
          </g>

          <ellipse
            :cx="geometry.bodyCx - geometry.eyeDx - 14"
            :cy="geometry.blushCy"
            rx="11"
            ry="6.5"
            fill="#ff9fb8"
            :opacity="lowMood ? 0.18 : 0.5"
          />
          <ellipse
            :cx="geometry.bodyCx + geometry.eyeDx + 14"
            :cy="geometry.blushCy"
            rx="11"
            ry="6.5"
            fill="#ff9fb8"
            :opacity="lowMood ? 0.18 : 0.5"
          />

          <path
            :d="mouthPath"
            fill="none"
            :stroke="palette.ink"
            stroke-width="3.4"
            stroke-linecap="round"
          />
        </g>
      </g>

      <!-- 完全体：星星点缀 -->
      <g v-if="stage === 'final'" class="pet-avatar__stars" aria-hidden="true">
        <g
          v-for="(star, index) in STARS"
          :key="index"
          :transform="`translate(${star.x} ${star.y}) scale(${star.scale})`"
        >
          <path
            class="pet-avatar__star"
            :d="STAR_PATH"
            :fill="palette.accent"
            :opacity="star.opacity"
            :style="{ animationDelay: star.delay }"
          />
        </g>
      </g>

      <!-- 气泡粒子：上升 + 淡出 -->
      <g class="pet-avatar__bubbles" aria-hidden="true">
        <g
          v-for="(bubble, index) in BUBBLES"
          :key="index"
          class="pet-avatar__bubble"
          :style="{ animationDelay: bubble.delay, animationDuration: bubble.duration }"
        >
          <circle
            :cx="bubble.cx"
            :cy="bubble.cy"
            :r="bubble.r"
            fill="#d8f7ff"
            fill-opacity="0.16"
            stroke="#ffffff"
            stroke-opacity="0.55"
            stroke-width="1"
          />
          <circle
            :cx="bubble.cx - bubble.r * 0.34"
            :cy="bubble.cy - bubble.r * 0.34"
            :r="Math.max(1, bubble.r * 0.22)"
            fill="#ffffff"
            opacity="0.7"
          />
        </g>
      </g>

      <!-- 没精神时浮出的小气泡 -->
      <g v-if="lowMood" class="pet-avatar__sigh" aria-hidden="true">
        <circle
          cx="242"
          cy="88"
          r="10"
          fill="#d8f7ff"
          fill-opacity="0.18"
          stroke="#d8f7ff"
          stroke-opacity="0.5"
        />
        <circle
          cx="225"
          cy="106"
          r="5"
          fill="#d8f7ff"
          fill-opacity="0.16"
          stroke="#d8f7ff"
          stroke-opacity="0.4"
        />
        <circle
          cx="214"
          cy="118"
          r="3"
          fill="#d8f7ff"
          fill-opacity="0.14"
          stroke="#d8f7ff"
          stroke-opacity="0.35"
        />
      </g>
    </svg>
  </button>
</template>

<style scoped>
.pet-avatar {
  display: block;
  width: min(78vw, 22rem);
  margin: 0 auto;
  padding: 0;
  border: 0;
  border-radius: 1.75rem;
  background: none;
  color: inherit;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transform-origin: 50% 88%;
  animation: pet-breathe 3s ease-in-out infinite;
}

.pet-avatar__art {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.pet-avatar:focus-visible {
  outline: 3px solid #9fe8ff;
  outline-offset: 6px;
}

/* 点击挤压：比待机呼吸优先级高，220ms 后类名摘掉、呼吸自动接回来 */
.pet-avatar.is-squish {
  animation: pet-squish 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pet-avatar.is-low {
  filter: saturate(0.86);
}

.pet-avatar__aura {
  transform-box: fill-box;
  transform-origin: center;
  animation: pet-aura 4.8s ease-in-out infinite;
}

/* 蛋壳以底部为支点轻摇，幅度很小，避免看起来像在浮空 */
.pet-avatar__egg {
  transform-box: fill-box;
  transform-origin: 50% 92%;
  animation: pet-wobble 3.6s ease-in-out infinite;
}

/* 尾鳍/侧鳍的摆动锚点放在与身体连接的一侧 */
.pet-avatar__tail {
  transform-box: fill-box;
  transform-origin: 8% 60%;
  animation: pet-sway 2.8s ease-in-out infinite alternate;
}

.pet-avatar__side-fin {
  transform-box: fill-box;
  transform-origin: 12% 18%;
  animation: pet-sway 3.2s ease-in-out infinite alternate-reverse;
}

/* 眨眼：每 6s 眨一次，animation-delay 由阶段错开（见 script） */
.pet-avatar__eye {
  transform-box: fill-box;
  transform-origin: center;
  animation: pet-blink 6s ease-in-out infinite;
}

.pet-avatar__halo-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: pet-halo 24s linear infinite;
}

.pet-avatar__star {
  transform-box: fill-box;
  transform-origin: center;
  animation: pet-twinkle 3.8s ease-in-out infinite;
}

.pet-avatar__bubble {
  transform-box: fill-box;
  transform-origin: center;
  animation: pet-bubble 6s ease-in infinite;
}

.pet-avatar__sigh {
  transform-box: fill-box;
  transform-origin: center;
  animation: pet-sigh 4.2s ease-in-out infinite;
}

@keyframes pet-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.025, 0.978);
  }
}

@keyframes pet-squish {
  0% {
    transform: scale(1);
  }
  38% {
    transform: scale(1.09, 0.87) translateY(3px);
  }
  72% {
    transform: scale(0.96, 1.04) translateY(-1px);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes pet-blink {
  0%,
  90%,
  100% {
    transform: scaleY(1);
  }
  93%,
  95.5% {
    transform: scaleY(0.08);
  }
}

@keyframes pet-wobble {
  0%,
  100% {
    transform: rotate(-1.8deg);
  }
  50% {
    transform: rotate(1.8deg);
  }
}

@keyframes pet-sway {
  from {
    transform: rotate(-4deg);
  }
  to {
    transform: rotate(5deg);
  }
}

@keyframes pet-aura {
  0%,
  100% {
    transform: scale(0.97);
  }
  50% {
    transform: scale(1.03);
  }
}

@keyframes pet-halo {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pet-twinkle {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.82);
  }
  50% {
    opacity: 1;
    transform: scale(1.12);
  }
}

@keyframes pet-bubble {
  0% {
    transform: translateY(6px);
    opacity: 0;
  }
  12% {
    opacity: 0.55;
  }
  80% {
    opacity: 0.35;
  }
  100% {
    transform: translateY(-54px);
    opacity: 0;
  }
}

@keyframes pet-sigh {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.55;
  }
  50% {
    transform: translateY(-6px);
    opacity: 0.85;
  }
}

/*
 * 减弱动效：呼吸、摇摆、眨眼、星星、气泡全部停掉。
 * 用 `!important` 是为了压过 `.is-squish` 等更高特异性的动画类——用户
 * 明确要求静止时，连点击反馈也不应再动。
 */
@media (prefers-reduced-motion: reduce) {
  .pet-avatar,
  .pet-avatar * {
    animation: none !important;
  }
}
</style>
