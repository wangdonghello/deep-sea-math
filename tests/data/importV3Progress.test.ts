import { openDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { importV3Progress } from '@/data/importV3Progress'
import { deleteDatabase, installFakeIndexedDb } from './fakeIndexedDb'

const SOURCE = 'v3-source-test'
const TARGET = 'v4-target-test'

let restore: () => void

async function createDb(name: string, profiles: unknown[] = [], events: unknown[] = []): Promise<void> {
  const db = await openDB(name, 5, {
    upgrade(database) {
      database.createObjectStore('events', { keyPath: 'eventId' })
      database.createObjectStore('profiles', { keyPath: 'id' })
      database.createObjectStore('settings', { keyPath: 'profileId' })
      database.createObjectStore('projections', { keyPath: 'profileId' })
      database.createObjectStore('guard', { keyPath: 'id' })
      database.createObjectStore('eventOrder', { autoIncrement: true })
      database.createObjectStore('customQuestions', { keyPath: 'id' })
    },
  })
  for (const profile of profiles) await db.put('profiles', profile)
  for (const event of events) {
    await db.put('events', event)
    await db.add('eventOrder', (event as { eventId: string }).eventId)
  }
  db.close()
}

beforeEach(async () => {
  restore = await installFakeIndexedDb()
})

afterEach(async () => {
  await deleteDatabase(SOURCE)
  await deleteDatabase(TARGET)
  restore()
})

describe('importV3Progress', () => {
  it('复制档案、事件、设置与事件顺序，且第二次导入幂等', async () => {
    await createDb(SOURCE, [{ id: 'p1', nickname: '小海' }], [
      { eventId: 'e1', profileId: 'p1', occurredAt: 1, type: 'profile-created', nickname: '小海', avatarId: 'a', pinHash: 'h', salt: 's' },
    ])
    await createDb(TARGET)

    const first = await importV3Progress({ sourceName: SOURCE, targetName: TARGET })
    expect(first).toMatchObject({ sourceFound: true, profiles: 1, events: 1 })

    const target = await openDB(TARGET)
    expect(await target.getAll('profiles')).toHaveLength(1)
    expect(await target.getAll('events')).toHaveLength(1)
    expect(await target.getAll('eventOrder')).toEqual(['e1'])
    target.close()

    const second = await importV3Progress({ sourceName: SOURCE, targetName: TARGET })
    expect(second).toMatchObject({ sourceFound: true, profiles: 0, events: 0 })
  })

  it('目标库已有同 id 档案时不覆盖', async () => {
    await createDb(SOURCE, [{ id: 'p1', nickname: 'v3 小海' }], [])
    await createDb(TARGET, [{ id: 'p1', nickname: 'v4 小海' }], [])

    await importV3Progress({ sourceName: SOURCE, targetName: TARGET })

    const target = await openDB(TARGET)
    expect((await target.get('profiles', 'p1')).nickname).toBe('v4 小海')
    target.close()
  })

  it('源库不存在时返回 sourceFound=false', async () => {
    await createDb(TARGET)
    const result = await importV3Progress({ sourceName: 'no-such-v3', targetName: TARGET })
    expect(result.sourceFound).toBe(false)
  })
})
