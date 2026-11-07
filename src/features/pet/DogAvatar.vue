<script setup lang="ts">
/**
 * 小狗伙伴：站立姿态、四条腿与爪子、上翘的尾巴。
 *
 * 和 PetAvatar 一样只负责“形象 + tap”，心情低时换成半闭眼与平嘴。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{ mood: number }>()
const emit = defineEmits<{ (event: 'tap'): void }>()

const SQUISH_MS = 220
const root = ref<HTMLButtonElement | null>(null)
const squish = ref(false)
let timer: number | undefined

const mood = computed(() => {
  const raw = Number.isFinite(props.mood) ? props.mood : 0
  return Math.min(100, Math.max(0, Math.round(raw)))
})
const low = computed(() => mood.value < 40)

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
    class="dog-avatar"
    :class="{ 'is-low': low, 'is-squish': squish }"
    data-testid="animal-avatar"
    data-animal="dog"
    :aria-label="`小狗伙伴，心情 ${mood}/100，点我摸摸`"
    @click="tap"
  >
    <svg viewBox="0 0 320 300" role="img" :aria-label="`站立的小狗，心情 ${mood}/100`">
      <ellipse class="dog-shadow" cx="166" cy="278" rx="96" ry="11" />

      <!-- 尾巴：从臀部向上翘起 -->
      <g class="dog-tail">
        <path d="M238 204 Q286 198 282 150 Q280 122 296 108" fill="none" stroke="#8a5a2b" stroke-width="18" stroke-linecap="round" />
        <path d="M282 150 Q280 122 296 108" fill="none" stroke="#f7e6cf" stroke-width="14" stroke-linecap="round" />
      </g>

      <!-- 后腿与爪子 -->
      <g class="dog-legs dog-legs--back">
        <rect x="212" y="222" width="24" height="50" rx="12" fill="#b9793f" />
        <rect x="240" y="218" width="24" height="54" rx="12" fill="#a96b36" />
        <ellipse cx="224" cy="273" rx="17" ry="9" fill="#f7e6cf" stroke="#6b421f" stroke-width="2" />
        <ellipse cx="252" cy="273" rx="17" ry="9" fill="#f7e6cf" stroke="#6b421f" stroke-width="2" />
        <path d="M216 274 v5 M224 274 v6 M232 274 v5 M244 274 v5 M252 274 v6 M260 274 v5" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round" />
      </g>

      <!-- 身体 -->
      <ellipse cx="176" cy="198" rx="78" ry="52" fill="#c98a4b" stroke="#6b421f" stroke-width="3" />
      <ellipse cx="166" cy="212" rx="48" ry="34" fill="#f7e6cf" opacity="0.95" />

      <!-- 前腿与爪子 -->
      <g class="dog-legs dog-legs--front">
        <rect x="122" y="226" width="24" height="48" rx="12" fill="#c98a4b" />
        <rect x="152" y="230" width="24" height="44" rx="12" fill="#b9793f" />
        <ellipse cx="134" cy="274" rx="17" ry="9" fill="#f7e6cf" stroke="#6b421f" stroke-width="2" />
        <ellipse cx="164" cy="274" rx="17" ry="9" fill="#f7e6cf" stroke="#6b421f" stroke-width="2" />
        <path d="M126 275 v5 M134 275 v6 M142 275 v5 M156 275 v5 M164 275 v6 M172 275 v5" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round" />
      </g>

      <!-- 项圈 -->
      <path d="M124 168 Q150 188 186 172" fill="none" stroke="#2fb9e8" stroke-width="12" stroke-linecap="round" />
      <circle cx="155" cy="184" r="6" fill="#ffd479" stroke="#6b421f" stroke-width="2" />

      <!-- 耳朵（在头后） -->
      <path d="M70 96 Q26 112 34 166 Q40 186 62 176 Q78 164 84 136 Z" fill="#8a5a2b" stroke="#5a3518" stroke-width="3" />
      <path d="M138 94 Q182 108 176 164 Q170 186 148 176 Q132 164 126 136 Z" fill="#8a5a2b" stroke="#5a3518" stroke-width="3" />

      <!-- 头 -->
      <circle cx="104" cy="136" r="58" fill="#d99a58" stroke="#6b421f" stroke-width="3" />
      <path d="M104 82 Q90 108 94 136 Q100 154 112 160 Q124 148 124 126 Q122 100 104 82 Z" fill="#f7e6cf" opacity="0.9" />

      <!-- 口鼻 -->
      <ellipse cx="74" cy="166" rx="34" ry="25" fill="#f7e6cf" stroke="#8a5a2b" stroke-width="2" />
      <ellipse cx="56" cy="154" rx="11" ry="8" fill="#241a12" />
      <ellipse cx="53" cy="151" rx="3.5" ry="2.5" fill="#ffffff" opacity="0.55" />
      <path d="M74 170 Q64 182 54 174 M74 170 Q84 182 94 174" fill="none" stroke="#5a3518" stroke-width="2.5" stroke-linecap="round" />
      <path v-if="!low" d="M84 184 Q92 198 100 184 Q92 190 84 184 Z" fill="#ff8fa8" />

      <!-- 眼睛 -->
      <g v-if="!low">
        <circle cx="80" cy="130" r="11" fill="#fffdf6" stroke="#5a3518" stroke-width="2" />
        <circle cx="118" cy="130" r="11" fill="#fffdf6" stroke="#5a3518" stroke-width="2" />
        <circle cx="82" cy="132" r="6" fill="#241a12" />
        <circle cx="120" cy="132" r="6" fill="#241a12" />
        <circle cx="84" cy="129" r="2.2" fill="#ffffff" />
        <circle cx="122" cy="129" r="2.2" fill="#ffffff" />
      </g>
      <g v-else>
        <path d="M69 132 Q80 124 91 132" fill="none" stroke="#241a12" stroke-width="3" stroke-linecap="round" />
        <path d="M107 132 Q118 124 129 132" fill="none" stroke="#241a12" stroke-width="3" stroke-linecap="round" />
      </g>

      <!-- 眉毛 -->
      <path d="M68 112 Q80 106 92 110" fill="none" stroke="#6b421f" stroke-width="3" stroke-linecap="round" />
      <path d="M108 110 Q120 106 132 112" fill="none" stroke="#6b421f" stroke-width="3" stroke-linecap="round" />
    </svg>
  </button>
</template>

<style scoped>
.dog-avatar {
  display: grid;
  place-items: center;
  width: min(62vw, 17rem);
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  background: radial-gradient(circle at 50% 42%, rgb(126 220 255 / 16%), transparent 65%);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.dog-avatar svg { width: 100%; height: 100%; overflow: visible; }
.dog-shadow { fill: rgb(0 0 0 / 28%); }
.dog-tail { transform-origin: 238px 204px; animation: dog-wag 1.8s ease-in-out infinite; }
.dog-avatar.is-low .dog-tail { animation-duration: 4s; }
.dog-avatar.is-squish svg { animation: dog-squish .22s ease-out; }
@keyframes dog-wag { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(10deg); } }
@keyframes dog-squish { 0% { transform: scale(1, 1); } 45% { transform: scale(1.06, .94); } 100% { transform: scale(1, 1); } }
@media (prefers-reduced-motion: reduce) {
  .dog-tail, .dog-avatar.is-squish svg { animation: none; }
}
</style>
