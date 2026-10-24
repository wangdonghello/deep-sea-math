import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DB_NAME, openDb } from '../../../src/data/db'
import type { DeepSeaDb } from '../../../src/data/db'
import { createCustomQuestionRepo } from '../../../src/data/repositories/customQuestionRepo'
import type { Question } from '../../../src/domain/model/types'
import { deleteDatabase, installFakeIndexedDb } from '../fakeIndexedDb'

const PROFILE_A = 'profile-a'
const PROFILE_B = 'profile-b'

function question(id: string, body: string): Question {
  return {
    id,
    grade: 2,
    format: 'open',
    type: 'add-sub',
    difficulty: 1,
    category: 'basic',
    story: { title: '导入错题', body },
    requiresFiveStep: false,
    hints: ['读题', '列式', '检查'],
    answer: { value: 7 },
    similarQuestionIds: [],
    tags: ['imported'],
    sources: ['local-parent-import'],
  }
}

describe('data/repositories/customQuestionRepo', () => {
  let restore: () => void
  let db: DeepSeaDb

  beforeEach(async () => {
    restore = await installFakeIndexedDb()
    await deleteDatabase(DB_NAME)
    db = await openDb()
  })

  afterEach(async () => {
    db.close()
    await deleteDatabase(DB_NAME)
    restore()
  })

  it('按档案隔离自定义题目', async () => {
    const repo = createCustomQuestionRepo(db)
    await repo.save(PROFILE_A, [question('custom-a', '3+4=?')])
    await repo.save(PROFILE_B, [question('custom-b', '5+5=?')])

    expect((await repo.listByProfile(PROFILE_A)).map((item) => item.id)).toEqual(['custom-a'])
    expect((await repo.listByProfile(PROFILE_B)).map((item) => item.id)).toEqual(['custom-b'])
  })

  it('同 id 覆盖写，删除只影响目标档案', async () => {
    const repo = createCustomQuestionRepo(db)
    await repo.save(PROFILE_A, [question('custom-a', '3+4=?')])
    await repo.save(PROFILE_A, [question('custom-a', '4+4=?')])
    const saved = await repo.listByProfile(PROFILE_A)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.story.body).toBe('4+4=?')

    await repo.remove(PROFILE_B, 'custom-a')
    expect(await repo.listByProfile(PROFILE_A)).toHaveLength(1)

    await repo.removeByProfile(PROFILE_A)
    expect(await repo.listByProfile(PROFILE_A)).toEqual([])
  })
})
