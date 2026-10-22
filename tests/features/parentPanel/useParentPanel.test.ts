import { createHash } from 'node:crypto'

import type { DomainEvent, Profile, Settings } from '@/domain/model/types'
import { hashPin, verifyPin } from '@/domain/crypto/hashPin'
import { useParentPanel } from '@/features/parentPanel/useParentPanel'
import type { ParentStore } from '@/features/parentPanel/types'

const sha256 = async (_algorithm: 'SHA-256', bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  const digest = createHash('sha256').update(bytes).digest()
  return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength)
}

function makeStore(events: DomainEvent[] = []) {
  const profiles = new Map<string, Profile>()
  const settings = new Map<string, Settings>()
  const appended: DomainEvent[] = []
  const removed: string[] = []
  const store: ParentStore = {
    degraded: false,
    degradedReason: null,
    profiles: {
      list: async () => [...profiles.values()],
      get: async (id) => profiles.get(id),
      save: async (profile) => { profiles.set(profile.id, profile) },
      remove: async (id) => { profiles.delete(id); removed.push('profile') },
    },
    events: {
      listByProfile: async (id) => events.filter((event) => event.profileId === id),
      append: async (batch) => { appended.push(...batch); return [...events, ...batch] },
      removeByProfile: async () => { removed.push('events') },
    },
    settings: {
      get: async (id) => settings.get(id) ?? { basicCount: 4, appliedCount: 4, probeCount: 1, maxMinutes: 15 },
      save: async (id, value) => { settings.set(id, value) },
      remove: async () => { removed.push('settings') },
    },
    bestiary: { remove: async () => { removed.push('bestiary') } },
  }
  return { store, profiles, settings, appended, removed }
}

const testOptions = { digest: sha256, randomBytes: (size: number) => new Uint8Array(size).fill(7), idGenerator: () => 'generated-id' }

describe('useParentPanel', () => {
  it('creates a profile with a salted hash and appends profile-created without storing the PIN', async () => {
    const fake = makeStore()
    const panel = useParentPanel({ store: fake.store, profileId: null, clock: () => 123, ...testOptions })
    panel.createForm.nickname.value = '海星'
    panel.createForm.avatarId.value = 'avatar-1'
    panel.createForm.pin.value = '0427'
    panel.createForm.confirmPin.value = '0427'
    await panel.createProfile()

    expect(fake.profiles.get('generated-id')).toMatchObject({ nickname: '海星', avatarId: 'avatar-1', createdAt: 123 })
    expect(fake.profiles.get('generated-id')?.pinHash).not.toContain('0427')
    expect(await verifyPin('0427', fake.profiles.get('generated-id')!.salt, fake.profiles.get('generated-id')!.pinHash, sha256)).toBe(true)
    expect(fake.appended[0]).toMatchObject({ type: 'profile-created', profileId: 'generated-id' })
    expect(JSON.stringify(fake.appended)).not.toContain('0427')
    expect(panel.createForm.pin.value).toBe('')
    expect(panel.createForm.confirmPin.value).toBe('')
  })

  it('persists grade/theme on create and appends a preferences event on edit', async () => {
    const fake = makeStore()
    const panel = useParentPanel({ store: fake.store, profileId: null, clock: () => 123, ...testOptions })
    panel.createForm.nickname.value = '小恐龙'
    panel.createForm.grade.value = 1
    panel.createForm.themeId.value = 'dinosaur'
    panel.createForm.pin.value = '1234'
    panel.createForm.confirmPin.value = '1234'
    await panel.createProfile()
    expect(fake.profiles.get('generated-id')).toMatchObject({ grade: 1, themeId: 'dinosaur' })
    expect(fake.appended[0]).toMatchObject({ type: 'profile-created', grade: 1, themeId: 'dinosaur' })

    const existing: Profile = {
      id: 'child-a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'h', salt: 's', createdAt: 1,
      grade: 1, themeId: 'dinosaur',
    }
    fake.profiles.set('child-a', existing)
    const editor = useParentPanel({ store: fake.store, profileId: 'child-a', clock: () => 456, ...testOptions })
    await editor.load()
    editor.preferencesForm.grade.value = 2
    editor.preferencesForm.themeId.value = 'space'
    await editor.updatePreferences()
    expect(fake.profiles.get('child-a')).toMatchObject({ grade: 2, themeId: 'space' })
    expect(fake.appended.at(-1)).toMatchObject({
      type: 'profile-preferences-updated', profileId: 'child-a', grade: 2, themeId: 'space',
    })
  })

  it('persists all settings and records the change at the current clock time for the next quest', async () => {
    const fake = makeStore()
    let now = 86_400_000
    const panel = useParentPanel({ store: fake.store, profileId: 'child-a', clock: () => now, ...testOptions })
    await panel.load()
    panel.settings.value = { basicCount: 4, appliedCount: 2, probeCount: 2, maxMinutes: 20 }
    await panel.saveSettings()

    expect(fake.settings.get('child-a')).toEqual(panel.settings.value)
    expect(fake.appended[0]).toMatchObject({
      type: 'settings-updated', profileId: 'child-a', occurredAt: 86_400_000,
      basicCount: 4, appliedCount: 2, probeCount: 2, maxMinutes: 20,
    })
    now += 24 * 60 * 60 * 1000
    expect(await fake.store.settings.get('child-a')).toEqual({ basicCount: 4, appliedCount: 2, probeCount: 2, maxMinutes: 20 })
  })

  it('builds the report from the selected profile event stream', async () => {
    const events: DomainEvent[] = [
      { type: 'session-started', eventId: 's1', profileId: 'child-a', occurredAt: 86_400_000, sessionId: 'today', questionIds: ['q1', 'q2'], difficultyTrace: [1] },
      { type: 'answer-submitted', eventId: 'a1', profileId: 'child-a', occurredAt: 86_400_100, sessionId: 'today', questionId: 'q1', submitted: '2', correct: true, usedHintLevel: 0, retryCount: 0, ms: 1000 },
      { type: 'answer-submitted', eventId: 'a2', profileId: 'child-a', occurredAt: 86_400_200, sessionId: 'today', questionId: 'q2', submitted: '3', correct: true, usedHintLevel: 1, retryCount: 0, ms: 3000 },
      { type: 'answer-submitted', eventId: 'a3', profileId: 'child-a', occurredAt: 86_400_250, sessionId: 'today', questionId: 'q3', submitted: '4', correct: true, usedHintLevel: 0, retryCount: 0, ms: 5000 },
      { type: 'hint-used', eventId: 'h1', profileId: 'child-a', occurredAt: 86_400_150, sessionId: 'today', questionId: 'q2', level: 1 },
      { type: 'answer-submitted', eventId: 'other', profileId: 'child-b', occurredAt: 86_400_200, sessionId: 'other', questionId: 'q1', submitted: '2', correct: true, usedHintLevel: 0, retryCount: 0, ms: 9000 },
    ]
    const panel = useParentPanel({ store: makeStore(events).store, profileId: 'child-a', clock: () => 86_400_300, questionTypeById: { q1: 'add-sub', q2: 'mul-div', q3: 'add-sub' }, ...testOptions })
    await panel.load()

    expect(panel.report.value).toMatchObject({ completedQuestions: 3, averageMs: 3000, hintCount: 1 })
    expect(panel.report.value.masteryByTopic['add-sub']).toEqual({ independent: 2 })
    expect(panel.report.value.masteryByTopic['mul-div']).toEqual({ hinted: 1 })
  })

  it('flags topic mastery available only when a question type table was injected', async () => {
    const events: DomainEvent[] = [
      { type: 'session-started', eventId: 's1', profileId: 'child-a', occurredAt: 86_400_000, sessionId: 'today', questionIds: ['q1'], difficultyTrace: [1] },
      { type: 'answer-submitted', eventId: 'a1', profileId: 'child-a', occurredAt: 86_400_100, sessionId: 'today', questionId: 'q1', submitted: '2', correct: true, usedHintLevel: 0, retryCount: 0, ms: 1000 },
    ]
    const withTable = useParentPanel({ store: makeStore(events).store, profileId: 'child-a', clock: () => 86_400_300, questionTypeById: { q1: 'add-sub' }, ...testOptions })
    await withTable.load()
    expect(withTable.topicMasteryAvailable.value).toBe(true)
    expect(withTable.report.value.topicMasteryAvailable).toBe(true)

    // 没有题型表时分布只能静默为 0：flag 置假，让报告区显示占位提示而不是假数字。
    const withoutTable = useParentPanel({ store: makeStore(events).store, profileId: 'child-a', clock: () => 86_400_300, ...testOptions })
    await withoutTable.load()
    expect(withoutTable.topicMasteryAvailable.value).toBe(false)
    expect(withoutTable.report.value.topicMasteryAvailable).toBe(false)
    expect(withoutTable.report.value.masteryByTopic['add-sub']).toEqual({})
  })

  it('resets the PIN with a fresh salt and clears both short-lived inputs', async () => {
    const fake = makeStore()
    const original: Profile = { id: 'child-a', nickname: '海星', avatarId: 'avatar-1', pinHash: await hashPin('1111', 'old-salt', sha256), salt: 'old-salt', createdAt: 1 }
    fake.profiles.set(original.id, original)
    let randomCall = 0
    const panel = useParentPanel({
      store: fake.store, profileId: original.id, clock: () => 2, digest: sha256,
      randomBytes: (size) => new Uint8Array(size).fill(++randomCall), idGenerator: () => 'id',
    })
    panel.resetForm.pin.value = '2222'
    panel.resetForm.confirmPin.value = '2222'
    await panel.resetPin()
    const updated = fake.profiles.get(original.id)!

    expect(updated.salt).not.toBe(original.salt)
    expect(await verifyPin('1111', updated.salt, updated.pinHash, sha256)).toBe(false)
    expect(await verifyPin('2222', updated.salt, updated.pinHash, sha256)).toBe(true)
    expect(panel.resetForm.pin.value).toBe('')
    expect(panel.resetForm.confirmPin.value).toBe('')
  })

  it('redacts sensitive fields from failures reported through the logger', async () => {
    const fake = makeStore()
    fake.profiles.set('child-a', { id: 'child-a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'hash', salt: 'salt', createdAt: 1 })
    fake.store.profiles.save = async () => { throw Object.assign(new Error('write failed'), { pin: '4321' }) }
    const logs: Record<string, unknown>[] = []
    const panel = useParentPanel({ store: fake.store, profileId: 'child-a', logger: (entry) => logs.push(entry), ...testOptions })
    panel.resetForm.pin.value = '2468'
    panel.resetForm.confirmPin.value = '2468'
    await panel.resetPin()

    expect(JSON.stringify(logs)).not.toContain('4321')
    expect(JSON.stringify(logs)).toContain('***')
    expect(JSON.stringify(logs)).not.toContain('2468')
  })

  it('keeps deletion visibly incomplete when a later data store fails', async () => {
    const fake = makeStore()
    fake.profiles.set('child-a', { id: 'child-a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'hash', salt: 'salt', createdAt: 1 })
    fake.store.events.removeByProfile = async () => { throw new Error('storage failed') }
    const panel = useParentPanel({ store: fake.store, profileId: 'child-a', ...testOptions })
    await panel.load()
    panel.confirmDelete.value = true
    panel.deleteForm.nickname.value = '海星'
    await panel.deleteProfile()

    expect(panel.deleted.value).toBe(false)
    expect(panel.errorMessage.value).toContain('未能全部完成')
    expect(fake.removed).toEqual(['profile'])
  })

  it('requires a second confirmation and an exact nickname before deleting all profile data', async () => {
    const fake = makeStore()
    fake.profiles.set('child-a', { id: 'child-a', nickname: '海星', avatarId: 'avatar-1', pinHash: 'hash', salt: 'salt', createdAt: 1 })
    const panel = useParentPanel({ store: fake.store, profileId: 'child-a', clock: () => 2, ...testOptions })
    await panel.load()
    panel.deleteForm.nickname.value = 'wrong'
    await panel.deleteProfile()
    expect(fake.removed).toEqual([])

    panel.confirmDelete.value = true
    await panel.deleteProfile()
    expect(fake.removed).toEqual([])
    panel.deleteForm.nickname.value = '海星'
    await panel.deleteProfile()
    expect(fake.removed).toEqual(['profile', 'events', 'settings', 'bestiary'])
    expect(panel.deleted.value).toBe(true)
  })
})
