/**
 * 测试专用：把 `fake-indexeddb` 的整套构造器注入全局。
 *
 * jsdom **不提供** IndexedDB 全局（连 `IDBRequest` 这类配套构造器也没有），
 * 而 `idb` 的包装层内部会 `instanceof IDBRequest` 之类的判断。因此必须
 * **整组赋值**，只赋 `indexedDB` 一项会在读写时抛
 * "TypeError: ... is not a constructor"。
 *
 * 这里刻意用 `await import()` 而不是 `import 'fake-indexeddb/auto'`：
 * `auto` 入口的 package.json `exports` 没有暴露 `types`，`vue-tsc` 会报
 * TS7016「Could not find a declaration file」。动态 import 走 `.` 入口，
 * 该入口显式声明了 `"types": "./types.d.ts"`，类型可解析。
 *
 * 返回值是还原函数：注入前保存全部原值，测试结束后原样恢复（jsdom 下原本
 * 是 `undefined` 的键会被 delete，而不是留一个假实现污染后续测试文件）。
 */

/** 需要整体注入的 IDB 全局键名（真源是 `fake-indexeddb` 的导出名）。 */
const IDB_GLOBALS = [
  'IDBCursor',
  'IDBCursorWithValue',
  'IDBDatabase',
  'IDBFactory',
  'IDBIndex',
  'IDBKeyRange',
  'IDBObjectStore',
  'IDBOpenDBRequest',
  'IDBRequest',
  'IDBTransaction',
  'IDBVersionChangeEvent',
  'indexedDB',
] as const

type MutableGlobal = Record<string, unknown>

/**
 * 注入 fake IndexedDB 并返回还原函数。
 *
 * 用法：`const restore = await installFakeIndexedDb()`，测试结尾（或
 * `afterEach`）调用 `restore()`。
 */
export async function installFakeIndexedDb(): Promise<() => void> {
  const FDB = await import('fake-indexeddb')
  const scope = globalThis as MutableGlobal
  const saved = new Map<string, unknown>()

  for (const key of IDB_GLOBALS) {
    saved.set(key, scope[key])
    scope[key] = (FDB as MutableGlobal)[key]
  }

  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete scope[key]
      } else {
        scope[key] = value
      }
    }
  }
}

/**
 * 以裸 IndexedDB 删除一个库，供 `beforeEach` 清场。
 *
 * 走裸 API 而不是 `idb` 的 `deleteDB`：后者在 `onblocked` 时 reject，而
 * 单个测试文件里前面用例可能忘了 `db.close()`，直接把整个文件带崩。这里
 * 只关心"最终被删掉"，blocked 仅记日志、仍然等 `onsuccess`。
 *
 * @param name 库名。
 */
export function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(name)
    request.onblocked = () => {
      // 有未关闭的连接：fake-indexeddb 会在连接关闭后完成删除。
    }
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
