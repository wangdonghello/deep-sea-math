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
import { computed, nextTick, ref } from 'vue'

import { PIN_LENGTH } from './types'

const props = defineProps<{
  /** 当前选中档案的昵称；家长门禁这类无档案场景改用 `title`。 */
  nickname?: string
  /** 显式标题；给定时优先于由 `nickname` 拼出的标题。 */
  title?: string
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
  /** 学生档案页 B 方案：仅使用系统数字键盘，不渲染圆点与屏幕键盘。 */
  inputOnly?: boolean
}>()

const emit = defineEmits<{
  /** 输入一位数字。 */
  (event: 'digit', digit: string): void
  /** 退格。 */
  (event: 'backspace'): void
  /** 整体赋值（掩码输入框的打字/粘贴路径）。 */
  (event: 'setpin', value: string): void
  /** 提交。 */
  (event: 'submit'): void
}>()

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** 掩码输入框；用于把"被过滤掉的输入"从 DOM 里抹回权威值。 */
const inputEl = ref<HTMLInputElement | null>(null)

/** 标题：优先 `title`，其次由昵称拼出，最后退回中性的"密码"。 */
const heading = computed(() => {
  if (props.title !== undefined) return props.title
  return props.nickname === undefined ? '密码' : `${props.nickname}的密码`
})

/**
 * 把 DOM 输入框拉回 `props.value`。
 *
 * 过滤规则**只**在 composable 一处（`useProfileSelect.setPin` /
 * `useParentGate.setPin`）：组件拿不到"这次输入是否被接受"的答案，能做的
 * 只是等 composable 处理完，再把权威值写回框里。少了这一步，被拒的非数字
 * 会作为明文残影留在输入框里，与点数回显对不上。
 */
async function onInput(event: Event): Promise<void> {
  const raw = (event.target as HTMLInputElement).value
  emit('setpin', raw)
  await nextTick()
  if (inputEl.value !== null && inputEl.value.value !== props.value) {
    inputEl.value.value = props.value
  }
}

/** 点的填充状态数组，长度固定为 {@link PIN_LENGTH}。 */
const dots = computed(() =>
  Array.from({ length: PIN_LENGTH }, (_, index) => index < props.value.length),
)
</script>

<template>
  <section class="pin-pad" :data-testid="'pin-pad'">
    <h2 class="pin-pad__title">
      {{ heading }}
    </h2>

    <!--
      掩码输入框：与数字键盘共用的第二条输入路径。
      - `type="password"` 保证明文不回显（点数回显才是给孩子的进度提示）；
      - `inputmode="numeric"` 让手机弹出数字键盘（`maxlength` 只是原生兜底，
        真正的位数约束在 composable 里）；
      - `<label>` 包住输入框，读屏与点标签都能聚焦到它。
    -->
    <label class="pin-pad__field">
      <span class="pin-pad__field-label">密码</span>
      <input
        ref="inputEl"
        class="pin-pad__input"
        data-testid="pin-input"
        type="password"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="PIN_LENGTH"
        :value="value"
        :disabled="disabled || submitting"
        @input="onInput"
        @keydown.enter.prevent="emit('submit')"
      />
    </label>

    <!-- 点数回显：只显示“输了几个”，绝不回显明文 PIN。 -->
    <div
      v-if="!inputOnly"
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

    <button
      v-if="inputOnly"
      type="button"
      class="pin-pad__native-submit"
      data-testid="pin-submit-native"
      :disabled="disabled || value.length !== PIN_LENGTH || submitting"
      @click="emit('submit')"
    >
      {{ submitting ? '正在验证…' : '进入探险' }}
    </button>

    <div v-else class="pin-pad__keys">
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

<style scoped>
.pin-pad { display: grid; gap: var(--ds-space-md); }
.pin-pad__title { margin: 0; color: var(--ds-text-primary); text-align: center; font-size: var(--ds-font-size-body); }
.pin-pad__field { display: grid; gap: var(--ds-space-xs); }
.pin-pad__field-label { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.pin-pad__input { width: 100%; min-height: 3.25rem; padding: 0 var(--ds-space-md); border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-md); background: #061426; color: var(--ds-text-primary); font: inherit; font-size: 1.15rem; letter-spacing: .18em; }
.pin-pad__input:focus { outline: 2px solid var(--ds-glow-primary); outline-offset: 2px; }
.pin-pad__dots { display: flex; justify-content: center; gap: var(--ds-space-md); }
.pin-pad__dot { width: .75rem; height: .75rem; border: 1px solid var(--ds-glow-primary); border-radius: 50%; }
.pin-pad__dot--filled { background: var(--ds-glow-primary); box-shadow: 0 0 10px var(--ds-glass-particle); }
.pin-pad__keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ds-space-sm); }
.pin-pad__key { min-height: 2.9rem; border: 1px solid var(--ds-glass-border); border-radius: var(--ds-radius-sm); background: #12304b; color: var(--ds-text-primary); font: inherit; }
.pin-pad__key--primary { border: 0; background: var(--ds-accent-gradient); color: var(--ds-on-accent); font-weight: 700; }
.pin-pad__key--muted { color: var(--ds-text-muted); }
.pin-pad__key:disabled { opacity: .45; }
.pin-pad__message { margin: 0; text-align: center; }
.pin-pad__native-submit {
  width: 100%;
  min-height: 3.25rem;
  margin-top: var(--ds-space-md);
  border: 0;
  border-radius: var(--ds-radius-pill);
  background: var(--ds-accent-gradient);
  color: var(--ds-on-accent);
  font: inherit;
  font-weight: 700;
}
.pin-pad__native-submit:disabled { opacity: .5; }
</style>
