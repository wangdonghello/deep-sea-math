<script setup lang="ts">
/**
 * 家长区门禁视图（P1）。
 *
 * 只做**装配**：把 `PinPad` 接到 `useParentGate` 上，自己不含任何业务规则
 * （"什么时候进设置模式、怎么校验、几次锁定"全在 composable 里）。
 *
 * 视觉与 `ProfileSelectView` 同源：复用 `theme.css` 的 `--ds-*` token 与
 * `FishBackdrop`（`count` 传有界值，见 RETRO R7）。
 *
 * 成功后**不自己导航**——emit `unlocked`，由 `ParentGateRoute` 决定去总览。
 * 这样视图不认识路由，也能在组件测试里只断言"放行了没有"。
 */
import { computed, onMounted } from 'vue'

import { useParentGate } from '@/features/parentPanel/useParentGate'
import PinPad from '@/features/profileSelect/PinPad.vue'
import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import FishBackdrop from '@/features/theme/FishBackdrop.vue'
import type { ParentGuardStore } from '@/features/parentPanel/types'
import type { Clock } from '@/features/profileSelect/types'
import type { DigestFn } from '@/domain/crypto/hashPin'

const props = defineProps<{
  store: ParentGuardStore
  /** 倒计时时钟；缺省走浏览器定时器。测试注入假时钟。 */
  clock?: Clock
  /** 随机盐来源；缺省走 Web Crypto。测试注入确定性实现。 */
  randomBytes?: (size: number) => Uint8Array
  /** 摘要算法；缺省走 `hashPin` 的 Web Crypto 分支。 */
  digest?: DigestFn
  /** 日志出口；发出的对象会先经 `redact()` 脱敏。 */
  logger?: (entry: Record<string, unknown>) => void
}>()

const emit = defineEmits<{
  (event: 'unlocked'): void
  (event: 'back'): void
}>()

const gate = useParentGate({
  store: props.store,
  clock: props.clock,
  randomBytes: props.randomBytes,
  digest: props.digest,
  logger: props.logger,
})

/** PIN 盘标题随模式变化："设置"还是"校验"。 */
const padTitle = computed(() =>
  gate.mode.value === 'verify' ? '家长密码' : '设置家长密码',
)

/** 一句操作说明（不含任何"哪里错了"的归因）。 */
const hint = computed(() => {
  if (gate.mode.value === 'confirm') return '再输一次，确认你刚才设的密码'
  if (gate.mode.value === 'create') return '第一次使用，请先设置 4 位家长密码'
  return '请输入家长密码进入家长区'
})

/** 提交后若已解锁，交给路由封装决定去哪（本视图不 import router）。 */
async function onSubmit(): Promise<void> {
  await gate.submit()
  if (gate.unlocked.value) emit('unlocked')
}

onMounted(() => {
  void gate.load()
})
</script>

<template>
  <main class="parent-gate" data-testid="parent-gate">
    <FishBackdrop :count="10" :size="64" />

    <header class="parent-gate__header">
      <span class="parent-gate__badge" aria-hidden="true">🛡️</span>
      <h1 class="parent-gate__title">家长区</h1>
      <p class="parent-gate__subtitle">仅在本机管理，不收集任何个人信息</p>
    </header>

    <!-- 记录读取中：此处不渲染 PIN 盘，避免"设置/校验"标题在读到结果前闪一下。 -->
    <p v-if="gate.loading.value" class="parent-gate__loading" data-testid="parent-gate-loading">
      正在准备…
    </p>

    <template v-else>
      <section class="parent-gate__panel" data-testid="parent-gate-panel">
        <p class="parent-gate__hint" data-testid="parent-gate-hint">{{ hint }}</p>
        <PinPad
          :title="padTitle"
          :value="gate.pin.value"
          :disabled="gate.locked.value"
          :error-message="gate.errorMessage.value"
          :remaining-seconds="gate.remainingSeconds.value"
          :submitting="gate.status.value === 'verifying'"
          @digit="gate.pushDigit"
          @backspace="gate.backspace"
          @setpin="gate.setPin"
          @submit="onSubmit"
        />
      </section>
    </template>
    <BottomReturnButton label="返回" test-id="parent-gate-back" @back="emit('back')" />
  </main>
</template>

<style scoped>
.parent-gate {
  position: relative;
  display: grid;
  gap: var(--ds-space-lg);
  align-content: center;
  max-width: 34rem;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  padding: max(var(--ds-space-xl), env(safe-area-inset-top)) var(--ds-space-lg)
    calc(5rem + env(safe-area-inset-bottom));
  padding-bottom: calc(5rem + env(safe-area-inset-bottom));
  color: var(--ds-text-primary);
}

.parent-gate__header {
  display: grid;
  justify-items: center;
  gap: var(--ds-space-xs);
  text-align: center;
}

.parent-gate__badge {
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  margin-bottom: var(--ds-space-sm);
  border: 1px solid var(--ds-glass-border);
  border-radius: 50%;
  background: linear-gradient(145deg, rgb(41 95 129 / 80%), rgb(14 42 68 / 95%));
  box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
  font-size: 2rem;
}

.parent-gate__subtitle,
.parent-gate__hint,
.parent-gate__loading {
  color: var(--ds-text-secondary);
}

.parent-gate__hint {
  text-align: center;
}

.parent-gate__panel {
  display: grid;
  gap: var(--ds-space-md);
  padding: clamp(var(--ds-space-md), 5vw, var(--ds-space-xl));
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: linear-gradient(145deg, rgb(15 43 69 / 96%), rgb(7 23 42 / 97%));
  box-shadow: var(--ds-shadow-card);
}

.parent-gate__panel :deep(.pin-pad) { display: grid; gap: var(--ds-space-md); }
.parent-gate__panel :deep(.pin-pad__title) { margin: 0; text-align: center; color: var(--ds-text-primary); }
.parent-gate__panel :deep(.pin-pad__field) { display: grid; gap: var(--ds-space-xs); }
.parent-gate__panel :deep(.pin-pad__field-label) { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.parent-gate__panel :deep(.pin-pad__input) { min-height: 3rem; padding: 0 var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: #061426; color: var(--ds-text-primary); font: inherit; }
.parent-gate__panel :deep(.pin-pad__dots) { display: flex; justify-content: center; gap: var(--ds-space-md); }
.parent-gate__panel :deep(.pin-pad__dot) { width: .75rem; height: .75rem; border: 1px solid var(--ds-glow-primary); border-radius: 50%; }
.parent-gate__panel :deep(.pin-pad__dot--filled) { background: var(--ds-glow-primary); }
.parent-gate__panel :deep(.pin-pad__keys) { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ds-space-sm); }
.parent-gate__panel :deep(.pin-pad__key) { min-height: 2.75rem; border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-sm); background: #12304b; color: var(--ds-text-primary); font: inherit; }
.parent-gate__panel :deep(.pin-pad__key--primary) { border: 0; background: var(--ds-accent-gradient); color: var(--ds-on-accent); font-weight: 700; }
.parent-gate__panel :deep(.pin-pad__message) { margin: 0; text-align: center; }
</style>
