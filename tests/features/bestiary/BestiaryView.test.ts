import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
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
import { overlapsZone, zonesForCreature } from '@/features/bestiary/zoneFilter'
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

/** 四个区域全部解锁；用于测试可点击的区域筛选。 */
const ALL_ZONE_EVENTS: readonly DomainEvent[] = ZONES.map((zone, index) => ({
  eventId: `all-zone-${zone.id}`, profileId: 'profile-a', occurredAt: index + 1,
  type: 'unlock-granted', kind: 'zone', targetId: zone.id, reason: 'quest-all',
}))

describe('BestiaryView', () => {
  it('图鉴页提供底部固定的返回首页按钮并向路由层发出事件', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()

    const back = view.get('[data-testid="page-return-home"]')
    expect(back.text()).toContain('返回首页')
    expect(back.classes()).toContain('bottom-return-button')
    await back.trigger('click')
    expect(view.emitted('back-home')).toEqual([[]])
  })

  it('filters by each teaching zone using overlapping depth ranges', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store(ALL_ZONE_EVENTS) } })
    await flushPromises()
    expect(view.text()).toContain('教学区域筛选，不代表唯一栖息区归属')

    for (const zone of ZONES) {
      await view.get(`button[aria-label="筛选${zone.name}"]`).trigger('click')
      const expectedIds = CREATURE_BANK.creatures
        .filter((entry) => zonesForCreature(entry).some((candidate) => candidate.id === zone.id))
        .map((entry) => entry.id)
      const shownIds = view.findAll('[data-testid^="creature-card-"]')
        .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
      expect(shownIds).toEqual(expectedIds)
    }
  })

  it('restores the complete creature list when the all-regions filter is selected', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store(ALL_ZONE_EVENTS) } })
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

  it('shows hadal fish when the hadal zone is selected', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store(ALL_ZONE_EVENTS) } })
    await flushPromises()
    await view.get(`button[aria-label="筛选${ZONES[3].name}"]`).trigger('click')

    const shown = view.findAll('[data-testid^="creature-card-"]')
      .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
    expect(shown).toEqual(CREATURE_BANK.creatures
      .filter((entry) => zonesForCreature(entry).some((zone) => zone.id === 'hadal'))
      .map((entry) => entry.id))
  })

  it('shows unlocked content by replaying only the requested profile events', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([unlocked]) } })
    await flushPromises()

    expect(view.text()).toContain(creature.name)
    const card = view.find(`[data-testid="creature-card-${creature.id}"]`)
    expect(card.find('[data-testid="creature-silhouette"]').exists()).toBe(false)
    // 有授权模型的物种：图鉴卡片默认展示 3D（家长要求两处都默认 3D），影像可一键切回
    expect(card.find('[data-testid="creature-model-viewer"]').exists()).toBe(true)
    expect(card.find('[data-testid="creature-photo"]').exists()).toBe(false)
    expect(card.find('[data-testid="model-attribution"]').text()).toContain('CC BY 4.0')
    // 跨区物种不该被误读成"当前就在深渊区"：卡片明确列出所有重叠的教学区
    expect(card.get('[data-testid="creature-zones"]').text()).toContain('暮光区')
    expect(card.get('[data-testid="creature-zones"]').text()).not.toContain('深海区')
    expect(card.get('[data-testid="creature-zones"]').text()).not.toContain('深渊区')
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
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(false)
    resolveB([])
    await flushPromises()
    expect(view.find('[data-testid="creature-silhouette"]').exists()).toBe(true)
  })

  it('clears profile records when the profile becomes null', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([unlocked]) } })
    await flushPromises()

    await view.setProps({ profileId: null })

    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(false)
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
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(false)
  })

  it('emits the selected unlocked creature id for observation navigation', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([unlocked]) } })
    await flushPromises()
    await view.get(`[data-testid="creature-card-${creature.id}"] [data-testid="creature-observe"]`).trigger('click')

    expect(view.emitted('observe')).toEqual([[creature.id]])
  })

  it('通关第 3 关后该关图鉴卡可以直接进入观察舱', async () => {
    const completions: DomainEvent[] = Array.from({ length: 3 }, (_, index) => ({
      eventId: `completed-${index}`, profileId: 'profile-a', occurredAt: index + 1,
      type: 'session-completed', sessionId: `session-${index}`, rewards: [],
    }))
    const view = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store(completions), showStages: true },
    })
    await flushPromises()
    await view.get('[data-testid="stage-tab-3"]').trigger('click')
    await flushPromises()

    const card = view.get('[data-testid="creature-card-humpback-whale"]')
    expect(card.text()).toContain('座头鲸')
    await card.get('[data-testid="creature-observe"]').trigger('click')
    expect(view.emitted('observe')).toEqual([['humpback-whale']])

    // 第 4 关还没通关，关卡标签保持禁用，不能提前进入。
    expect(view.get('[data-testid="stage-tab-4"]').attributes('disabled')).toBeDefined()
  })

  it('shows a neutral error state when event history cannot be read', async () => {
    const broken: BestiaryStore = { async listEvents() { throw new Error('private storage path') } }
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: broken } })
    await flushPromises()

    expect(view.find('[data-testid="bestiary-error"]').exists()).toBe(true)
    expect(view.text()).not.toContain('private storage path')
  })
})

describe('BestiaryView 默认教学区', () => {
  /** 区域解锁事件（`zone:<id>` 投影的来源）。 */
  function zoneUnlock(targetId: string, occurredAt = 1): DomainEvent {
    return {
      eventId: `unlock-zone-${targetId}`, profileId: 'profile-a', occurredAt,
      type: 'unlock-granted', kind: 'zone', targetId, reason: 'quest-1',
    }
  }

  /** 当前列出的物种 id（按 DOM 顺序）。 */
  function shownIds(view: VueWrapper): (string | undefined)[] {
    return view.findAll('[data-testid^="creature-card-"]')
      .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
  }

  const press = (view: VueWrapper, label: string): string | undefined =>
    view.get(`button[aria-label="${label}"]`).attributes('aria-pressed')

  it('未解锁任何区域时默认列出全部，新档案不会看到空页', async () => {
    const view = mount(BestiaryView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()

    expect(press(view, '筛选全部区域')).toBe('true')
    expect(shownIds(view)).toEqual(CREATURE_BANK.creatures.map((entry) => entry.id))
  })

  it('默认显示所有已解锁区域，并提示已解锁的暮光区', async () => {
    const view = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight')]) },
    })
    await flushPromises()

    expect(press(view, '筛选全部区域')).toBe('true')
    expect(press(view, '筛选暮光区')).toBe('false')
    expect(view.get('[data-testid="bestiary-unlocked-zones"]').text()).toContain('暮光区')
    expect(shownIds(view)).toEqual(CREATURE_BANK.creatures
      .filter((entry) => zonesForCreature(entry).some((zone) => zone.id === ZONES[0].id))
      .map((entry) => entry.id))
  })

  it('解锁深海区后同时保留暮光区与深海区的鱼', async () => {
    const twilight = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight')]) },
    })
    await flushPromises()
    const deepSea = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight'), zoneUnlock('midnight', 2)]) },
    })
    await flushPromises()

    expect(press(deepSea, '筛选全部区域')).toBe('true')
    // 座头鲸归在深海区；暮光区不显示它
    expect(shownIds(deepSea)).toContain('humpback-whale')
    expect(shownIds(twilight)).not.toContain('humpback-whale')
    expect(shownIds(deepSea)).toEqual(CREATURE_BANK.creatures
      .filter((entry) => zonesForCreature(entry).some((zone) => zone.id === ZONES[0].id || zone.id === ZONES[1].id))
      .map((entry) => entry.id))
  })

  it('区域解锁只决定可见范围，图鉴卡仍按关卡发放', async () => {
    const zoneOnly = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight')]) },
    })
    await flushPromises()

    // 只解锁区域、还没通关：区域筛选可用，但鱼仍是剪影。
    const locked = zoneOnly.get('[data-testid="creature-card-johnson-anglerfish"]')
    expect(locked.find('[data-testid="creature-silhouette"]').exists()).toBe(true)

    // 通关 2 关后，第 2 关的鮟鱇鱼才点亮；深海大鼬鳚仍不在暮光区可见范围里。
    const completions: DomainEvent[] = Array.from({ length: 2 }, (_, index) => ({
      eventId: `completed-${index}`, profileId: 'profile-a', occurredAt: index + 10,
      type: 'session-completed', sessionId: `session-${index}`, rewards: [],
    }))
    const twoStages = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight'), ...completions]) },
    })
    await flushPromises()

    const unlockedAngler = twoStages.get('[data-testid="creature-card-johnson-anglerfish"]')
    expect(unlockedAngler.find('[data-testid="creature-silhouette"]').exists()).toBe(false)
    expect(twoStages.find('[data-testid="creature-card-giant-cusk-eel"]').exists()).toBe(false)

    await twoStages.get('button[aria-label="筛选暮光区"]').trigger('click')
    const shown = twoStages.findAll('[data-testid^="creature-card-"]')
      .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
    expect(shown).toEqual(CREATURE_BANK.creatures
      .filter((entry) => zonesForCreature(entry).some((zone) => zone.id === 'twilight'))
      .map((entry) => entry.id))
  })

  it('未解锁的区域不能筛选，避免把其他海域误认为已解锁', async () => {
    const view = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight')]) },
    })
    await flushPromises()
    expect(view.get('button[aria-label="筛选暮光区"]').attributes('disabled')).toBeUndefined()
    expect(view.get('button[aria-label="筛选深海区"]').attributes('disabled')).toBeDefined()
  })

  it('手动切换区域后，再点全部恢复已解锁区域的并集', async () => {
    const view = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight')]) },
    })
    await flushPromises()

    await view.get('button[aria-label="筛选暮光区"]').trigger('click')
    expect(press(view, '筛选暮光区')).toBe('true')
    await view.get('button[aria-label="筛选全部区域"]').trigger('click')
    await flushPromises()

    expect(press(view, '筛选全部区域')).toBe('true')
    expect(shownIds(view)).toEqual(CREATURE_BANK.creatures
      .filter((entry) => zonesForCreature(entry).some((zone) => zone.id === ZONES[0].id))
      .map((entry) => entry.id))
  })

  it('切换档案后按新档案的区域重新应用默认', async () => {
    const view = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([zoneUnlock('twilight')]) },
    })
    await flushPromises()
    expect(press(view, '筛选全部区域')).toBe('true')
    expect(view.get('[data-testid="bestiary-unlocked-zones"]').text()).toContain('暮光区')

    await view.setProps({ profileId: 'profile-b' })
    await flushPromises()

    // profile-b 没有任何解锁 → 仍是「全部」，而不是停在上一档案的暮光区
    expect(press(view, '筛选全部区域')).toBe('true')
    expect(view.find('[data-testid="bestiary-unlocked-zones"]').exists()).toBe(false)
  })
})

describe('BestiaryView v3 stage filter', () => {
  const completed = (sessionId: string, at = 1): DomainEvent => ({
    eventId: `done-${sessionId}`, profileId: 'profile-a', occurredAt: at,
    type: 'session-completed', sessionId, rewards: ['quest-complete'],
  })

  it('默认定位已解锁的最新关卡，并按关卡显示 3 条图鉴', async () => {
    const view = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([completed('s1'), completed('s2', 2)]), showStages: true },
    })
    await flushPromises()

    expect(view.get('[data-testid="stage-tab-2"]').attributes('aria-pressed')).toBe('true')
    expect(view.get('[data-testid="stage-tab-3"]').attributes('disabled')).toBeDefined()
    expect(view.get('[data-testid="active-stage"]').text()).toContain('第 2 关')
    expect(shownIdsFor(view)).toEqual(['johnson-anglerfish', 'lanternfish', 'viperfish'])
  })

  it('切到第 1 关只显示浅海 3 条，全部按钮恢复已解锁区域', async () => {
    const view = mount(BestiaryView, {
      props: { profileId: 'profile-a', store: store([completed('s1'), completed('s2', 2)]), showStages: true },
    })
    await flushPromises()
    await view.get('[data-testid="stage-tab-1"]').trigger('click')
    expect(shownIdsFor(view)).toEqual(['golden-trevally', 'seahorse', 'leafy-seadragon'])

    await view.get('button[aria-label="筛选全部区域"]').trigger('click')
    expect(shownIdsFor(view)).toHaveLength(6)
  })
})

function shownIdsFor(view: VueWrapper): (string | undefined)[] {
  return view.findAll('[data-testid^="creature-card-"]')
    .map((card) => card.attributes('data-testid')?.replace('creature-card-', ''))
}

describe('ObservationView', () => {
  it('观察舱有固定的返回首页出口', () => {
    const view = mount(ObservationView, { props: { creature } })
    const back = view.get('[data-testid="page-return-home"]')
    expect(back.classes()).toContain('bottom-return-button')
    expect(back.text()).toContain('返回首页')
    back.trigger('click')
    expect(view.emitted('back-home')).toEqual([[]])
  })

  it('renders audited facts, knowledge cards, sources and the 3D model by default', async () => {
    const view = mount(ObservationView, { props: { creature } })
    await flushPromises()
    expect(view.text()).toContain(creature.scientificName)
    expect(view.text()).toContain('约 100–4,500 米')
    expect(view.text()).toContain(creature.habitat)
    // 家长要求观察舱默认看到 3D 模型；影像保留为「看真实照片」的切换项
    expect(view.find('[data-testid="creature-model-viewer"]').exists()).toBe(true)
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(false)
    expect(view.text()).toContain(creature.model!.note)
    expect(view.text()).toContain(creature.model!.attribution)
    expect(view.find(`a[href="${creature.model!.sourceUrl}"]`).exists()).toBe(true)
    expect(view.get('[data-testid="creature-model-toggle"]').text()).toBe('看真实照片')
    expect(view.text()).toContain('不是唯一分布')
    expect(view.findAll('[data-testid="knowledge-card"]')).toHaveLength(creature.knowledgeCards.length)
    for (const source of creature.sources) expect(view.find(`a[href="${source}"]`).exists()).toBe(true)
  })

  it('offers no 3D entry point for a species that has no licensed model', () => {
    const noModel = { ...CREATURE_BANK.creatures[1], model: undefined }
    const view = mount(ObservationView, { props: { creature: noModel } })
    expect(view.find('[data-testid="creature-model-toggle"]').exists()).toBe(false)
    expect(view.find('[data-testid="creature-photo"]').exists()).toBe(true)
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
  it('地图页有固定的返回首页出口', async () => {
    const view = mount(MapView, { props: { profileId: 'profile-a', store: store([]) } })
    await flushPromises()
    const back = view.get('[data-testid="page-return-home"]')
    expect(back.classes()).toContain('bottom-return-button')
    await back.trigger('click')
    expect(view.emitted('back-home')).toEqual([[]])
  })

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
