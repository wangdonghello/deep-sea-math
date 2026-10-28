<script setup lang="ts">
/**
 * 家长区·错题导入（P4）。
 *
 * 只做三件事：接收文本/CSV → 解析预览 → 写入该孩子的自定义题库。
 * OCR 与图片校对作为下一步；这里先把最可控的文本入口做扎实。
 */
import { computed, ref } from 'vue'

import type { CustomQuestionRepo } from '@/data/repositories/customQuestionRepo'
import type { Difficulty, Grade, QuizType } from '@/domain/model/types'
import {
  buildImportedQuestions,
  parseMistakeImportText,
} from '@/features/mistakeImport/parseMistakeImport'
import { canRecognizeImage, recognizeMistakeImage } from '@/features/mistakeImport/ocr'
import type { MistakeImportIssue, MistakeImportRow } from '@/features/mistakeImport/types'

const props = defineProps<{
  /** 自定义题目仓储；缺省时只做预览不落库（组件测试可省略）。 */
  store?: CustomQuestionRepo
  /** 默认年级：由所选孩子决定。 */
  defaultGrade?: Grade
  /** OCR 实现；测试可注入假识别，生产默认用 tesseract.js。 */
  recognize?: typeof recognizeMistakeImage
}>()

const text = ref('')
const grade = ref<Grade>(props.defaultGrade ?? 2)
const type = ref<QuizType>('two-step-app')
const difficulty = ref<Difficulty>(1)
const rows = ref<readonly MistakeImportRow[]>([])
const issues = ref<readonly MistakeImportIssue[]>([])
const savedCount = ref<number | null>(null)
const savedMessage = ref('')
const busy = ref(false)
const photoName = ref('')
const photoUrl = ref('')
const ocrStatus = ref('')
const ocrError = ref('')

const TYPE_OPTIONS: ReadonlyArray<{ id: QuizType; label: string }> = [
  { id: 'add-sub', label: '加减法' },
  { id: 'mul-div', label: '乘除法' },
  { id: 'two-step-app', label: '两步应用题' },
  { id: 'unknown-relation', label: '未知数' },
  { id: 'unit-time-route', label: '时间 / 长度 / 路线' },
  { id: 'pattern-data', label: '规律与排序' },
  { id: 'number-sense', label: '数与运算' },
]

const preview = computed(() => rows.value.slice(0, 20))

function parse(): void {
  savedMessage.value = ''
  savedCount.value = null
  const result = parseMistakeImportText(text.value)
  rows.value = result.rows
  issues.value = result.issues
}

async function onPhoto(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file === undefined) return
  photoName.value = file.name
  if (photoUrl.value !== '') URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = URL.createObjectURL(file)
  ocrError.value = ''
  ocrStatus.value = ''
  try {
    const recognize = props.recognize ?? recognizeMistakeImage
    const recognized = await recognize(file, (progress) => {
      ocrStatus.value = `${progress.status}${progress.progress > 0 ? ` ${Math.round(progress.progress * 100)}%` : ''}`
    })
    // OCR 结果只覆盖文本框，让家长先校对再解析入库。
    text.value = recognized
    ocrStatus.value = '识别完成，请校对后再点“解析预览”'
    parse()
  } catch (error) {
    ocrError.value = error instanceof Error ? error.message : '识别失败，请改用手动输入'
    ocrStatus.value = ''
  } finally {
    input.value = ''
  }
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file === undefined) return
  text.value = await file.text()
  parse()
  input.value = ''
}

async function save(): Promise<void> {
  const profileId = currentProfileId.value
  if (props.store === undefined || profileId === null) {
    savedMessage.value = '当前环境未接入存储，未写入。'
    return
  }
  busy.value = true
  try {
    const built = buildImportedQuestions(rows.value, {
      profileId,
      grade: grade.value,
      type: type.value,
      difficulty: difficulty.value,
      source: text.value.includes(',') ? 'csv' : 'paste',
      now: Date.now(),
    })
    issues.value = built.issues
    await props.store.save(profileId, built.questions)
    savedCount.value = built.questions.length
    savedMessage.value = `已导入 ${built.questions.length} 道题，错题本中会显示。`
  } finally {
    busy.value = false
  }
}

const currentProfileId = defineModel<string | null>('profileId', { default: null })

defineExpose({ parse, save })
</script>

<template>
  <section class="parent-card mistake-import" data-testid="mistake-import">
    <h2>导入错题</h2>
    <p class="mistake-import__hint">
      支持粘贴文本或上传 CSV。每行一题时用竖线分隔：题目 | 答案 | 单位；也可以从电子表格复制表头
      题目,答案,单位,选项A,选项B,选项C,选项D,正确选项。
    </p>

    <label class="mistake-import__field">
      导入到
      <select v-model="currentProfileId" data-testid="mistake-import-profile">
        <option :value="null" disabled>请选择孩子</option>
        <slot name="profile-options" />
      </select>
    </label>

    <div class="mistake-import__row">
      <label>
        年级
        <select v-model.number="grade" data-testid="mistake-import-grade">
          <option :value="1">1 年级</option>
          <option :value="2">2 年级</option>
          <option :value="3">3 年级</option>
        </select>
      </label>
      <label>
        题型
        <select v-model="type" data-testid="mistake-import-type">
          <option v-for="option in TYPE_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
      <label>
        难度
        <select v-model.number="difficulty" data-testid="mistake-import-difficulty">
          <option :value="1">基础</option>
          <option :value="2">进阶</option>
          <option :value="3">挑战</option>
        </select>
      </label>
    </div>

    <textarea
      v-model="text"
      rows="6"
      class="mistake-import__text"
      data-testid="mistake-import-text"
      placeholder="题目：3+4=？
答案：7
单位：个"
    />

    <div class="mistake-import__actions">
      <button type="button" class="parent-button" data-testid="mistake-import-parse" @click="parse">解析预览</button>
      <label class="parent-button mistake-import__file">
        上传 CSV
        <input type="file" accept=".csv,text/csv,text/plain" data-testid="mistake-import-file" @change="onFile">
      </label>
      <label v-if="canRecognizeImage()" class="parent-button mistake-import__file">
        拍照 / 选图片识别
        <input type="file" accept="image/*" capture="environment" data-testid="mistake-import-photo" @change="onPhoto">
      </label>
      <button
        type="button"
        class="parent-button"
        data-testid="mistake-import-save"
        :disabled="busy || rows.length === 0 || currentProfileId === null"
        @click="save"
      >写入错题本</button>
    </div>

    <p v-if="savedMessage" role="status" data-testid="mistake-import-message">{{ savedMessage }}</p>
    <figure v-if="photoUrl !== ''" class="mistake-import__photo">
      <img :src="photoUrl" :alt="photoName" data-testid="mistake-import-photo-preview">
      <figcaption>{{ photoName }}</figcaption>
    </figure>
    <p v-if="ocrStatus" role="status" data-testid="mistake-import-ocr-status">{{ ocrStatus }}</p>
    <p v-if="ocrError" role="alert" data-testid="mistake-import-ocr-error">{{ ocrError }}</p>

    <ul v-if="preview.length > 0" class="mistake-import__preview" data-testid="mistake-import-preview">
      <li v-for="(row, index) in preview" :key="`${index}-${row.body}`">
        <strong>{{ row.body }}</strong>
        <span>答案：{{ row.answer }}{{ row.unit ?? '' }}</span>
      </li>
    </ul>

    <ul v-if="issues.length > 0" class="mistake-import__issues" data-testid="mistake-import-issues">
      <li v-for="issue in issues" :key="`${issue.row}-${issue.message}`">第 {{ issue.row }} 行：{{ issue.message }}</li>
    </ul>
    <p v-if="savedCount !== null" data-testid="mistake-import-count">已写入 {{ savedCount }} 道</p>
  </section>
</template>

<style scoped>
.mistake-import { display: grid; gap: var(--ds-space-sm); }
.mistake-import__hint { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
.mistake-import__row { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); }
.mistake-import__text { width: 100%; min-height: 8rem; padding: var(--ds-space-sm); font: inherit; }
.mistake-import__actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-sm); align-items: center; }
.mistake-import__file input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.mistake-import__preview, .mistake-import__issues { display: grid; gap: 4px; margin: 0; padding-left: 1.25rem; font-size: var(--ds-font-size-caption); }
.mistake-import__preview li { display: flex; justify-content: space-between; gap: var(--ds-space-sm); }
.mistake-import__issues { color: var(--ds-accent-text); }
.mistake-import__photo { margin: 0; display: grid; gap: 4px; }
.mistake-import__photo img { max-width: 100%; max-height: 12rem; object-fit: contain; border-radius: var(--ds-radius-md); }
.mistake-import__photo figcaption { color: var(--ds-text-secondary); font-size: var(--ds-font-size-caption); }
</style>
