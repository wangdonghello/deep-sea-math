import { computed, ref } from 'vue'

import { hashPin } from '@/domain/crypto/hashPin'
import { createEventId } from '@/domain/eventLog/ids'
import { replayProjections } from '@/domain/eventLog/replay'
import { QUIZ_TYPES, type DomainEvent, type MasteryLevel, type Profile, type QuizType, type Settings } from '@/domain/model/types'
import { redact } from '@/shared/redact'

import type { ParentPanelOptions, ParentReport } from './types'

const DEFAULT_SETTINGS: Settings = { basicCount: 5, appliedCount: 3, probeCount: 1, maxMinutes: 15 }
const emptyMastery = (): ParentReport['masteryByTopic'] => Object.fromEntries(QUIZ_TYPES.map((type) => [type, {}])) as ParentReport['masteryByTopic']
const emptyReport = (): ParentReport => ({ completedQuestions: 0, averageMs: 0, hintCount: 0, masteryByTopic: emptyMastery() })
const secureRandomBytes = (size: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(size))
const saltHex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/** 家长区业务状态与操作；所有存储及随机/时间来源均可注入。 */
export function useParentPanel(options: ParentPanelOptions) {
  const clock = options.clock ?? Date.now
  const id = options.idGenerator ?? (() => createEventId())
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const persistedSettings = ref<Settings>({ ...DEFAULT_SETTINGS })
  /**
   * 题型掌握分布的可用口径：只有注入非空题型表，`masteryByQuestion` 才能被
   * 归属到题型；否则分布全是静默 0，报告区改显占位提示（避免假装已生效）。
   */
  const topicMasteryAvailable = computed(() => {
    const table = options.questionTypeById
    return table !== undefined && Object.keys(table).length > 0
  })

  const report = ref<ParentReport>({ ...emptyReport(), topicMasteryAvailable: topicMasteryAvailable.value })
  const reportPeriod = ref<'today' | '7days'>('7days')
  const profiles = ref<Array<Pick<Profile, 'id' | 'nickname' | 'avatarId'>>>([])
  const loading = ref(false)
  const errorMessage = ref('')
  const successMessage = ref('')
  const created = ref(false)
  const deleted = ref(false)
  const confirmDelete = ref(false)
  const createForm = { nickname: ref(''), avatarId: ref('avatar-1'), pin: ref(''), confirmPin: ref('') }
  const resetForm = { pin: ref(''), confirmPin: ref('') }
  const deleteForm = { nickname: ref('') }
  const resetProfileId = ref(options.profileId)
  /**
   * 家长区当前操作的孩子档案。
   *
   * 以传入的 `profileId`（当前登录档案）为**默认选中**，但家长区允许在不选
   * 孩子档案时进入——建档正是发生在"还没有档案"的前提下。设置/报告页顶部切换
   * 孩子即改写它，所有读写都以它为口径。
   */
  const selectedProfileId = ref<string | null>(options.profileId)

  function logFailure(action: string, error: unknown): void {
    options.logger?.(redact({ event: `parent-${action}-failed`, error }))
  }

  const degraded = computed(() => options.store.degraded)

  function updateReport(events: readonly DomainEvent[]): void {
    const profileId = selectedProfileId.value
    if (profileId === null) return
    const projections = replayProjections(events, { profileId, questionTypeById: options.questionTypeById })
    const now = clock()
    const start = reportPeriod.value === 'today'
      ? Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())
      : now - 7 * 24 * 60 * 60 * 1000
    const rangeEvents = events.filter((event) => event.profileId === profileId && event.occurredAt >= start && event.occurredAt <= now)
    const completed = new Map<string, number>()
    for (const event of rangeEvents) {
      if (event.type === 'answer-submitted' && event.correct) {
        completed.set(`${event.sessionId}:${event.questionId}`, event.ms)
      }
    }
    const masteryByTopic = emptyMastery() as Record<QuizType, Partial<Record<MasteryLevel, number>>>
    for (const [questionId, state] of Object.entries(projections.masteryByQuestion)) {
      const type = options.questionTypeById?.[questionId]
      if (type === undefined) continue
      masteryByTopic[type][state.level] = (masteryByTopic[type][state.level] ?? 0) + 1
    }
    report.value = {
      completedQuestions: completed.size,
      averageMs: completed.size === 0 ? 0 : Math.round([...completed.values()].reduce((sum, ms) => sum + ms, 0) / completed.size),
      hintCount: rangeEvents.filter((event) => event.type === 'hint-used').length,
      masteryByTopic,
      topicMasteryAvailable: topicMasteryAvailable.value,
    }
  }

  async function refreshReport(): Promise<void> {
    if (selectedProfileId.value === null) return
    try {
      updateReport(await options.store.events.listByProfile(selectedProfileId.value))
    } catch (error) {
      errorMessage.value = '暂时无法读取学习报告，请稍后重试。'
      logFailure('report', error)
    }
  }

  function clearCreatePin(): void {
    createForm.pin.value = ''
    createForm.confirmPin.value = ''
  }

  async function createProfile(): Promise<void> {
    errorMessage.value = ''
    successMessage.value = ''
    created.value = false
    const nickname = createForm.nickname.value.trim()
    const pin = createForm.pin.value
    const confirmation = createForm.confirmPin.value
    if (nickname === '' || !/^\d{4}$/.test(pin) || pin !== confirmation) {
      errorMessage.value = '请填写昵称，并确认两次输入相同的 4 位数字 PIN。'
      clearCreatePin()
      return
    }
    let savedProfile: Profile | null = null
    try {
      const salt = saltHex((options.randomBytes ?? secureRandomBytes)(16))
      const pinHash = await hashPin(pin, salt, options.digest)
      const profile: Profile = { id: id(), nickname, avatarId: createForm.avatarId.value, pinHash, salt, createdAt: clock() }
      await options.store.profiles.save(profile)
      savedProfile = profile
      const event: DomainEvent = {
        type: 'profile-created', eventId: id(), profileId: profile.id, occurredAt: profile.createdAt,
        nickname: profile.nickname, avatarId: profile.avatarId, pinHash, salt,
      }
      await options.store.events.append([event])
      profiles.value = [...profiles.value, { id: profile.id, nickname: profile.nickname, avatarId: profile.avatarId }]
      created.value = true
      successMessage.value = '孩子档案已创建，请返回档案选择页开始探索。'
    } catch (error) {
      if (savedProfile !== null) {
        try { await options.store.profiles.remove(savedProfile.id) } catch (rollbackError) { logFailure('create-rollback', rollbackError) }
      }
      errorMessage.value = '暂时无法创建档案，请稍后重试。'
      logFailure('create', error)
    } finally {
      clearCreatePin()
    }
  }

  function validSettings(value: Settings): boolean {
    return [value.basicCount, value.appliedCount, value.probeCount].every((count) => Number.isInteger(count) && count >= 0) &&
      value.basicCount + value.appliedCount + value.probeCount > 0 && Number.isInteger(value.maxMinutes) && value.maxMinutes > 0
  }

  async function saveSettings(): Promise<void> {
    if (selectedProfileId.value === null || !validSettings(settings.value)) {
      errorMessage.value = '请填写有效的题量和时长。'
      return
    }
    errorMessage.value = ''
    try {
      const profileId = selectedProfileId.value
      const value = { ...settings.value }
      const previous = { ...persistedSettings.value }
      await options.store.settings.save(profileId, value)
      const event: DomainEvent = { type: 'settings-updated', eventId: id(), profileId, occurredAt: clock(), ...value }
      try {
        await options.store.events.append([event])
      } catch (error) {
        try { await options.store.settings.save(profileId, previous) } catch (rollbackError) { logFailure('settings-rollback', rollbackError) }
        throw error
      }
      persistedSettings.value = value
      successMessage.value = '设置已保存，将从下一次生成题组起生效。'
    } catch (error) {
      errorMessage.value = '暂时无法保存设置，请稍后重试。'
      logFailure('settings', error)
    }
  }

  async function resetPin(): Promise<void> {
    const pin = resetForm.pin.value
    const confirmation = resetForm.confirmPin.value
    errorMessage.value = ''
    try {
      if (resetProfileId.value === null || !/^\d{4}$/.test(pin) || pin !== confirmation) {
        errorMessage.value = '请确认两次输入相同的 4 位数字 PIN。'
        return
      }
      const profile = await options.store.profiles.get(resetProfileId.value)
      if (profile === undefined) throw new Error('profile unavailable')
      const salt = saltHex((options.randomBytes ?? secureRandomBytes)(16))
      const pinHash = await hashPin(pin, salt, options.digest)
      await options.store.profiles.save({ ...profile, pinHash, salt })
      successMessage.value = 'PIN 已重置。'
    } catch (error) {
      errorMessage.value = '暂时无法重置 PIN，请稍后重试。'
      logFailure('pin-reset', error)
    } finally {
      resetForm.pin.value = ''
      resetForm.confirmPin.value = ''
    }
  }

  async function deleteProfile(): Promise<void> {
    if (!confirmDelete.value) return
    const profileId = selectedProfileId.value
    const profile = profileId === null ? undefined : profiles.value.find((item) => item.id === profileId)
    if (profileId === null || profile === undefined || deleteForm.nickname.value !== profile.nickname) {
      errorMessage.value = '请输入档案昵称以确认删除。'
      return
    }
    errorMessage.value = ''
    successMessage.value = ''
    try {
      await options.store.profiles.remove(profileId)
      await options.store.events.removeByProfile(profileId)
      await options.store.settings.remove(profileId)
      await options.store.bestiary.remove(profileId)
      deleted.value = true
      profiles.value = profiles.value.filter((item) => item.id !== profileId)
      selectedProfileId.value = null
      resetProfileId.value = null
      successMessage.value = '档案及本机学习数据已删除。'
    } catch (error) {
      errorMessage.value = '删除未能全部完成，本机仍可能保留部分档案数据，请重试。'
      logFailure('delete', error)
    }
  }

  /** 载入当前选中孩子的设置与报告；未选中任何孩子时什么都不做。 */
  async function loadForProfile(): Promise<void> {
    if (selectedProfileId.value === null) return
    const profileId = selectedProfileId.value
    const [saved, events] = await Promise.all([
      options.store.settings.get(profileId), options.store.events.listByProfile(profileId),
    ])
    settings.value = { ...saved }
    persistedSettings.value = { ...saved }
    updateReport(events)
  }

  /**
   * 切换家长区当前操作的孩子。
   *
   * 换人会清空 PIN 重置 / 删除确认这些**短生命周期输入**：让上一名孩子的
   * 半截 PIN 或删档确认残留在下一名孩子身上，是这条路径上唯一会造成误操作的
   * 状态。清完再按新档案重读设置与报告。
   */
  async function selectProfile(profileId: string | null): Promise<void> {
    selectedProfileId.value = profileId
    resetProfileId.value = profileId
    errorMessage.value = ''
    successMessage.value = ''
    deleted.value = false
    confirmDelete.value = false
    deleteForm.nickname.value = ''
    resetForm.pin.value = ''
    resetForm.confirmPin.value = ''
    try {
      await loadForProfile()
    } catch (error) {
      errorMessage.value = '暂时无法读取家长区数据，请稍后重试。'
      logFailure('load', error)
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      const listed = await options.store.profiles.list()
      profiles.value = listed.map(({ id, nickname, avatarId }) => ({ id, nickname, avatarId }))
      // 默认选中：传入的当前档案原样保留（即使列表暂未列出它，也仍以它为准
      // ——视图的默认选中属于装配决策）；只有未传入时才退回首个档案，可能为
      // null：首次安装尚无任何档案就是这种情况。
      if (selectedProfileId.value === null) {
        selectedProfileId.value = profiles.value[0]?.id ?? null
        resetProfileId.value = selectedProfileId.value
      }
      await loadForProfile()
    } catch (error) {
      errorMessage.value = '暂时无法读取家长区数据，请稍后重试。'
      logFailure('load', error)
    } finally {
      loading.value = false
    }
  }

  return {
    degraded: computed(() => degraded.value),
    degradedReason: options.store.degradedReason,
    topicMasteryAvailable,
    settings, report, reportPeriod, profiles, loading, errorMessage, successMessage, created, deleted,
    confirmDelete, createForm, resetForm, deleteForm, resetProfileId, selectedProfileId,
    load, selectProfile, refreshReport, createProfile, saveSettings, resetPin, deleteProfile,
  }
}
