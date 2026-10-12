import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { hashPin, verifyPin } from '@/domain/crypto/hashPin'
import type { DomainEvent, Profile } from '@/domain/model/types'
import FamilyOverviewSection from '@/features/parentPanel/FamilyOverviewSection.vue'
import LearningSettingsSection from '@/features/parentPanel/LearningSettingsSection.vue'
import ProfileManageSection from '@/features/parentPanel/ProfileManageSection.vue'

import { syncSha256 } from '../profileSelect/manualClock'
import { makeParentStore } from './makeParentStore'

const SALT = 'ab'.repeat(16)

const profiles: Profile[] = [
  { id: 'a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'h', salt: 's', createdAt: 1 },
  { id: 'b', nickname: '珊瑚', avatarId: 'avatar-2', pinHash: 'h', salt: 's', createdAt: 1 },
]

const events: DomainEvent[] = [
  { type: 'session-started', eventId: 's1', profileId: 'a', occurredAt: 1000, sessionId: 'q-a', questionIds: ['a1', 'a2'], difficultyTrace: [1] },
  { type: 'answer-submitted', eventId: 'e1', profileId: 'a', occurredAt: 2000, sessionId: 'q-a', questionId: 'a1', submitted: '1', correct: true, usedHintLevel: 0, retryCount: 0, ms: 1000 },
  { type: 'answer-submitted', eventId: 'e2', profileId: 'a', occurredAt: 3000, sessionId: 'q-a', questionId: 'a2', submitted: '1', correct: true, usedHintLevel: 1, retryCount: 0, ms: 3000 },
]

const questionTypeById = { a1: 'add-sub', a2: 'mul-div' } as const

describe('views: 家长区三区页面', () => {
  it('总览：每个孩子一张卡片，显示投影出的完成题数与平均用时，点击进入该孩子设置', async () => {
    const fake = makeParentStore({ profiles, events })
    const wrapper = mount(FamilyOverviewSection, {
      props: { store: fake.store, clock: () => 5000, questionTypeById },
    })
    await flushPromises()

    expect(wrapper.findAll('[data-testid^="child-card-"]')).toHaveLength(2)
    const cardA = wrapper.get('[data-testid="child-card-a"]')
    expect(cardA.text()).toContain('海星')
    expect(cardA.get('[data-testid="child-completed"]').text()).toBe('2')
    expect(cardA.get('[data-testid="child-average"]').text()).toBe('2.0')
    expect(cardA.get('[data-testid="child-hint"]').text()).toContain('乘除法')

    await cardA.trigger('click')
    expect(wrapper.emitted('open-child')?.[0]).toEqual(['a'])
  })

  it('总览：没有孩子时给出前往建档的引导', async () => {
    const wrapper = mount(FamilyOverviewSection, { props: { store: makeParentStore().store, clock: () => 5000 } })
    await flushPromises()

    expect(wrapper.get('[data-testid="overview-empty"]').text()).toContain('档案管理')
    await wrapper.get('[data-testid="overview-goto-manage"]').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['manage'])
  })

  it('设置与报告：切换孩子后表单与报告跟着换人，保存设置写入 settings-updated', async () => {
    const fake = makeParentStore({ profiles, events })
    const wrapper = mount(LearningSettingsSection, {
      props: { store: fake.store, defaultProfileId: 'a', clock: () => 5000, questionTypeById },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="report-completed"]').text()).toBe('2')

    await wrapper.get('[data-testid="settings-child-select"]').setValue('b')
    await flushPromises()
    expect(wrapper.get('[data-testid="report-completed"]').text()).toBe('0')

    await wrapper.get('[data-testid="settings-form"]').trigger('submit')
    await flushPromises()
    expect(fake.appended.some((event) => event.type === 'settings-updated' && event.profileId === 'b')).toBe(true)
  })

  it('设置与报告：缺题型表时显示"题型掌握分布暂不可用"', async () => {
    const fake = makeParentStore({ profiles, events })
    const wrapper = mount(LearningSettingsSection, { props: { store: fake.store, defaultProfileId: 'a', clock: () => 5000 } })
    await flushPromises()

    expect(wrapper.get('[data-testid="topic-mastery-unavailable"]').text()).toBe('题型掌握分布暂不可用')
  })

  it('档案管理：创建档案后回到列表可见', async () => {
    const fake = makeParentStore()
    const wrapper = mount(ProfileManageSection, { props: { store: fake.store, clock: () => 5000 } })
    await flushPromises()

    const form = wrapper.get('[data-testid="create-profile"]')
    const inputs = form.findAll('input')
    await inputs.at(0)!.setValue('新同学')
    await inputs.at(4)!.setValue('0427')
    await inputs.at(5)!.setValue('0427')
    await form.trigger('submit')
    await vi.waitFor(() => { expect(fake.profiles.size).toBe(1) })

    expect(wrapper.text()).toContain('新同学')
  })

  it('档案管理：重置 PIN 后旧 PIN 失效、新 PIN 可用', async () => {
    const oldHash = await hashPin('1111', SALT, syncSha256)
    const fake = makeParentStore({ profiles: [{ id: 'a', nickname: '海星', avatarId: 'avatar-1', pinHash: oldHash, salt: SALT, createdAt: 1 }] })
    const wrapper = mount(ProfileManageSection, { props: { store: fake.store, defaultProfileId: 'a', clock: () => 5000 } })
    await flushPromises()

    await wrapper.get('[data-testid="manage-toggle-a"]').trigger('click')
    await flushPromises()
    const danger = wrapper.get('[data-testid="danger-zone"]')
    const inputs = danger.findAll('input')
    await inputs.at(0)!.setValue('2222')
    await inputs.at(1)!.setValue('2222')
    await danger.get('form').trigger('submit')
    await vi.waitFor(async () => {
      const updated = fake.profiles.get('a')!
      expect(await verifyPin('2222', updated.salt, updated.pinHash)).toBe(true)
    })

    const updated = fake.profiles.get('a')!
    expect(await verifyPin('1111', updated.salt, updated.pinHash)).toBe(false)
  })

  it('档案管理：删除需勾选并输入昵称，成功后孩子消失且其数据被清理', async () => {
    const fake = makeParentStore({ profiles })
    const wrapper = mount(ProfileManageSection, { props: { store: fake.store, defaultProfileId: 'a', clock: () => 5000 } })
    await flushPromises()

    await wrapper.get('[data-testid="manage-toggle-a"]').trigger('click')
    await flushPromises()
    const danger = wrapper.get('[data-testid="danger-zone"]')
    const inputs = danger.findAll('input')
    await inputs.at(2)!.setValue(true)
    await flushPromises()
    await inputs.at(3)!.setValue('海星')
    await danger.findAll('button').at(1)!.trigger('click')
    await flushPromises()

    expect(fake.profiles.has('a')).toBe(false)
    expect(fake.removed).toContain('events')
    expect(wrapper.find('[data-testid="manage-toggle-a"]').exists()).toBe(false)
  })

  it('降级：本机暂存时三页都渲染警示条', async () => {
    const fake = makeParentStore({ profiles, events, degraded: true })
    const pages = [
      mount(FamilyOverviewSection, { props: { store: fake.store, clock: () => 5000 } }),
      mount(LearningSettingsSection, { props: { store: fake.store, defaultProfileId: 'a', clock: () => 5000 } }),
      mount(ProfileManageSection, { props: { store: fake.store, defaultProfileId: 'a', clock: () => 5000 } }),
    ]
    await flushPromises()
    for (const page of pages) {
      expect(page.get('[data-testid="storage-warning"]').text()).toContain('本机暂存')
      expect(page.text()).not.toContain('storage unavailable')
    }
  })

  it('导航：当前页高亮，点击其他页发射对应功能区 id', async () => {
    const fake = makeParentStore({ profiles, events })
    const wrapper = mount(FamilyOverviewSection, { props: { store: fake.store, clock: () => 5000 } })
    await flushPromises()

    expect(wrapper.get('[data-testid="parent-nav-overview"]').attributes('aria-current')).toBe('page')
    expect(wrapper.get('[data-testid="parent-nav-settings"]').attributes('aria-current')).toBeUndefined()
    await wrapper.get('[data-testid="parent-nav-settings"]').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['settings'])
  })

  it('不泄露：建档填入的 PIN 明文不出现在渲染文本与脱敏日志里', async () => {
    const logs: Record<string, unknown>[] = []
    const fake = makeParentStore({ profiles: [{ id: 'a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'safe-hash', salt: 'private-salt', createdAt: 1 }] })
    const wrapper = mount(ProfileManageSection, { props: { store: fake.store, clock: () => 5000, logger: (entry) => logs.push(entry) } })
    await flushPromises()

    const form = wrapper.get('[data-testid="create-profile"]')
    const inputs = form.findAll('input')
    await inputs.at(0)!.setValue('新同学')
    await inputs.at(4)!.setValue('0427')
    await inputs.at(5)!.setValue('0427')
    await form.trigger('submit')
    await vi.waitFor(() => { expect(fake.profiles.size).toBe(1) })

    expect(wrapper.text()).not.toContain('0427')
    expect(wrapper.text()).not.toContain('safe-hash')
    expect(wrapper.text()).not.toContain('private-salt')
    expect(JSON.stringify(logs)).not.toContain('0427')
  })
})
