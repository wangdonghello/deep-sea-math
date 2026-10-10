<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

/**
 * 单条背景鱼的布局参数。
 *
 * 由索引经确定性伪随机推导（不用 `Math.random`）：同一 props 下每次渲染
 * 得到完全相同的鱼群，组件测试才能稳定断言条数、尺寸与动画类名。
 */
interface FishSpec {
  /** 列表 key */
  id: string
  /** 垂直位置，占容器高度百分比 */
  top: string
  /** 水平位置，`vw` 单位 */
  left: string
  /** 单条鱼宽度（px 字符串），已含围绕 `size` prop 的缩放 */
  width: string
  /** 透明度：低透明度剪影，避免干扰读题 */
  opacity: string
  /** 一次完整漂移的时长，`s` 单位 */
  duration: string
  /** 动画相位偏移，负值让鱼在挂载瞬间就处于航线中段 */
  delay: string
  /** 巡航方向，映射为 CSS `animation-direction` */
  direction: 'normal' | 'reverse'
  /** 发光色板切换 */
  glow: 'primary' | 'secondary'
}

const props = withDefaults(
  defineProps<{
    /**
     * 鱼群条数。默认 5：既保证"背景有鱼"，又不至于在低端机上吃掉合成层。
     */
    count?: number
    /**
     * 单条鱼的基准宽度（px）。每条鱼在此基础上缩放 ±25%，
     * 形成近大远小的景深，而不是一排等大的贴图。
     */
    size?: number
  }>(),
  { count: 5, size: 72 },
)

/** 系统偏好查询：是否要求减弱动效。 */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 读取系统「减弱动效」偏好查询对象。
 *
 * 集中处理三种不可用情况：① `window` 不存在（SSR / Node 环境）；
 * ② `window.matchMedia` 不是函数（未注入该 API 的测试环境、老浏览器）；
 * ③ 调用即抛错。三者都返回 `null`，由调用方按「允许动画」处理——兜底逻辑
 * 散落在 setup 与 `onMounted` 两处时，抛错那条路径最容易漏。
 *
 * @returns `MediaQueryList`，或当前环境不可用时返回 `null`
 */
function readMotionQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY)
  } catch {
    return null
  }
}

/**
 * 读取当前是否要求减弱动效。
 *
 * 在 **setup 阶段同步**执行，而不是等 `onMounted`：若留到挂载后再改状态，
 * 首帧会先按「允许动画」渲染一帧，减弱动效的用户仍会看到一次闪动，
 * 且组件测试里 DOM 的更新也要等一个 microtask 才可见。
 *
 * @returns 系统要求减弱动效时为 `true`；查询不可用时返回 `false`
 */
function prefersReducedMotionNow(): boolean {
  return readMotionQuery()?.matches === true
}

/**
 * 用户是否要求减弱动效。
 *
 * 与 `@media (prefers-reduced-motion: reduce)` 成对出现：媒体查询兜住
 * 「CSS 里的动画」，这里的 `data-motion` 则让测试与调用方
 * （Task 17 的 `App.test.ts`）能断言"当前处于静止态"。
 */
const prefersReducedMotion = ref(prefersReducedMotionNow())
let motionQuery: MediaQueryList | null = null

/** 把查询结果同步进 ref；查询对象未就绪时什么都不做。 */
function syncMotion(): void {
  if (motionQuery) prefersReducedMotion.value = motionQuery.matches === true
}

onMounted(() => {
  motionQuery = readMotionQuery()
  syncMotion()
  if (motionQuery && typeof motionQuery.addEventListener === 'function') {
    motionQuery.addEventListener('change', syncMotion)
  }
})

onUnmounted(() => {
  if (motionQuery && typeof motionQuery.removeEventListener === 'function') {
    motionQuery.removeEventListener('change', syncMotion)
  }
  motionQuery = null
})

/**
 * 把索引映射到 [0, 1) 的确定性伪随机数。
 *
 * 用整数运算而非 `Math.random`：组件测试需要"同一 props → 同一鱼群"，
 * 否则每次挂载的鱼位置都在变，断言只能退化成"至少有 1 条"，景深（位置、
 * 尺寸、时长互不相同）也就无从验证。
 *
 * @param index 鱼的序号（从 1 开始）
 */
function pseudoRandom(index: number): number {
  const state = (index * 2654435761 + 1013904223) % 2147483648
  const mixed = (state ^ (state >>> 15)) * 2246822519
  return Math.abs(mixed % 10000) / 10000
}

/** 按条数与基准尺寸推导整群鱼的布局参数。 */
function buildFishSchool(count: number, size: number): FishSpec[] {
  return Array.from({ length: count }, (_, index) => {
    const rand = pseudoRandom(index + 1)
    const rand2 = pseudoRandom(index + count + 1)
    const rand3 = pseudoRandom(index + count * 2 + 1)
    const rand4 = pseudoRandom(index + count * 3 + 1)
    return {
      id: `fish-${index}`,
      top: `${(8 + rand * 74).toFixed(2)}%`,
      left: `${(rand2 > 0.5 ? -12 + rand3 * 10 : 40 + rand3 * 45).toFixed(2)}vw`,
      width: `${Math.round(size * (0.75 + rand4 * 0.5))}`,
      opacity: (0.16 + rand * 0.2).toFixed(3),
      duration: `${(26 + rand * 18).toFixed(1)}s`,
      delay: `${(-rand2 * 30).toFixed(1)}s`,
      direction: rand2 > 0.5 ? 'normal' : 'reverse',
      glow: rand3 > 0.5 ? 'primary' : 'secondary',
    }
  })
}
</script>

<template>
  <div
    class="fish-backdrop"
    data-testid="fish-backdrop"
    :data-motion="prefersReducedMotion ? 'reduced' : 'full'"
    aria-hidden="true"
  >
    <svg
      v-for="fish in buildFishSchool(props.count, props.size)"
      :key="fish.id"
      class="fish-backdrop__fish"
      :class="[
        `fish-backdrop__fish--${fish.glow}`,
        { 'fish-backdrop__fish--drifting': !prefersReducedMotion },
      ]"
      viewBox="0 0 120 50"
      :style="{
        top: fish.top,
        left: fish.left,
        '--fish-size': `${fish.width}px`,
        opacity: fish.opacity,
        '--fish-duration': fish.duration,
        '--fish-delay': fish.delay,
        '--fish-direction': fish.direction,
      }"
    >
      <path class="fish-backdrop__body" d="M10 25C25 5 70 5 92 25C70 45 25 45 10 25Z" fill="currentColor" />
      <path class="fish-backdrop__tail" d="M92 25 115 10 112 25 115 40Z" fill="currentColor" />
      <circle class="fish-backdrop__eye" cx="26" cy="22" r="2.4" />
    </svg>
  </div>
</template>

<style scoped>
.fish-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* 纯装饰层：鱼群不可点击、不参与无障碍树 */
  pointer-events: none;
}

.fish-backdrop__fish {
  position: absolute;
  /* 宽度来自内联 `--fish-size`，回退值与 props 默认值一致 */
  width: var(--fish-size, 72px);
  /* 微光色：浅蓝点缀，再经整体低透明度压成剪影 */
  color: var(--ds-glow-secondary);
}

.fish-backdrop__fish--primary {
  color: var(--ds-glow-primary);
}

/*
 * 鱼眼用 CSS 而非 SVG 属性的 `fill="var(--ds-bg-deep)"`：CSS 自定义属性
 * 在 SVG 的 presentation attribute 上不生效，只有声明式 CSS 里能用。
 */
.fish-backdrop__eye {
  fill: var(--ds-bg-deep);
}

/*
 * 漂移动画只动 transform：位移交给 GPU 合成，不读写 left / top，
 * 避免每帧触发布局计算（Task 10 REFACTOR 步骤的要求）。
 */
.fish-backdrop__fish--drifting {
  animation: fish-backdrop-drift var(--fish-duration, 26s) linear var(--fish-delay, 0s) infinite
    var(--fish-direction, normal);
  will-change: transform;
}

@keyframes fish-backdrop-drift {
  from {
    transform: translate3d(-20vw, 0, 0);
  }
  to {
    transform: translate3d(120vw, 0, 0);
  }
}

/* 系统级减弱动效：即使 JS 与 CSS 不同步也保证静止 */
@media (prefers-reduced-motion: reduce) {
  .fish-backdrop__fish--drifting {
    animation: none;
  }
}
</style>
