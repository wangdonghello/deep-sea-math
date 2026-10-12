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
import { onMounted } from 'vue'

import ProfileCard from '@/features/profileSelect/ProfileCard.vue'
import PinPad from '@/features/profileSelect/PinPad.vue'
import { useProfileSelect } from '@/features/profileSelect/useProfileSelect'
import type { Clock, ProfileStore } from '@/features/profileSelect/types'

const props = defineProps<{
  store: ProfileStore
  clock?: Clock
  navigate?: (path: string) => void
}>()

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
  <main class="profile-select" data-testid="profile-select">
    <header class="profile-select__header">
      <h1 class="profile-select__title">选择你的档案</h1>
      <p class="profile-select__subtitle">点头像，再输入你的密码</p>
    </header>

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
    <p
      v-else
      class="profile-select__empty"
      data-testid="profile-empty"
    >
      还没有档案，请家长在家长区新建
    </p>

    <!--
      PIN 盘只在选中档案后出现（spec §PIN 切换档案：先选头像再输 PIN）。
      锁定态下 `PinPad` 自身禁用输入；错误与倒计时文案由它渲染。
    -->
    <PinPad
      v-if="select.selectedProfile.value !== null"
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
  </main>
</template>
