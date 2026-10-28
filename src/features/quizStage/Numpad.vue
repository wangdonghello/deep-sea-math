<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '+', '−', '×', '÷']

function press(key: string): void {
  emit('update:modelValue', props.modelValue + key.replace('−', '-'))
}

function backspace(): void {
  emit('update:modelValue', props.modelValue.slice(0, -1))
}
</script>

<template>
  <div class="numpad" data-testid="numpad" aria-label="数字键盘">
    <button v-for="key in keys" :key="key" type="button" :data-key="key" @click="press(key)">
      {{ key }}
    </button>
    <button type="button" data-key="backspace" aria-label="退格" @click="backspace">⌫</button>
  </div>
</template>

<style scoped>
.numpad { display: grid; grid-template-columns: repeat(4, minmax(3rem, 1fr)); gap: .5rem; }
.numpad button { min-height: 3rem; border: 0; border-radius: .75rem; background: var(--color-panel, #17365b); color: var(--color-text, #fff); font-size: 1.25rem; }
</style>
