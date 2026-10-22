<script setup lang="ts">
/** 恐龙主题背景：蕨叶、火山与暖色天空，纯 CSS/emoji。 */
const leaves = Array.from({ length: 14 }, (_, index) => ({
  id: index,
  left: `${(index * 43 + 5) % 100}%`,
  bottom: `${(index * 31 + 3) % 45}%`,
  delay: `${(index % 7) * 0.4}s`,
  size: `${1.4 + (index % 4) * 0.45}rem`,
}))
</script>

<template>
  <div class="dino-backdrop" aria-hidden="true">
    <div class="dino-backdrop__sun" />
    <div class="dino-backdrop__volcano" />
    <span v-for="leaf in leaves" :key="leaf.id" class="dino-backdrop__leaf" :style="{ left: leaf.left, bottom: leaf.bottom, animationDelay: leaf.delay, fontSize: leaf.size }">🌿</span>
  </div>
</template>

<style scoped>
.dino-backdrop { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(180deg, #6e3b2c 0, #b75f37 38%, #3f5a32 100%); }
.dino-backdrop__sun { position: absolute; top: 14%; right: 16%; width: 4.5rem; height: 4.5rem; border-radius: 50%; background: #ffc46b; box-shadow: 0 0 40px 18px rgb(255 173 78 / 28%); animation: sun-pulse 6s ease-in-out infinite; }
.dino-backdrop__volcano { position: absolute; left: -8%; bottom: -12%; width: 72%; height: 55%; border-radius: 45% 55% 0 0; background: linear-gradient(145deg, #3b2a25, #594238); transform: rotate(-4deg); }
.dino-backdrop__volcano::after { content: ''; position: absolute; top: 8%; left: 32%; width: 32%; height: 18%; border-radius: 50%; background: #ff7a3d; filter: blur(10px); opacity: .7; }
.dino-backdrop__leaf { position: absolute; opacity: .75; animation: leaf-sway 5s ease-in-out infinite; }
@keyframes sun-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes leaf-sway { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(8deg); } }
@media (prefers-reduced-motion: reduce) { .dino-backdrop__sun, .dino-backdrop__leaf { animation: none; } }
</style>
