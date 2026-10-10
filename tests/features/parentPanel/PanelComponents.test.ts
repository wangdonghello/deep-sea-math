import { mount } from '@vue/test-utils'
import SettingsForm from '@/features/parentPanel/SettingsForm.vue'
import ReportPanel from '@/features/parentPanel/ReportPanel.vue'
import DangerZone from '@/features/parentPanel/DangerZone.vue'
import type { ParentReport } from '@/features/parentPanel/types'

describe('parent panel components', () => {
  it('emits edited settings and saves only on submit', async () => {
    const wrapper = mount(SettingsForm, { props: { settings: { basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 } } })
    await wrapper.find('input').setValue('4')
    expect(wrapper.emitted('update:settings')?.[0][0]).toMatchObject({ basicCount: 4 })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('shows report metrics and emits the requested date range', async () => {
    const report: ParentReport = { completedQuestions: 3, averageMs: 1500, hintCount: 2, masteryByTopic: {
      'add-sub': { independent: 2 }, 'mul-div': {}, 'two-step-app': {}, 'unknown-relation': {}, 'unit-time-route': {}, 'pattern-data': {},
    } }
    const wrapper = mount(ReportPanel, { props: { report, period: '7days' } })
    expect(wrapper.get('[data-testid="report-completed"]').text()).toBe('3')
    expect(wrapper.get('[data-testid="report-average"]').text()).toContain('1500')
    await wrapper.get('select').setValue('today')
    expect(wrapper.emitted('update:period')?.[0]).toEqual(['today'])
  })

  it('explains that maxMinutes is saved now and consumed by the home estimate later', () => {
    const wrapper = mount(SettingsForm, { props: { settings: { basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 } } })
    expect(wrapper.get('[data-testid="settings-form"]').text())
      .toContain('时长上限将用于首页预估用时与后续答题计时；当前阶段先保存设置。')
  })

  it('shows a placeholder instead of silent zeros when the question type table is unavailable', async () => {
    const report: ParentReport = {
      completedQuestions: 0, averageMs: 0, hintCount: 0, topicMasteryAvailable: false,
      masteryByTopic: { 'add-sub': {}, 'mul-div': {}, 'two-step-app': {}, 'unknown-relation': {}, 'unit-time-route': {}, 'pattern-data': {} },
    }
    const wrapper = mount(ReportPanel, { props: { report, period: '7days' } })
    expect(wrapper.get('[data-testid="topic-mastery-unavailable"]').text()).toBe('题型掌握分布暂不可用')
    expect(wrapper.find('ul').exists()).toBe(false)

    await wrapper.setProps({ report: { ...report, topicMasteryAvailable: true, completedQuestions: 3 } })
    expect(wrapper.find('[data-testid="topic-mastery-unavailable"]').exists()).toBe(false)
    expect(wrapper.find('ul').exists()).toBe(true)
  })

  it('requires confirmation before exposing a usable delete action and emits reset requests', async () => {
    const wrapper = mount(DangerZone, { props: {
      profileNickname: '海星', resetPin: '', confirmResetPin: '', deleteNickname: '', confirmDelete: false, deleted: false,
    } })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('reset-pin')).toHaveLength(1)
    expect((wrapper.findAll('button').at(1)?.element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.findAll('input').at(2)!.setValue(true)
    await wrapper.setProps({ confirmDelete: true })
    await wrapper.findAll('input').at(3)!.setValue('海星')
    await wrapper.findAll('button').at(1)!.trigger('click')
    expect(wrapper.emitted('update:confirmDelete')?.[0]).toEqual([true])
    expect(wrapper.emitted('delete-profile')).toHaveLength(1)
  })
})
