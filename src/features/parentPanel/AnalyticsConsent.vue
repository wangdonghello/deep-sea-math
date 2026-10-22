<script setup lang="ts">
import { ref } from 'vue'

import { hasAnalyticsConsent, setAnalyticsConsent } from '@/shared/analytics'

const enabled = ref(hasAnalyticsConsent())

function onChange(event: Event): void {
  enabled.value = (event.target as HTMLInputElement).checked
  setAnalyticsConsent(enabled.value)
}
</script>

<template>
  <section class="parent-card analytics-consent" data-testid="analytics-consent">
    <h2>匿名使用统计</h2>
    <label class="analytics-consent__toggle">
      <input type="checkbox" :checked="enabled" data-testid="analytics-consent-toggle" @change="onChange">
      允许发送匿名使用统计
    </label>
    <p class="parent-hint">
      只记录页面访问、创建档案数、完成题组数，以及年级/主题这类粗粒度分布。
      不收集姓名、昵称、PIN、答案、题目编号、档案编号或精确位置。关闭后立即停止。
    </p>
  </section>
</template>

<style scoped>
.analytics-consent h2 { margin: 0 0 var(--ds-space-sm); font-size: var(--ds-font-size-title); }
.analytics-consent__toggle { display: flex; align-items: center; gap: .6rem; min-height: 2.75rem; }
.analytics-consent__toggle input { width: 1.15rem; height: 1.15rem; }
</style>
