import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SubjectTabs from '@/features/home/SubjectTabs.vue'

describe('SubjectTabs', () => {
  it('切换学科 emit change', async () => {
    const view = mount(SubjectTabs, { props: { active: 'math' } })
    await view.get('[data-testid="subject-chinese"]').trigger('click')
    expect(view.emitted('change')?.[0]).toEqual(['chinese'])
  })
})
