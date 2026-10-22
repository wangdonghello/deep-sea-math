<script setup lang="ts">
/** 太空主题背景：星点、星云与缓慢漂移的光带，纯 CSS 不依赖图片。 */
const stars = Array.from({ length: 36 }, (_, index) => ({
  id: index,
  left: `${(index * 37 + 11) % 100}%`,
  top: `${(index * 53 + 7) % 100}%`,
  delay: `${(index % 9) * 0.35}s`,
  size: `${1 + (index % 3)}px`,
}))
</script>

<template>
  <div class="space-backdrop" aria-hidden="true">
    <span v-for="star in stars" :key="star.id" class="space-backdrop__star" :style="{ left: star.left, top: star.top, animationDelay: star.delay, width: star.size, height: star.size }" />
    <span class="space-backdrop__nebula space-backdrop__nebula--one" />
    <span class="space-backdrop__nebula space-backdrop__nebula--two" />
    <span class="space-backdrop__planet">🪐</span>
  </div>
</template>

<style scoped>
.space-backdrop { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(circle at 70% 20%, #26356f 0, #101a3c 38%, #060a1b 100%); }
.space-backdrop__star { position: absolute; border-radius: 50%; background: #fff; opacity: .8; animation: star-twinkle 3.2s ease-in-out infinite; }
.space-backdrop__nebula { position: absolute; width: 60%; aspect-ratio: 1; border-radius: 50%; filter: blur(28px); opacity: .45; animation: nebula-drift 16s ease-in-out infinite alternate; }
.space-backdrop__nebula--one { top: -18%; right: -8%; background: radial-gradient(circle, #b04dff, transparent 65%); }
.space-backdrop__nebula--two { bottom: -24%; left: -12%; background: radial-gradient(circle, #2b9cff, transparent 65%); animation-delay: -6s; }
.space-backdrop__planet { position: absolute; top: 12%; right: 12%; font-size: 3.5rem; opacity: .22; animation: planet-drift 12s ease-in-out infinite alternate; }
@keyframes star-twinkle { 0%, 100% { opacity: .25; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.25); } }
@keyframes nebula-drift { from { transform: translate3d(-3%, 0, 0) scale(.95); } to { transform: translate3d(4%, 3%, 0) scale(1.08); } }
@keyframes planet-drift { from { transform: translateY(-6px) rotate(-8deg); } to { transform: translateY(8px) rotate(8deg); } }
@media (prefers-reduced-motion: reduce) { .space-backdrop__star, .space-backdrop__nebula, .space-backdrop__planet { animation: none; } }
</style>
