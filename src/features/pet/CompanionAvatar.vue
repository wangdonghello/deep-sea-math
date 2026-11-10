<script setup lang="ts">
/**
 * 盲盒伙伴的全身形象：头、身体、四条腿与爪子、尾巴都在。
 *
 * 六种伙伴共用一套四足骨架，只替换配色、耳朵、尾巴、鬃毛/条纹/翅膀等特征；
 * 不再用 emoji 大头像。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

export type CompanionId = 'companion-cat' | 'companion-dog' | 'companion-hamster' | 'companion-lion' | 'companion-tiger' | 'companion-dragon'

interface Look {
  name: string
  body: string
  belly: string
  dark: string
  accent: string
  ear: 'pointed' | 'round' | 'floppy' | 'horn'
  tail: 'curl' | 'up' | 'short' | 'tuft' | 'striped' | 'spiked'
  mane?: boolean
  stripes?: boolean
  whiskers?: boolean
  cheeks?: boolean
  wings?: boolean
}

const LOOKS: Record<CompanionId, Look> = {
  'companion-cat': { name: '小猫', body: '#e8a25a', belly: '#fff3df', dark: '#8a5a2b', accent: '#ff9db0', ear: 'pointed', tail: 'curl', whiskers: true },
  'companion-dog': { name: '小狗', body: '#c98a4b', belly: '#f7e6cf', dark: '#6b421f', accent: '#2fb9e8', ear: 'floppy', tail: 'up' },
  'companion-hamster': { name: '仓鼠', body: '#d9a45b', belly: '#fff7e6', dark: '#8a5a2b', accent: '#ffb3c1', ear: 'round', tail: 'short', cheeks: true },
  'companion-lion': { name: '狮子', body: '#d9a24f', belly: '#fff0d2', dark: '#6b421f', accent: '#ffd479', ear: 'round', tail: 'tuft', mane: true },
  'companion-tiger': { name: '老虎', body: '#e08a3c', belly: '#fff1d6', dark: '#3a2412', accent: '#ffd479', ear: 'round', tail: 'striped', stripes: true },
  'companion-dragon': { name: '龙', body: '#4fae8a', belly: '#e9fff4', dark: '#1d5a48', accent: '#ffd479', ear: 'horn', tail: 'spiked', wings: true },
}

const props = defineProps<{ animalId: CompanionId; mood: number; level?: number }>()
const emit = defineEmits<{ (event: 'tap'): void }>()

const SQUISH_MS = 220
const root = ref<HTMLButtonElement | null>(null)
const squish = ref(false)
let timer: number | undefined

const look = computed(() => LOOKS[props.animalId] ?? LOOKS['companion-dog'])
const mood = computed(() => {
  const raw = Number.isFinite(props.mood) ? props.mood : 0
  return Math.min(100, Math.max(0, Math.round(raw)))
})
const low = computed(() => mood.value < 40)

/** 每级成长参数：头身比、身体、腿长、绒毛、专属特征、眼神。 */
const LEVELS = [
  { head: 1.30, body: 0.85, leg: 0.55, fluff: 1.00, feature: 0.00, sharp: 0.00 },
  { head: 1.24, body: 0.88, leg: 0.60, fluff: 0.95, feature: 0.05, sharp: 0.00 },
  { head: 1.18, body: 0.91, leg: 0.65, fluff: 0.90, feature: 0.10, sharp: 0.05 },
  { head: 1.12, body: 0.95, leg: 0.72, fluff: 0.80, feature: 0.18, sharp: 0.10 },
  { head: 1.05, body: 0.99, leg: 0.80, fluff: 0.70, feature: 0.28, sharp: 0.20 },
  { head: 1.00, body: 1.03, leg: 0.88, fluff: 0.60, feature: 0.38, sharp: 0.25 },
  { head: 0.96, body: 1.07, leg: 0.96, fluff: 0.50, feature: 0.48, sharp: 0.35 },
  { head: 0.92, body: 1.11, leg: 1.04, fluff: 0.42, feature: 0.56, sharp: 0.40 },
  { head: 0.89, body: 1.15, leg: 1.10, fluff: 0.35, feature: 0.64, sharp: 0.45 },
  { head: 0.86, body: 1.18, leg: 1.16, fluff: 0.28, feature: 0.72, sharp: 0.55 },
  { head: 0.83, body: 1.21, leg: 1.22, fluff: 0.22, feature: 0.79, sharp: 0.60 },
  { head: 0.80, body: 1.24, leg: 1.28, fluff: 0.16, feature: 0.85, sharp: 0.68 },
  { head: 0.77, body: 1.27, leg: 1.33, fluff: 0.10, feature: 0.90, sharp: 0.75 },
  { head: 0.74, body: 1.30, leg: 1.38, fluff: 0.05, feature: 0.95, sharp: 0.82 },
  { head: 0.72, body: 1.34, leg: 1.44, fluff: 0.00, feature: 1.00, sharp: 0.90 },
] as const

const level = computed(() => {
  const raw = Number.isFinite(props.level) ? Number(props.level) : 1
  return Math.min(15, Math.max(1, Math.round(raw)))
})
const params = computed(() => LEVELS[level.value - 1])
const lift = computed(() => (params.value.leg - 0.55) * 28)
const headTransform = computed(() => `translate(102 ${138 - lift.value}) scale(${params.value.head}) translate(-102 -138)`)
const bodyTransform = computed(() => `translate(176 ${198 - lift.value}) scale(${0.86 + params.value.body * 0.16} ${0.82 + params.value.body * 0.2}) translate(-176 -198)`)
const legTransform = computed(() => `translate(0 274) scale(1 ${params.value.leg + 0.45}) translate(0 -274)`)
const tailTransform = computed(() => `translate(238 204) scale(${0.82 + params.value.feature * 0.3}) translate(-238 -204)`)
const wingTransform = computed(() => `translate(250 170) scale(${0.35 + params.value.feature * 0.75}) translate(-250 -170)`)
const svgStyle = computed(() => ({ filter: `saturate(${0.9 + params.value.feature * 0.3}) brightness(${1.02 - params.value.feature * 0.06})` }))
const eyeR = computed(() => 11 - params.value.sharp * 1.5)
const maneR = computed(() => 40 + params.value.feature * 60)

const tailPath = computed(() => {
  switch (look.value.tail) {
    case 'short': return 'M240 214 Q258 218 262 204'
    case 'tuft': return 'M238 202 Q282 204 284 164'
    case 'striped': return 'M238 202 Q286 198 290 152'
    case 'spiked': return 'M238 206 Q292 214 304 174 Q312 154 326 150'
    default: return 'M238 202 Q286 196 284 146 Q282 120 298 106'
  }
})

function tap(): void {
  if (timer !== undefined) window.clearTimeout(timer)
  const el = root.value
  if (el) {
    el.classList.remove('is-squish')
    void el.offsetWidth
    el.classList.add('is-squish')
  }
  squish.value = true
  timer = window.setTimeout(() => { squish.value = false; timer = undefined }, SQUISH_MS)
  emit('tap')
}

onBeforeUnmount(() => { if (timer !== undefined) window.clearTimeout(timer) })
</script>

<template>
  <button
    ref="root"
    type="button"
    class="companion"
    :class="{ 'is-low': low, 'is-squish': squish }"
    data-testid="animal-avatar"
    :data-animal="animalId"
    :data-level="level"
    :aria-label="`${look.name}伙伴，心情 ${mood}/100，点我摸摸`"
    @click="tap"
  >
    <svg viewBox="0 0 320 300" role="img" :style="svgStyle" :aria-label="`站立的${look.name}，Lv.${level}，心情 ${mood}/100`">
      <ellipse class="companion__shadow" cx="166" cy="278" rx="96" ry="11" />
      <circle v-if="level >= 15" class="companion__aura" cx="160" cy="178" r="116" />

      <!-- 龙翼（身体后面） -->
      <g v-if="look.wings" :transform="wingTransform">
        <g class="companion__wings">
        <path d="M190 162 Q248 76 312 112 Q272 148 260 212 Q226 184 190 162 Z" :fill="look.belly" opacity="0.82" :stroke="look.dark" stroke-width="3" />
        <path d="M204 172 Q250 120 296 128 M218 186 Q252 158 280 164 M232 200 Q258 184 272 190" fill="none" :stroke="look.dark" stroke-width="2.5" opacity="0.7" />
        </g>
      </g>

      <!-- 尾巴 -->
      <g :transform="tailTransform">
        <g class="companion__tail">
        <path :d="tailPath" fill="none" :stroke="look.body" stroke-width="15" stroke-linecap="round" />
        <path v-if="look.tail === 'spiked'" d="M270 196 l12 -15 l2 18 l13 -11" fill="none" :stroke="look.accent" stroke-width="4" stroke-linecap="round" />
        <circle v-if="look.tail === 'tuft'" cx="284" cy="160" r="14" :fill="look.dark" />
        <path v-if="look.tail === 'striped'" d="M262 194 l8 12 M274 178 l8 12 M284 160 l8 12" :stroke="look.dark" stroke-width="5" stroke-linecap="round" />
        </g>
      </g>

      <!-- 后腿 -->
      <g :transform="legTransform" class="companion__legs companion__legs--back">
        <rect x="212" y="222" width="24" height="50" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <rect x="240" y="218" width="24" height="54" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="224" cy="273" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="252" cy="273" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <path d="M216 274 v5 M224 274 v6 M232 274 v5 M244 274 v5 M252 274 v6 M260 274 v5" :stroke="look.dark" stroke-width="2" stroke-linecap="round" />
      </g>

      <!-- 身体 -->
      <g :transform="bodyTransform">
      <ellipse cx="176" cy="198" rx="78" ry="52" :fill="look.body" :stroke="look.dark" stroke-width="3" />
      <ellipse cx="166" cy="214" rx="48" ry="32" :fill="look.belly" opacity="0.95" />

      <!-- 老虎条纹 -->
      <g v-if="look.stripes" :stroke="look.dark" stroke-width="4" stroke-linecap="round" :opacity="0.25 + params.feature * 0.75">
        <path d="M210 170 l-12 18 M228 168 l-12 18 M246 172 l-12 18" />
        <path d="M152 172 l-10 16 M170 170 l-10 16" />
      </g>
      </g>

      <path v-if="level >= 7" d="M206 172 Q224 162 236 176 Q222 184 214 196 Z" :fill="look.dark" opacity="0.9" />

      <!-- 等级徽章：数字随等级变化，孩子一眼能看到成长 -->
      <g :transform="bodyTransform" class="companion__badge" aria-hidden="true">
        <circle cx="210" cy="196" r="15" :fill="look.accent" :stroke="look.dark" stroke-width="3" />
        <text x="210" y="202" text-anchor="middle" font-size="15" font-weight="800" :fill="look.dark">{{ level }}</text>
      </g>

      <!-- Lv.10 成体胸章 -->
      <g v-if="level >= 10" class="companion__chest" aria-hidden="true">
        <path d="M150 224 L160 235 L150 246 L140 235 Z" :fill="look.accent" :stroke="look.dark" stroke-width="2" />
      </g>

      <!-- 前腿 -->
      <g :transform="legTransform" class="companion__legs companion__legs--front">
        <rect x="122" y="226" width="24" height="48" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <rect x="152" y="230" width="24" height="44" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="134" cy="274" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="164" cy="274" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <path d="M126 275 v5 M134 275 v6 M142 275 v5 M156 275 v5 M164 275 v6 M172 275 v5" :stroke="look.dark" stroke-width="2" stroke-linecap="round" />
      </g>

      <!-- 项圈 -->
      <path d="M124 168 Q150 188 186 172" fill="none" :stroke="look.accent" stroke-width="12" stroke-linecap="round" />
      <circle cx="155" cy="184" r="6" :fill="look.accent" :stroke="look.dark" stroke-width="2" />

      <g :transform="headTransform">
      <!-- 狮子鬃毛 -->
      <circle v-if="look.mane" cx="102" cy="138" :r="maneR" :fill="look.dark" opacity="0.95" />

      <!-- 耳朵 -->
      <g v-if="look.ear === 'pointed'">
        <path d="M58 100 L38 52 L92 78 Z" :fill="look.body" :stroke="look.dark" stroke-width="3" stroke-linejoin="round" />
        <path d="M142 100 L162 52 L108 78 Z" :fill="look.body" :stroke="look.dark" stroke-width="3" stroke-linejoin="round" />
        <path d="M60 92 L48 64 L82 80 Z" :fill="look.accent" />
        <path d="M140 92 L152 64 L118 80 Z" :fill="look.accent" />
      </g>
      <g v-else-if="look.ear === 'floppy'">
        <path d="M70 96 Q26 112 34 166 Q40 186 62 176 Q78 164 84 136 Z" :fill="look.dark" :stroke="look.dark" stroke-width="3" />
        <path d="M138 94 Q182 108 176 164 Q170 186 148 176 Q132 164 126 136 Z" :fill="look.dark" :stroke="look.dark" stroke-width="3" />
      </g>
      <g v-else-if="look.ear === 'round'">
        <circle cx="56" cy="94" r="19" :fill="look.body" :stroke="look.dark" stroke-width="3" />
        <circle cx="144" cy="94" r="19" :fill="look.body" :stroke="look.dark" stroke-width="3" />
        <circle cx="56" cy="94" r="10" :fill="look.accent" />
        <circle cx="144" cy="94" r="10" :fill="look.accent" />
      </g>
      <g v-else>
        <path d="M68 92 Q54 44 82 36 Q84 70 96 86 Z" :fill="look.accent" :stroke="look.dark" stroke-width="3" />
        <path d="M132 92 Q146 44 118 36 Q116 70 104 86 Z" :fill="look.accent" :stroke="look.dark" stroke-width="3" />
      </g>

      <!-- 猫成体颊毛 -->
      <g v-if="look.ear === 'pointed' && level >= 10" class="companion__cat-tufts" aria-hidden="true">
        <path d="M54 152 L26 142 L44 164 L24 170 L50 178 Z" :fill="look.body" :stroke="look.dark" stroke-width="2.5" />
        <path d="M148 152 L176 142 L158 164 L178 170 L152 178 Z" :fill="look.body" :stroke="look.dark" stroke-width="2.5" />
      </g>

      <!-- 头 -->
      <circle cx="102" cy="138" r="56" :fill="look.body" :stroke="look.dark" stroke-width="3" />
      <path d="M102 84 Q88 112 92 138 Q98 154 110 160 Q122 148 122 126 Q120 100 102 84 Z" :fill="look.belly" opacity="0.9" />

      <!-- 老虎额头条纹 -->
      <g v-if="look.stripes" :stroke="look.dark" stroke-width="4" stroke-linecap="round" opacity="0.9">
        <path d="M78 100 l-6 16 M96 96 l0 14 M114 100 l6 16" />
      </g>

      <!-- 口鼻 -->
      <ellipse cx="74" cy="166" rx="34" ry="25" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
      <ellipse cx="57" cy="154" rx="11" ry="8" :fill="look.dark" />
      <ellipse cx="54" cy="151" rx="3.5" ry="2.5" fill="#ffffff" opacity="0.55" />
      <path d="M74 170 Q64 182 54 174 M74 170 Q84 182 94 174" fill="none" :stroke="look.dark" stroke-width="2.5" stroke-linecap="round" />
      <path v-if="!low" d="M84 184 Q92 198 100 184 Q92 190 84 184 Z" :fill="look.accent" />

      <!-- 仓鼠腮红 -->
      <circle v-if="look.cheeks" cx="50" cy="170" r="9" :fill="look.accent" opacity="0.6" />
      <circle v-if="look.cheeks" cx="100" cy="172" r="9" :fill="look.accent" opacity="0.6" />

      <!-- 眼睛 -->
      <g v-if="!low">
        <circle cx="80" cy="130" :r="eyeR" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <circle cx="118" cy="130" :r="eyeR" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <circle cx="82" cy="132" :r="eyeR * 0.55" :fill="look.dark" />
        <circle cx="120" cy="132" :r="eyeR * 0.55" :fill="look.dark" />
        <circle cx="84" cy="129" r="2.2" fill="#ffffff" />
        <circle cx="122" cy="129" r="2.2" fill="#ffffff" />
      </g>
      <g v-else>
        <path d="M69 132 Q80 124 91 132 M107 132 Q118 124 129 132" fill="none" :stroke="look.dark" stroke-width="3" stroke-linecap="round" />
      </g>

      <!-- 胡须 -->
      <g v-if="look.whiskers" :stroke="look.dark" stroke-width="2" stroke-linecap="round" opacity="0.7">
        <path d="M46 158 L18 150 M46 166 L16 166 M48 174 L20 182" />
        <path d="M96 158 L124 150 M96 166 L126 166 M94 174 L122 182" />
      </g>

      <!-- 龙角尖光 -->
      <circle v-if="look.wings" cx="292" cy="144" r="4" :fill="look.accent" />
      </g>

      <!-- 等级徽记 -->
      <g v-if="level >= 12" class="companion__crest" aria-hidden="true">
        <path d="M124 62 L138 92 L160 76 L182 92 L196 62 L186 112 L134 112 Z" :fill="look.accent" :stroke="look.dark" stroke-width="2.5" stroke-linejoin="round" />
        <circle cx="160" cy="96" r="4" :fill="look.dark" />
      </g>
    </svg>
  </button>
</template>

<style scoped>
.companion {
  display: grid;
  place-items: center;
  width: min(64vw, 18rem);
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  background: radial-gradient(circle at 50% 42%, rgb(126 220 255 / 16%), transparent 65%);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.companion svg { width: 100%; height: 100%; overflow: visible; }
.companion__shadow { fill: rgb(0 0 0 / 28%); }
.companion__aura { fill: rgb(255 212 121 / 16%); }
.companion__badge text { font-family: inherit; }
.companion__tail { transform-origin: 238px 204px; animation: companion-wag 1.9s ease-in-out infinite; }
.companion.is-low .companion__tail { animation-duration: 4s; }
.companion.is-squish svg { animation: companion-squish .22s ease-out; }
@keyframes companion-wag { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(9deg); } }
@keyframes companion-squish { 0% { transform: scale(1, 1); } 45% { transform: scale(1.06, .94); } 100% { transform: scale(1, 1); } }
@media (prefers-reduced-motion: reduce) {
  .companion__tail, .companion.is-squish svg { animation: none; }
}
</style>
