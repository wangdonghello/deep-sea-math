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

const props = defineProps<{ animalId: CompanionId; mood: number }>()
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
    :aria-label="`${look.name}伙伴，心情 ${mood}/100，点我摸摸`"
    @click="tap"
  >
    <svg viewBox="0 0 320 300" role="img" :aria-label="`站立的${look.name}，心情 ${mood}/100`">
      <ellipse class="companion__shadow" cx="166" cy="278" rx="96" ry="11" />

      <!-- 龙翼（身体后面） -->
      <g v-if="look.wings" class="companion__wings">
        <path d="M196 168 Q244 112 292 142 Q258 170 250 208 Q226 190 196 168 Z" :fill="look.body" opacity="0.55" :stroke="look.dark" stroke-width="3" />
        <path d="M206 178 Q246 146 276 156" fill="none" :stroke="look.accent" stroke-width="3" opacity="0.8" />
      </g>

      <!-- 尾巴 -->
      <g class="companion__tail">
        <path :d="tailPath" fill="none" :stroke="look.body" stroke-width="15" stroke-linecap="round" />
        <path v-if="look.tail === 'spiked'" d="M270 196 l12 -15 l2 18 l13 -11" fill="none" :stroke="look.accent" stroke-width="4" stroke-linecap="round" />
        <circle v-if="look.tail === 'tuft'" cx="284" cy="160" r="14" :fill="look.dark" />
        <path v-if="look.tail === 'striped'" d="M262 194 l8 12 M274 178 l8 12 M284 160 l8 12" :stroke="look.dark" stroke-width="5" stroke-linecap="round" />
      </g>

      <!-- 后腿 -->
      <g class="companion__legs companion__legs--back">
        <rect x="212" y="222" width="24" height="50" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <rect x="240" y="218" width="24" height="54" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="224" cy="273" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="252" cy="273" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <path d="M216 274 v5 M224 274 v6 M232 274 v5 M244 274 v5 M252 274 v6 M260 274 v5" :stroke="look.dark" stroke-width="2" stroke-linecap="round" />
      </g>

      <!-- 身体 -->
      <ellipse cx="176" cy="198" rx="78" ry="52" :fill="look.body" :stroke="look.dark" stroke-width="3" />
      <ellipse cx="166" cy="214" rx="48" ry="32" :fill="look.belly" opacity="0.95" />

      <!-- 老虎条纹 -->
      <g v-if="look.stripes" :stroke="look.dark" stroke-width="4" stroke-linecap="round" opacity="0.85">
        <path d="M210 170 l-12 18 M228 168 l-12 18 M246 172 l-12 18" />
        <path d="M152 172 l-10 16 M170 170 l-10 16" />
      </g>

      <!-- 前腿 -->
      <g class="companion__legs companion__legs--front">
        <rect x="122" y="226" width="24" height="48" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <rect x="152" y="230" width="24" height="44" rx="12" :fill="look.body" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="134" cy="274" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <ellipse cx="164" cy="274" rx="17" ry="9" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <path d="M126 275 v5 M134 275 v6 M142 275 v5 M156 275 v5 M164 275 v6 M172 275 v5" :stroke="look.dark" stroke-width="2" stroke-linecap="round" />
      </g>

      <!-- 项圈 -->
      <path d="M124 168 Q150 188 186 172" fill="none" :stroke="look.accent" stroke-width="12" stroke-linecap="round" />
      <circle cx="155" cy="184" r="6" :fill="look.accent" :stroke="look.dark" stroke-width="2" />

      <!-- 狮子鬃毛 -->
      <circle v-if="look.mane" cx="102" cy="138" r="72" :fill="look.dark" opacity="0.95" />

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
        <circle cx="80" cy="130" r="11" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <circle cx="118" cy="130" r="11" :fill="look.belly" :stroke="look.dark" stroke-width="2" />
        <circle cx="82" cy="132" r="6" :fill="look.dark" />
        <circle cx="120" cy="132" r="6" :fill="look.dark" />
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
.companion__tail { transform-origin: 238px 204px; animation: companion-wag 1.9s ease-in-out infinite; }
.companion.is-low .companion__tail { animation-duration: 4s; }
.companion.is-squish svg { animation: companion-squish .22s ease-out; }
@keyframes companion-wag { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(9deg); } }
@keyframes companion-squish { 0% { transform: scale(1, 1); } 45% { transform: scale(1.06, .94); } 100% { transform: scale(1, 1); } }
@media (prefers-reduced-motion: reduce) {
  .companion__tail, .companion.is-squish svg { animation: none; }
}
</style>
