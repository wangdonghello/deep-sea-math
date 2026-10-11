<script setup lang="ts">
/**
 * PIN 盘（design §4 `ProfileSelectView` 的组成组件之二）。
 *
 * 本组件只做**输入与展示**：有几个按键就发几个事件，锁定/错误/进度全部由
 * props 传入。它不知道 5 次锁定规则，也不知道倒计时怎么算 —— 那些都在
 * `usePinLock` / `useProfileSelect` 里。
 *
 * 无障碍取向：错误提示与倒计时用 `role="status"` + `aria-live` 播报，
 * 让孩子在不看屏幕时也能听见"再试一次 / 还需等 N 秒"。
 */
import { computed } from 'vue'

import { PIN_LENGTH } from './types'

const props = defineProps<{
  /** 当前选中档案的昵称（PIN 盘标题）。 */
  nickname: string
  /** 已输入的 PIN（用于渲染点数，MUST NOT 回显明文）。 */
  value: string
  /** 是否禁用输入（锁定期）。 */
  disabled: boolean
  /** 错误提示文案；为空串表示无错。 */
  errorMessage: string
  /** 剩余解锁秒数；仅在锁定时由父级传入并在模板中展示。 */
  remainingSeconds: number
  /** 是否提交中（等待 verify 返回）。 */
  submitting: boolean
}>()

const emit = defineEmits<{
  /** 输入一位数字。 */
  (event: 'digit', digit: string): void
  /** 退格。 */
  (event: 'backspace'): void
  /** 提交。 */
  (event: 'submit'): void
}>()

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** 点的填充状态数组，长度固定为 {@link PIN_LENGTH}。 */
const dots = computed(() =>
  Array.from({ length: PIN_LENGTH }, (_, index) => index < props.value.length),
)
</script>

<template>
  <section class="pin-pad" :data-testid="'pin-pad'">
    <h2 class="pin-pad__title">
      {{ nickname }}的密码
    </h2>

    <!-- 点数回显：只显示“输了几个”，绝不回显明文 PIN。 -->
    <div
      class="pin-pad__dots"
      :data-testid="'pin-dots'"
      :data-filled="value.length"
      role="img"
      :aria-label="`已输入 ${value.length} 位，共 ${PIN_LENGTH} 位`"
    >
      <span
        v-for="(filled, index) in dots"
        :key="index"
        class="pin-pad__dot"
        :class="{ 'pin-pad__dot--filled': filled }"
        :data-testid="`pin-dot-${index}`"
      />
    </div>

    <!--
      错误 / 锁定提示。
      spec `child-profiles` §PIN 错误：MUST NOT 展示具体错因，文案统一是
      "再试一次"。锁定态额外给出剩余秒数，两个状态共用同一处出口。
    -->
    <p
      v-if="errorMessage !== ''"
      class="pin-pad__message pin-pad__message--error"
      :data-testid="'pin-error'"
      role="status"
      aria-live="polite"
    >
      {{ errorMessage }}
    </p>
    <p
      v-if="disabled"
      class="pin-pad__message pin-pad__message--locked"
      :data-testid="'pin-lock-countdown'"
      role="status"
      aria-live="polite"
    >
      请等 {{ remainingSeconds }} 秒后再试
    </p>

    <div class="pin-pad__keys">
      <button
        v-for="key in keys"
        :key="key"
        type="button"
        class="pin-pad__key"
        :data-testid="`pin-key-${key}`"
        :disabled="disabled || submitting"
        @click="emit('digit', key)"
      >
        {{ key }}
      </button>

      <button
        type="button"
        class="pin-pad__key pin-pad__key--muted"
        :data-testid="'pin-backspace'"
        :disabled="disabled || submitting"
        aria-label="退格"
        @click="emit('backspace')"
      >
        ←
      </button>
      <button
        type="button"
        class="pin-pad__key"
        :data-testid="'pin-key-0'"
        :disabled="disabled || submitting"
        @click="emit('digit', '0')"
      >
        0
      </button>
      <button
        type="button"
        class="pin-pad__key pin-pad__key--primary"
        :data-testid="'pin-submit'"
        :disabled="disabled || value.length !== PIN_LENGTH || submitting"
        @click="emit('submit')"
      >
        {{ submitting ? '…' : '确定' }}
      </button>
    </div>
  </section>
</template>
