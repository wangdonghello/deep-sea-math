import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MistakeImportSection from '@/features/parentPanel/MistakeImportSection.vue'
import type { CustomQuestionRepo } from '@/data/repositories/customQuestionRepo'
import type { Question } from '@/domain/model/types'

function fakeRepo(): CustomQuestionRepo & { saved: Question[] } {
  const saved: Question[] = []
  return {
    saved,
    async listByProfile() { return saved },
    async save(_profileId, questions) { saved.push(...questions) },
    async remove() {},
    async removeByProfile() {},
  }
}

describe('MistakeImportSection', () => {
  it('解析预览并写入所选孩子的自定义题库', async () => {
    const repo = fakeRepo()
    const view = mount(MistakeImportSection, {
      props: { store: repo, profileId: 'profile-a', defaultGrade: 2 },
      global: { stubs: { teleport: true } },
    })

    await view.get('[data-testid="mistake-import-text"]').setValue('题目：3+4=？\n答案：7\n单位：个')
    await view.get('[data-testid="mistake-import-parse"]').trigger('click')
    expect(view.find('[data-testid="mistake-import-preview"]').text()).toContain('3+4=？')

    await view.get('[data-testid="mistake-import-save"]').trigger('click')
    await flushPromises()

    expect(repo.saved).toHaveLength(1)
    expect(repo.saved[0]).toMatchObject({ story: { body: '3+4=？' }, answer: { value: 7 } })
    expect(view.find('[data-testid="mistake-import-message"]').text()).toContain('已导入 1 道题')
  })

  it('没有选择孩子时不能写入', async () => {
    const repo = fakeRepo()
    const view = mount(MistakeImportSection, {
      props: { store: repo, profileId: null },
    })
    await view.get('[data-testid="mistake-import-text"]').setValue('题目：3+4=？\n答案：7')
    await view.get('[data-testid="mistake-import-parse"]').trigger('click')
    expect(view.get('[data-testid="mistake-import-save"]').attributes('disabled')).toBeDefined()
    expect(repo.saved).toHaveLength(0)
  })

  it('拍照识别结果只填入文本框，家长校对后才解析入库', async () => {
    const repo = fakeRepo()
    const recognize = async (_file: Blob, onProgress?: (progress: { status: string; progress: number }) => void) => {
      onProgress?.({ status: '识别中', progress: 0.5 })
      return '题目：3+4=？\n答案：7'
    }
    const view = mount(MistakeImportSection, {
      props: { store: repo, profileId: 'profile-a', recognize },
    })
    const input = view.get('[data-testid="mistake-import-photo"]')
    const file = new File(['fake'], 'photo.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect((view.get('[data-testid="mistake-import-text"]').element as HTMLTextAreaElement).value).toContain('3+4=？')
    expect(repo.saved).toHaveLength(0)
    expect(view.find('[data-testid="mistake-import-preview"]').text()).toContain('3+4=？')
  })

  it('OCR 失败时提示家长改用手动输入，不阻断导入', async () => {
    const view = mount(MistakeImportSection, {
      props: {
        store: fakeRepo(),
        profileId: 'profile-a',
        recognize: async () => { throw new Error('引擎加载失败') },
      },
    })
    const input = view.get('[data-testid="mistake-import-photo"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'x.png', { type: 'image/png' })] })
    await input.trigger('change')
    await flushPromises()

    expect(view.find('[data-testid="mistake-import-ocr-error"]').text()).toContain('引擎加载失败')
    expect(view.find('[data-testid="mistake-import-text"]').exists()).toBe(true)
  })

  it('解析失败的行进入 issues，不静默丢弃', async () => {
    const view = mount(MistakeImportSection, {
      props: { store: fakeRepo(), profileId: 'profile-a' },
    })
    await view.get('[data-testid="mistake-import-text"]').setValue('题目：3+4=？\n答案：不知道')
    await view.get('[data-testid="mistake-import-parse"]').trigger('click')
    await view.get('[data-testid="mistake-import-save"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="mistake-import-issues"]').text()).toContain('数字或算式')
  })
})
