<script setup lang="ts">
/**
 * 档案选择视图（design §4：职责 = 选档案 + PIN 校验）。
 *
 * 本视图只做**装配**：把 `ProfileCard` / `PinPad` 接到 `useProfileSelect` 上，
 * 自己不含任何业务规则（design §4 组件边界）。
 *
 * 依赖注入：
 * - `store`（必填）：`ProfileStore` 窄接口。生产装配由
 *   `createProfileSelectStore(profileRepo)` 把 Task 9 的仓储适配后传入
 *   （T9 无 `verify()`，不能直接传）；测试注入内存态 fake。
 * - `clock` / `navigate`（可选）：倒计时时钟与登录成功后的导航，缺省值都在
 *   `useProfileSelect` 里（浏览器定时器 + 不导航），本视图不重复定义一份
 *   默认实现 —— 两份默认值迟早会漂移。Task 17 装配路由时传入真实 `router.push`。
 *
 * 路由挂载由 Task 17 负责（`/` 重定向到本页），此处不注册路由。
 */
import { onMounted, ref } from 'vue'

import ProfileCard from '@/features/profileSelect/ProfileCard.vue'
import PinPad from '@/features/profileSelect/PinPad.vue'
import { useProfileSelect } from '@/features/profileSelect/useProfileSelect'
import type { Clock, ProfileStore } from '@/features/profileSelect/types'

const props = defineProps<{
  store: ProfileStore
  clock?: Clock
  navigate?: (path: string) => void
}>()

const helpOpen = ref(false)

const select = useProfileSelect({
  store: props.store,
  clock: props.clock,
  navigate: props.navigate,
})

onMounted(async () => {
  await select.load()
})
</script>

<template>
  <main class="profile-select" :class="{ 'profile-select--empty': select.profiles.value.length === 0 && !select.loading.value }"
    data-testid="profile-select">
    <header class="profile-select__header">
      <h1 class="profile-select__title">选择你的档案</h1>
      <p class="profile-select__subtitle">点头像，再输入你的密码</p>
      <button type="button" class="profile-select__help-button" data-testid="profile-help-open" @click="helpOpen = true">
        🧭 系统介绍 / 怎么玩
      </button>
    </header>

    <section v-if="helpOpen" class="profile-select__help" data-testid="profile-help" role="dialog" aria-modal="true" aria-labelledby="profile-help-title" @click.self="helpOpen = false">
      <div class="profile-select__help-card">
        <header class="profile-select__help-head">
          <h2 id="profile-help-title">欢迎来到深海数学探险</h2>
          <button type="button" class="profile-select__help-close" data-testid="profile-help-close" aria-label="关闭介绍" @click="helpOpen = false">✕</button>
        </header>
        <p class="profile-select__help-lead">
          每天完成一组数学题，按孩子当前年级出题，并穿插低年级温故题和高年级知新题；做题可以养宠物、开盲盒、收集神兽。
        </p>
        <ol class="profile-select__help-steps">
          <li><strong>选档案</strong><span>点头像，输入 4 位密码进入。</span></li>
          <li><strong>完成今日题组</strong><span>点“今日探险”，做完当天数学题，获得 1 张盲盒券。</span></li>
          <li><strong>开盲盒</strong><span>到宠物房开盒，可能获得经验、食物、玩具或宠物。第一次开盒必得宠物。</span></li>
          <li><strong>订正错题</strong><span>原题订正正确、再做对一道相似题，错题就会移入“总错题集”，还能攒积分和徽章。</span></li>
          <li><strong>家长区</strong><span>家长可以建档案、设置年级和题量、查看学习报告。</span></li>
        </ol>
        <p class="profile-select__help-note">第一次进入还没有宠物，先完成今天的题组拿盲盒券吧。</p>
        <button type="button" class="profile-select__help-ok" data-testid="profile-help-ok" @click="helpOpen = false">知道了，开始探险</button>
      </div>
    </section>

    <p v-if="select.loading.value" class="profile-select__loading" data-testid="profile-loading">
      正在打开档案…
    </p>

    <!--
      全局错误段（列表读取失败）。

      为什么需要它：`errorMessage` 平时只经 PinPad 渲染，而 PinPad 的前提是
      `selectedProfile !== null`。列表读取失败时 `profiles` 为空、PinPad 根本
      不挂载，那句"再试一次"就永远不会出现，用户只会看到下面的空态文案
      "还没有档案，请家长去新建" —— 把一次存储故障误导成"你该去建档案"。
      因此凡「出错了且列表为空」，就在这里直接说。

      文案仍复用 `RETRY_MESSAGE`：规格未定义"读失败"的专用文案，多一种措辞
      就多一处需要评审的安全面。具体错因只进 `logger`（已 redact）。
    -->
    <p
      v-if="select.status.value === 'error' && select.profiles.value.length === 0"
      class="profile-select__message"
      data-testid="profile-list-error"
      role="status"
      aria-live="polite"
    >
      档案打不开，{{ select.errorMessage.value }}
    </p>

    <ul v-else-if="select.profiles.value.length > 0" class="profile-select__list">
      <li v-for="profile in select.profiles.value" :key="profile.id" class="profile-select__item">
        <ProfileCard
          :profile="profile"
          :selected="select.selectedId.value === profile.id"
          :disabled="select.locked.value"
          @select="select.selectProfile"
        />
      </li>
    </ul>

    <!--
      空态：本机还没有任何档案（首次安装）。建档入口在家长区（Task 16），
      这里只负责说明“去哪里建”，不含任何业务判断。
    -->
    <section v-else-if="!select.loading.value" class="profile-select__empty-card" data-testid="profile-empty-card">
      <span class="profile-select__empty-art" aria-hidden="true">🤿</span>
      <div class="profile-select__empty-copy">
        <h2>准备好一起下潜了吗？</h2>
        <p data-testid="profile-empty">请家长先创建一个学习档案，再开始深海探险。</p>
      </div>
    </section>

    <!--
      PIN 盘只在选中档案后出现（spec §PIN 切换档案：先选头像再输 PIN）。
      锁定态下 `PinPad` 自身禁用输入；错误与倒计时文案由它渲染。
    -->
    <PinPad
      v-if="select.selectedProfile.value !== null"
      :input-only="true"
      :nickname="select.selectedProfile.value.nickname"
      :value="select.pin.value"
      :disabled="select.locked.value"
      :error-message="select.errorMessage.value"
      :remaining-seconds="select.remainingSeconds.value"
      :submitting="select.status.value === 'verifying'"
      @digit="select.pushDigit"
      @backspace="select.backspace"
      @setpin="select.setPin"
      @submit="select.submit"
    />

    <ol v-if="select.selectedProfile.value !== null" class="profile-select__journey" data-testid="profile-journey" aria-label="探险流程">
      <li><span aria-hidden="true">📋</span><span>接任务</span></li>
      <li class="profile-select__journey-arrow" aria-hidden="true">→</li>
      <li><span aria-hidden="true">🧮</span><span>学数学</span></li>
      <li class="profile-select__journey-arrow" aria-hidden="true">→</li>
      <li><span aria-hidden="true">🐟</span><span>解锁生物</span></li>
    </ol>
  </main>
</template>

<style scoped>
.profile-select {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--ds-space-lg);
  min-height: 0;
  max-width: 38rem;
  margin: 0 auto;
  padding: max(var(--ds-space-xl), env(safe-area-inset-top)) var(--ds-space-lg) var(--ds-space-lg);
  color: var(--ds-text-primary);
  background:
    radial-gradient(ellipse at 50% 0%, rgb(45 124 161 / 28%), transparent 45%),
    var(--ds-bg-gradient);
}

.profile-select__header { display: grid; justify-items: center; gap: var(--ds-space-xs); text-align: center; }
.profile-select__help-button { margin-top: 2px; padding: .45rem .9rem; border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-pill); background: rgb(255 255 255 / 7%); color: var(--ds-text-primary); font: inherit; font-size: var(--ds-font-size-caption); cursor: pointer; }
.profile-select__help { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: var(--ds-space-lg); background: rgb(2 10 20 / 72%); backdrop-filter: blur(6px); }
.profile-select__help-card { display: grid; gap: var(--ds-space-sm); width: min(100%, 34rem); max-height: min(86dvh, 46rem); overflow-y: auto; padding: var(--ds-space-lg); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-lg); background: linear-gradient(145deg, rgb(13 37 60 / 98%), rgb(7 23 42 / 98%)); box-shadow: var(--ds-shadow-card); }
.profile-select__help-head { display: flex; align-items: start; justify-content: space-between; gap: var(--ds-space-sm); }
.profile-select__help-head h2 { margin: 0; font-size: var(--ds-font-size-title); }
.profile-select__help-close { width: 2rem; height: 2rem; border: 1px solid var(--ds-glass-border); border-radius: 50%; background: transparent; color: var(--ds-text-secondary); cursor: pointer; }
.profile-select__help-lead, .profile-select__help-note { margin: 0; color: var(--ds-text-secondary); line-height: var(--ds-line-height-body); }
.profile-select__help-steps { display: grid; gap: var(--ds-space-sm); margin: 0; padding-left: 1.25rem; }
.profile-select__help-steps li { padding-left: 2px; }
.profile-select__help-steps strong { display: block; color: var(--ds-text-primary); }
.profile-select__help-steps span { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); line-height: 1.6; }
.profile-select__help-note { padding: .6rem .75rem; border-radius: var(--ds-radius-md); background: rgb(255 212 121 / 9%); color: var(--ds-accent-text); font-size: var(--ds-font-size-caption); }
.profile-select__help-ok { justify-self: end; min-height: 2.75rem; padding: .55rem 1.1rem; border: 0; border-radius: var(--ds-radius-pill); background: var(--ds-accent-500); color: white; font: inherit; font-weight: 700; cursor: pointer; }
.profile-select__title { margin: 0; font-size: clamp(1.65rem, 7vw, 2.2rem); letter-spacing: .01em; }
.profile-select__subtitle { margin: 0; color: var(--ds-text-secondary); }
.profile-select__list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ds-space-md); margin: 0; padding: 0; list-style: none; }
.profile-select__item { min-width: 0; }
.profile-select__empty-card { display: flex; align-items: center; gap: var(--ds-space-lg); min-height: 10rem; padding: var(--ds-space-xl); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-lg); background: radial-gradient(ellipse at 15% 15%, rgb(78 163 191 / 22%), transparent 60%), linear-gradient(145deg, rgb(15 43 69 / 96%), rgb(7 23 42 / 96%)); box-shadow: var(--ds-shadow-card); }
.profile-select__empty-art { display: grid; flex: 0 0 auto; place-items: center; width: 4.5rem; height: 4.5rem; border: 1px solid var(--ds-glass-border); border-radius: 50%; background: rgb(71 150 177 / 22%); font-size: 2.2rem; }
.profile-select__empty-copy h2 { margin: 0 0 var(--ds-space-xs); font-size: var(--ds-font-size-title); }
.profile-select__empty-copy p { margin: 0; color: var(--ds-text-secondary); line-height: var(--ds-line-height-body); }
.profile-select__loading,
.profile-select__message,
.profile-select__empty { margin: 0; padding: var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: var(--ds-glass-surface); color: var(--ds-text-secondary); text-align: center; }
.profile-select--empty { min-height: calc(100dvh - 6rem); align-content: center; }
.profile-select :deep(.pin-pad) { padding: var(--ds-space-lg); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-lg); background: linear-gradient(145deg, rgb(13 37 60 / 96%), rgb(7 23 42 / 96%)); box-shadow: var(--ds-shadow-card); }
.profile-select :deep(.pin-pad__native-submit) { margin-top: 0; }
.profile-select__journey { display: flex; align-items: center; justify-content: center; gap: clamp(var(--ds-space-xs), 2vw, var(--ds-space-md)); margin: 0; padding: var(--ds-space-md) 0; list-style: none; color: var(--ds-text-secondary); }
.profile-select__journey li:not(.profile-select__journey-arrow) { display: grid; justify-items: center; gap: var(--ds-space-xs); font-size: var(--ds-font-size-caption); white-space: nowrap; }
.profile-select__journey li > span:first-child { font-size: 1.2rem; }
.profile-select__journey-arrow { color: var(--ds-glow-primary); opacity: .7; }
@media (max-height: 740px) { .profile-select { gap: var(--ds-space-md); padding-top: var(--ds-space-md); } }
</style>
