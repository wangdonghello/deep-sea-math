/**
 * 从第三版（v3）的独立 IndexedDB 导入档案与学习进度。
 *
 * 为什么需要：v4 预览使用独立库 `deep-sea-math-v4`，避免 v4 的新事件影响
 * v3；但孩子已经在 v3 里学过一段时间，直接让 v4 从零开始会丢掉档案、错题
 * 与图鉴进度。本模块做一次**只读源库、增量写目标库**的复制：
 * - 档案 / 设置 / 自定义错题按主键去重，目标库已有的绝不覆盖；
 * - 事件按 `eventId` 去重，并复制 `eventOrder` 台账，尽量保持同毫秒顺序；
 * - 图鉴投影缓存不复制（可由事件重放重建）；
 * - 家长 PIN 仅在目标库还没有时复制，避免覆盖 v4 里新设的 PIN。
 *
 * 源库不存在、没有所需 store、或当前环境没有 IndexedDB 时返回
 * `sourceFound: false`，不抛异常——调用方据此显示“没有找到第三版进度”。
 */

import { deleteDB, openDB, type IDBPDatabase } from 'idb'

import { DB_NAME, STORE_NAMES } from './db'

/** v3 构建时通过 `VITE_DB_NAME` 写入的库名。 */
export const V3_DB_NAME = 'deep-sea-math-v3'

/** 导入结果（数量均为“本次新增”，目标库已有记录不计入）。 */
export interface V3ImportResult {
  readonly sourceFound: boolean
  readonly profiles: number
  readonly events: number
  readonly settings: number
  readonly customQuestions: number
  readonly copiedGuard: boolean
}

const EMPTY: V3ImportResult = {
  sourceFound: false,
  profiles: 0,
  events: 0,
  settings: 0,
  customQuestions: 0,
  copiedGuard: false,
}

/** 目标库名：与 v4 构建的 `DB_NAME` 一致（测试可注入）。 */
export interface V3ImportOptions {
  readonly sourceName?: string
  readonly targetName?: string
}

async function databaseExists(name: string): Promise<boolean> {
  const databases = globalThis.indexedDB?.databases
  if (typeof databases !== 'function') return true
  const list = await databases.call(globalThis.indexedDB)
  return list.some((entry) => entry.name === name)
}

/** 读取源库；库不存在或没有 v3 必需 store 时返回 null。 */
async function openSource(name: string): Promise<IDBPDatabase | null> {
  if (globalThis.indexedDB === undefined) return null
  if (!(await databaseExists(name))) return null
  const source = await openDB(name)
  if (source.objectStoreNames.length === 0) {
    // `databases()` 不可用的环境里，打开不存在的库会创建一个空库；清掉它。
    source.close()
    await deleteDB(name)
    return null
  }
  if (
    !source.objectStoreNames.contains(STORE_NAMES.profiles) ||
    !source.objectStoreNames.contains(STORE_NAMES.events)
  ) {
    source.close()
    return null
  }
  return source
}

/**
 * 执行一次导入。
 *
 * 幂等：重复点击不会产生重复档案/事件；第二次导入通常返回全 0。
 */
export async function importV3Progress(options: V3ImportOptions = {}): Promise<V3ImportResult> {
  const sourceName = options.sourceName ?? V3_DB_NAME
  const targetName = options.targetName ?? DB_NAME
  const source = await openSource(sourceName)
  if (source === null) return EMPTY

  const target = await openDB(targetName)
  try {
    if (
      !target.objectStoreNames.contains(STORE_NAMES.profiles) ||
      !target.objectStoreNames.contains(STORE_NAMES.events)
    ) {
      return EMPTY
    }

    const [profiles, events, settings, customQuestions, guard, eventOrder] = await Promise.all([
      source.getAll(STORE_NAMES.profiles) as Promise<{ id: string }[]>,
      source.getAll(STORE_NAMES.events) as Promise<{ eventId: string }[]>,
      source.getAll(STORE_NAMES.settings) as Promise<{ profileId: string }[]>,
      source.getAll(STORE_NAMES.customQuestions) as Promise<{ id: string }[]>,
      source.getAll(STORE_NAMES.guard) as Promise<{ id: string }[]>,
      source.getAll(STORE_NAMES.eventOrder) as Promise<{ profileId: string; eventId: string }[]>,
    ])

    const [profileKeys, eventKeys, settingKeys, customKeys, guardKeys] = await Promise.all([
      target.getAllKeys(STORE_NAMES.profiles) as Promise<string[]>,
      target.getAllKeys(STORE_NAMES.events) as Promise<string[]>,
      target.getAllKeys(STORE_NAMES.settings) as Promise<string[]>,
      target.getAllKeys(STORE_NAMES.customQuestions) as Promise<string[]>,
      target.getAllKeys(STORE_NAMES.guard) as Promise<string[]>,
    ])

    const profileSet = new Set(profileKeys)
    const eventSet = new Set(eventKeys)
    const settingSet = new Set(settingKeys)
    const customSet = new Set(customKeys)
    const guardSet = new Set(guardKeys)

    const newProfiles = profiles.filter((profile) => !profileSet.has(profile.id))
    const newEvents = events.filter((event) => !eventSet.has(event.eventId))
    const newSettings = settings.filter((row) => !settingSet.has(row.profileId))
    const newCustom = customQuestions.filter((row) => !customSet.has(row.id))
    const copyGuard = guardSet.size === 0

    const tx = target.transaction(
      [
        STORE_NAMES.profiles,
        STORE_NAMES.events,
        STORE_NAMES.settings,
        STORE_NAMES.customQuestions,
        STORE_NAMES.guard,
        STORE_NAMES.eventOrder,
      ],
      'readwrite',
    )

    for (const profile of newProfiles) tx.objectStore(STORE_NAMES.profiles).put(profile)
    for (const event of newEvents) tx.objectStore(STORE_NAMES.events).put(event)
    for (const row of newSettings) tx.objectStore(STORE_NAMES.settings).put(row)
    for (const row of newCustom) tx.objectStore(STORE_NAMES.customQuestions).put(row)
    if (copyGuard) for (const row of guard) tx.objectStore(STORE_NAMES.guard).put(row)

    // 只沿用源库台账里“本次新导入事件”的先后，不覆盖目标库已有事件。
    const newlyImported = new Set(newEvents.map((event) => event.eventId))
    for (const row of eventOrder) {
      if (newlyImported.has(row.eventId)) tx.objectStore(STORE_NAMES.eventOrder).add(row)
    }

    await tx.done

    return {
      sourceFound: true,
      profiles: newProfiles.length,
      events: newEvents.length,
      settings: newSettings.length,
      customQuestions: newCustom.length,
      copiedGuard: copyGuard && guard.length > 0,
    }
  } finally {
    source.close()
    target.close()
  }
}
