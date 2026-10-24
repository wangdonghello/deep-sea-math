/**
 * 拍照 / 图片 OCR：把家长拍下的错题识别成可编辑文本。
 *
 * 设计取舍：
 * 1. **按需加载**：`tesseract.js` 与中文语言包体积大，只有家长点“识别图片”
 *    才动态 import，不拖慢正常答题；
 * 2. **识别结果只进文本框**：OCR 一定会有错字，家长必须先校对再解析入库；
 *    这里不做任何自动写库；
 * 3. **失败不阻断**：OCR 不可用时抛错，界面回退到“手动输入/粘贴”，
 *    而不是让导入功能整个不可用。
 */

export interface OcrProgress {
  /** 面向家长的状态文本。 */
  readonly status: string
  /** 0–1。 */
  readonly progress: number
}

/** 语言：中文简体 + 英文/数字，覆盖小学数学题干。 */
const LANGUAGES = 'chi_sim+eng'

/** 资源走公开 CDN；worker/core 不进入应用构建产物。 */
const TESSERACT_VERSION = '7.0.0'
const CDN_BASE = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}`

type Worker = {
  recognize: (image: Blob | string) => Promise<{ data: { text: string } }>
  terminate: () => Promise<unknown>
}

let workerPromise: Promise<Worker> | null = null

async function getWorker(onProgress: (progress: OcrProgress) => void): Promise<Worker> {
  if (workerPromise !== null) return workerPromise
  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker(LANGUAGES, 1, {
      workerPath: `${CDN_BASE}/dist/worker.min.js`,
      corePath: `${CDN_BASE}/dist/`,
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      logger: (message: { status?: string; progress?: number }) => {
        onProgress({ status: message.status ?? '识别中', progress: message.progress ?? 0 })
      },
    })
    return worker as unknown as Worker
  })()
  try {
    return await workerPromise
  } catch (error) {
    workerPromise = null
    throw error
  }
}

/** 当前环境是否可能执行 OCR（浏览器有 canvas/Blob）。 */
export function canRecognizeImage(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * 识别一张图片中的文字。
 *
 * @param file 家长选择的图片。
 * @param onProgress 状态回调；用于界面显示“正在加载语言包 / 识别中”。
 * @returns 识别出的纯文本；可能包含换行与错字，调用方必须让家长校对。
 */
export async function recognizeMistakeImage(
  file: Blob,
  onProgress: (progress: OcrProgress) => void = () => undefined,
): Promise<string> {
  if (!canRecognizeImage()) throw new Error('当前环境不支持图片识别，请改用粘贴文本')
  onProgress({ status: '正在准备识别引擎…', progress: 0 })
  const worker = await getWorker(onProgress)
  onProgress({ status: '正在识别图片…', progress: 0.1 })
  const result = await worker.recognize(file)
  onProgress({ status: '识别完成', progress: 1 })
  return result.data.text.trim()
}
