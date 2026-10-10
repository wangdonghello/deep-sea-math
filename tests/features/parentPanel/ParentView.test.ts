import { flushPromises, mount } from '@vue/test-utils'

import ParentView from '@/views/ParentView.vue'
import type { ParentStore } from '@/features/parentPanel/types'

function createStore(degraded = false, withProfile = false): ParentStore {
  const profile = { id: 'child-a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'safe-hash', salt: 'private-salt', createdAt: 1 }
  return {
    degraded,
    degradedReason: degraded ? 'storage unavailable' : null,
    profiles: { list: async () => withProfile ? [profile] : [], get: async () => withProfile ? profile : undefined, save: async () => undefined, remove: async () => undefined },
    events: { listByProfile: async () => [], append: async (events) => [...events], removeByProfile: async () => undefined },
    settings: { get: async () => ({ basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 }), save: async () => undefined, remove: async () => undefined },
    bestiary: { remove: async () => undefined },
  }
}

describe('ParentView', () => {
  it('shows the degraded-storage warning persistently without exposing an error detail', () => {
    const wrapper = mount(ParentView, { props: { store: createStore(true), profileId: null } })

    expect(wrapper.get('[data-testid="storage-warning"]').text()).toContain('本机暂存')
    expect(wrapper.text()).not.toContain('storage unavailable')
  })

  it('offers first-run profile creation with only nickname, avatar, and PIN fields', () => {
    const wrapper = mount(ParentView, { props: { store: createStore(), profileId: null } })

    expect(wrapper.findAll('[data-testid="create-profile"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('仅在本机提供管理功能')
    const fieldLabels = wrapper.get('[data-testid="create-profile"]').findAll('label').map((label) => label.text()).join(' ')
    expect(fieldLabels).not.toMatch(/学校|电话|位置|真实姓名/)
  })

  it('renders reports and destructive controls without exposing stored PIN material', async () => {
    const wrapper = mount(ParentView, { props: { store: createStore(false, true), profileId: 'child-a' } })
    await flushPromises()
    expect(wrapper.findAll('[data-testid="report-panel"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="danger-zone"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('safe-hash')
    expect(wrapper.text()).not.toContain('private-salt')
  })
})
