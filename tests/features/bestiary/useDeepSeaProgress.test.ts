import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import type { DomainEvent } from '@/domain/model/types'
import { useDeepSeaProgress } from '@/features/bestiary/useDeepSeaProgress'

function completed(sessionId: string, profileId = 'p1'): DomainEvent {
  return {
    eventId: `e-${sessionId}`, profileId, occurredAt: 1,
    type: 'session-completed', sessionId, rewards: [],
  }
}

function harness(events: readonly DomainEvent[]) {
  let state!: ReturnType<typeof useDeepSeaProgress>
  const store = { async listEvents() { return events } }
  const wrapper = mount(defineComponent({
    setup() {
      state = useDeepSeaProgress({ store, profileId: ref('p1') })
      return () => h('div')
    },
  }))
  return { state, wrapper }
}

describe('useDeepSeaProgress', () => {
  it('counts completed sessions and maps to ten stages', async () => {
    const { state, wrapper } = harness([completed('s1'), completed('s2'), completed('s3')])
    await flushPromises()
    expect(state.progress.value.completedStages).toBe(3)
    expect(state.progress.value.unlockedZoneIds).toEqual(['twilight', 'midnight'])
    wrapper.unmount()
  })

  it('ignores duplicate session completions and other profiles', async () => {
    const { state, wrapper } = harness([
      completed('s1'), completed('s1'), completed('s2', 'someone-else'),
    ])
    await flushPromises()
    expect(state.progress.value.completedStages).toBe(1)
    wrapper.unmount()
  })
})
