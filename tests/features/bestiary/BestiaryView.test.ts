import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/bestiary/CreatureModelViewer.vue', () => ({
  __esModule: true,
  name: 'CreatureModelViewer',
  __isTeleport: false,
  __isSuspense: false,
  __isKeepAlive: false,
  __isTransition: false,
  default: defineComponent({
    name: 'CreatureModelViewer',
    props: ['asset', 'thumbnail'],
    render() {
      return h('div', {
        'data-testid': 'creature-model-viewer',
        'data-model-ref': (this as { asset: { ref: string } }).asset.ref,
        'data-thumbnail': (this as { thumbnail?: boolean }).thumbnail === true ? 'true' : 'false',
      })
    },
  }),
}))

import BestiaryView from '@/views/BestiaryView.vue'
import MapView from '@/views/MapView.vue'
import ObservationView from '@/views/ObservationView.vue'
import { CREATURE_BANK } from '@/data/content'
import type { DomainEvent } from '@/domain/model/types'
import type { BestiaryStore } from '@/features/bestiary/types'
import { ZONES } from '@/features/home/zones'
import { overlapsZone } from '@/features/bestiary/zoneFilter'
import { depthRangeLabel } from '@/features/bestiary/depthRangeLabel'

const creature = CREATURE_BANK.creatures[0]
const unlocked: DomainEvent = {
  eventId: 'unlock-angler', profileId: 'profile-a', occurredAt: 1,
  type: 'unlock-granted', kind: 'creature', targetId: creature.id, reason: 'quest-1',
}

describe('bestiary zone filtering', () => {
  it('prefixes displayed depth intervals with approximate wording', () => {
    expect(depthRangeLabel(creature)).toBe('约 100–4,500 米')
  })

  it('allows a species depth range to appear in every intersecting zone', () => {
    const spanningSpecies = { depthRange: { min: 900, max: 6500 } }
    expect(ZONES.filter((zone) => overlapsZone(spanningSpecies, zone)).map((zone) => zone.id))
      .toEqual(['twilight', 'midnight', 'abyss', 'hadal'])
    expect(overlapsZone({ depthRange: { min: 20, max: 100 } }, ZONES[0])).toBe(false)
  })

  it('includes creatures touching either finite zone boundary', () => {
    for (const zone of ZONES.filter(({ min, max }) => min !== null && max !== null)) {
      expect(overlapsZone({ depthRange: { min: zone.min!, max: zone.min! } }, zone)).toBe(true)
      expect(overlapsZone({ depthRange: { min: zone.max!, max: zone.max! } }, zone)).toBe(true)
    }
    expect(overlapsZone({ depthRange: { min: 6000, max: 6000 } }, ZONES[3])).toBe(true)
  })
})

function store(events: readonly DomainEvent[]): BestiaryStore {
  return { async listEvents(profileId) { return events.filter((event) => event.profileId === profileId) } }
}

describe('BestiaryView', () => {
  it('filters by each teaching zone using overlapping depth ranges', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()
    expect(view.text()).toContain('教学区域筛选，不代表唯一栖息区归属')

    for (const zone of ZONES) {
      await view.get(`button[aria-label="筛选${zone.name}"]`).trigger('click')
      const expectedIds = CREATURE_BANK.creatures
        .filter((entry) => entry.depthRange.min <= (zone.max ?? Infinity) && entry.depthRange.max >= (zone.min ?? 0))
        .map((entry) => entry.id)
      const shownIds = view.findAll('[data-testid^="creature-card-"]')
        .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
      expect(shownIds).toEqual(expectedIds)
    }
  })

  it('restores the complete creature list when the all-regions filter is selected', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()

    const allCreatureIds = CREATURE_BANK.creatures.map((entry) => entry.id)
    await view.get(`button[aria-label="筛选${ZONES[0].name}"]`).trigger('click')
    const filteredCreatureIds = view.findAll('[data-testid^="creature-card-"]')
      .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
    expect(filteredCreatureIds).not.toEqual(allCreatureIds)

    await view.get('button[aria-label="筛选全部区域"]').trigger('click')
    const restoredCreatureIds = view.findAll('[data-testid^="creature-card-"]')
      .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
    expect(restoredCreatureIds).toEqual(allCreatureIds)
  })

  it('keeps locked creatures as silhouettes without loading their artwork', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()

    expect(view.text()).toContain('继续下潜解锁')
    expect(view.find('[data-testid="creature-silhouette"]').exists()).toBe(true)
    expect(view.find('img').exists()).toBe(false)
  })

  it('shows the empty-state message when the hadal zone has no creature records', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()
    await view.get(`button[aria-label="筛选${ZONES[3].name}"]`).trigger('click')

    expect(view.text()).toContain('这个教学区域暂无对应记录')
    expect(view.findAll('[data-testid^="creature-card-"]')).toHaveLength(0)
  })

  it('shows unlocked content by replaying only the requested profile events', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([unlocked]) } })
    await flushPromises()

    expect(view.text()).toContain(creature.name)
    const card = view.find(`[data-testid="creature-card-${creature.id}"]`)
    expect(card.find('[data-testid="creature-silhouette"]').exists()).toBe(false)
    // 图鉴卡片与观察舱用同一份 3D 模型（缩略图模式），不再退回 2D 插画
    expect(card.find('[data-testid="creature-model-viewer"]').attributes('data-thumbnail')).toBe('true')
  })

  it('does not expose an unlock belonging to a different profile', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-b', store: store([unlocked]) } })
    await flushPromises()

    expect(view.text()).toContain('继续下潜解锁')
    expect(view.text()).not.toContain(creature.name)
  })

  it('reloads locked records after switching profiles', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([unlocked]) } })
    await flushPromises()
    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(true)

    await view.setProps({ profileId: 'profile-b' })
    await flushPromises()

    expect(view.find('[data-testid="creature-silhouette"]').exists()).toBe(true)
    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(false)
  })

  it('clears the previous profile while the next profile is loading', async () => {
    let resolveB!: (events: readonly DomainEvent[]) => void
    const pendingB = new Promise<readonly DomainEvent[]>((resolve) => { resolveB = resolve })
    const switchingStore: BestiaryStore = {
      listEvents: (profileId) => profileId === 'profile-a' ? Promise.resolve([unlocked]) : pendingB,
    }
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: switchingStore } })
    await flushPromises()
    await view.setProps({ profileId: 'profile-b' })

    expect(view.find('[role="status"]').text()).toContain('正在读取图鉴')
    expect(view.find('[data-testid="creature-illustration"]').exists()).toBe(false)
    resolveB([])
    await flushPromises()
    expect(view.find('[data-testid="creature-silhouette"]').exists()).toBe(true)
  })

  it('clears profile records when the profile becomes null', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([unlocked]) } })
    await flushPromises()

    await view.setProps({ profileId: null })

    expect(view.find('[data-testid="creature-illustration"]').exists()).toBe(false)
    expect(view.text()).toContain('还没有可查看的生物')
  })

  it('does not let a late response from the previous profile overwrite the new one', async () => {
    let resolveA!: (events: readonly DomainEvent[]) => void
    const lateA = new Promise<readonly DomainEvent[]>((resolve) => { resolveA = resolve })
    const delayed: BestiaryStore = {
      listEvents: (profileId) => profileId === 'profile-a' ? lateA : Promise.resolve([]),
    }
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: delayed } })
    await view.setProps({ profileId: 'profile-b' })
    await flushPromises()
    expect(view.find('[data-testid="creature-silhouette"]').exists()).toBe(true)

    resolveA([unlocked])
    await flushPromises()

    expect(view.find('[data-testid="creature-silhouette"]').exists()).toBe(true)
    expect(view.find('[data-testid="creature-illustration"]').exists()).toBe(false)
  })

  it('emits the selected unlocked creature id for observation navigation', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([unlocked]) } })
    await flushPromises()
    await view.get(`[data-testid="creature-card-${creature.id}"] button:not([data-testid="creature-zoom-toggle"])`).trigger('click')

    expect(view.emitted('observe')).toEqual([[creature.id]])
  })

  it('shows a neutral error state when event history cannot be read', async () => {
    const broken: BestiaryStore = { async listEvents() { throw new Error('private storage path') } }
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: broken } })
    await flushPromises()

    expect(view.find('[data-testid="bestiary-error"]').exists()).toBe(true)
    expect(view.text()).not.toContain('private storage path')
  })
})

describe('ObservationView', () => {
  it('renders audited facts, 3–5 knowledge cards, sources, caveats, and licensed model attribution', async () => {
    const view = mount(ObservationView, { props: { creature } })
    await flushPromises()
    expect(view.text()).toContain(creature.scientificName)
    expect(view.text()).toContain('约 100–4,500 米')
    expect(view.text()).toContain(creature.habitat)
    expect(view.find('[data-testid="creature-model-viewer"]').attributes('data-model-ref')).toBe(creature.model?.ref)
    expect(view.text()).toContain(creature.model?.note)
    expect(view.text()).toContain(creature.model?.attribution)
    expect(view.find(`a[href="${creature.model?.sourceUrl}"]`).exists()).toBe(true)
    expect(view.text()).toContain('不是唯一分布')
    expect(view.findAll('[data-testid="knowledge-card"]')).toHaveLength(creature.knowledgeCards.length)
    for (const source of creature.sources) expect(view.find(`a[href="${source}"]`).exists()).toBe(true)
  })

  it('uses interval wording for the observed depth of every bank creature', () => {
    for (const entry of CREATURE_BANK.creatures) {
      const view = mount(ObservationView, { props: { creature: entry } })
      expect(view.text()).toContain('活动深度范围：')
      expect(view.text()).toMatch(/约 \d[\d,.]*–\d[\d,.]* 米/)
      expect(view.text()).toContain(entry.habitat)
    }
  })

  it('shows every real bank body-size record with its source measurement basis and caveat', () => {
    for (const entry of CREATURE_BANK.creatures) {
      const view = mount(ObservationView, { props: { creature: entry } })

      expect(view.text()).toContain('记录/最大体型')
      expect(view.text()).toContain(entry.bodySize)
      expect(view.text()).toMatch(/不是每头个体的恒定值/)
      expect(entry.bodySize).toMatch(/最大(?:体长|标准体长|外套膜长)/)
      expect(entry.bodySize).toMatch(/(TL|SL|ML)/)
      for (const source of entry.sources) expect(view.find(`a[href="${source}"]`).exists()).toBe(true)
    }
  })

  it('states the body size of every bank creature as a maximum record, never a per-individual constant', () => {
    for (const entry of CREATURE_BANK.creatures) {
      const view = mount(ObservationView, { props: { creature: entry } })

      expect(view.text()).toContain(entry.bodySize)
      expect(view.text()).toContain('每头个体')
    }
  })
})

describe('MapView', () => {
  it('shows a loading status before rendering map data, then becomes ready', async () => {
    let resolveEvents!: (events: readonly DomainEvent[]) => void
    const pendingEvents = new Promise<readonly DomainEvent[]>((resolve) => { resolveEvents = resolve })
    const pendingStore: BestiaryStore = { listEvents: () => pendingEvents }
    const view = mount(MapView, { props: { profileId: 'profile-a', store: pendingStore } })

    expect(view.find('[role="status"]').text()).toContain('正在读取地图')
    expect(view.find('[data-testid="zone-base"]').exists()).toBe(false)
    expect(view.find('[data-testid^="zone-"]').exists()).toBe(false)

    resolveEvents([])
    await flushPromises()

    expect(view.find('[role="status"]').exists()).toBe(false)
    expect(view.find('[data-testid="zone-base"]').exists()).toBe(true)
    expect(view.findAll('[data-testid^="zone-"]')).toHaveLength(5)
  })

  it('asks for a profile instead of showing the base when no profile is selected', async () => {
    const view = mount(MapView, { props: { profileId: null, store: store([]) } })
    await flushPromises()

    expect(view.find('[data-testid="map-no-profile"]').text()).toContain('请先选择学习档案')
    expect(view.find('[data-testid="zone-base"]').exists()).toBe(false)
    expect(view.find('[data-testid="zone-twilight"]').exists()).toBe(false)
  })

  it('hides the base and zones once the active profile is cleared', async () => {
    const view = mount(MapView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()
    expect(view.find('[data-testid="zone-base"]').exists()).toBe(true)

    await view.setProps({ profileId: null })
    await flushPromises()

    expect(view.find('[data-testid="map-no-profile"]').exists()).toBe(true)
    expect(view.find('[data-testid="zone-base"]').exists()).toBe(false)
    expect(view.find('[data-testid^="zone-"]').exists()).toBe(false)
  })

  it('shows the base and four interval zones without inventing zone unlocks', async () => {
    const creatureOnly: DomainEvent = { ...unlocked, targetId: 'johnson-anglerfish' }
    const view = mount(MapView, { props: { profileId: 'profile-a', store: store([creatureOnly]) } })
    await flushPromises()

    expect(view.find('[data-testid="zone-base"]').exists()).toBe(true)
    expect(view.find('[data-testid="zone-base"]').attributes('data-current')).toBe('true')
    expect(view.findAll('[data-testid^="zone-"]')).toHaveLength(5)
    expect(view.text()).toContain('约 200–1,000 米')
    expect(view.text()).toContain('约 6,000 米以下')
    expect(view.text()).toContain('已知记录/教学区域范围')
    expect(view.text()).toContain('不是物种唯一分布')
    expect(view.find('[data-testid="zone-twilight"]').attributes('data-unlocked')).toBe('false')
  })

  it('marks a region current only when its zone unlock exists in replay', async () => {
    const zone: DomainEvent = {
      eventId: 'unlock-zone', profileId: 'profile-a', occurredAt: 2,
      type: 'unlock-granted', kind: 'zone', targetId: 'twilight', reason: 'quest-2',
    }
    const view = mount(MapView, { props: { profileId: 'profile-a', store: store([zone]) } })
    await flushPromises()

    expect(view.find('[data-testid="zone-twilight"]').attributes('data-unlocked')).toBe('true')
    expect(view.find('[data-testid="zone-twilight"]').attributes('data-current')).toBe('true')
    expect(view.find('[data-testid="zone-base"]').attributes('data-current')).toBe('false')
  })

  it('does not present a failed event read as a valid all-locked map', async () => {
    const broken: BestiaryStore = { async listEvents() { throw new Error('local path') } }
    const view = mount(MapView, { props: { profileId: 'profile-a', store: broken } })
    await flushPromises()

    expect(view.find('[data-testid="map-error"]').exists()).toBe(true)
    expect(view.find('[data-testid="zone-twilight"]').exists()).toBe(false)
  })
})
