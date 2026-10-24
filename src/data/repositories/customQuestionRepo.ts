import type { Question } from '../../domain/model/types'
import { STORE_NAMES } from '../db'
import type { DeepSeaDb } from '../db'

/**
 * 家长导入的自定义错题仓储。
 *
 * 与内置题库分开存：
 * - 内置题库是**内容**，随构建发布、只读；
 * - 自定义错题是**家长在本机创建的数据**，可增删、按档案隔离，不能写回内容文件。
 *
 * 题目本身不包含学习进度，进度仍然只从事件日志重放（错题投影引用 questionId），
 * 因此这个仓储是可选的缓存/资源，不是事实来源。
 */
export interface CustomQuestionRepo {
  /** 某档案的全部自定义题目；无记录时返回空数组。 */
  listByProfile(profileId: string): Promise<readonly Question[]>
  /** 追加或覆盖若干题目；同 id 覆盖写。 */
  save(profileId: string, questions: readonly Question[]): Promise<void>
  /** 删除某一道题；不存在时无操作。 */
  remove(profileId: string, questionId: string): Promise<void>
  /** 删除某档案的全部自定义题目（删档时清理关联数据）。 */
  removeByProfile(profileId: string): Promise<void>
}

/** 基于 IndexedDB 的实现。 */
export function createCustomQuestionRepo(db: DeepSeaDb): CustomQuestionRepo {
  return {
    async listByProfile(profileId) {
      const rows = await db.getAllFromIndex(STORE_NAMES.customQuestions, 'by_profile', profileId)
      return rows.map((row) => row.question)
    },
    async save(profileId, questions) {
      const transaction = db.transaction(STORE_NAMES.customQuestions, 'readwrite')
      for (const question of questions) {
        await transaction.store.put({ id: question.id, profileId, question })
      }
      await transaction.done
    },
    async remove(profileId, questionId) {
      const existing = await db.get(STORE_NAMES.customQuestions, questionId)
      if (existing?.profileId === profileId) await db.delete(STORE_NAMES.customQuestions, questionId)
    },
    async removeByProfile(profileId) {
      const transaction = db.transaction(STORE_NAMES.customQuestions, 'readwrite')
      const keys = await transaction.store.index('by_profile').getAllKeys(profileId)
      for (const key of keys) await transaction.store.delete(key)
      await transaction.done
    },
  }
}
