/**
 * `src/shared/` —— 跨功能域共享的横切工具。
 *
 * 这里只放**与业务无关**的小工具（当前仅 `redact`）。之所以不为它单开一个
 * `src/utils/`：`shared` 这个名字同时约束了两件事 —— 可被任意层引用（不属于
 * 任何功能域），以及**不得包含业务规则**（否则它就会变成第二个 domain）。
 */

/**
 * 敏感字段名清单（脱敏命中的完整键名）。
 *
 * 匹配规则是**完整键名大小写不敏感精确匹配**，不是子串匹配。这一点是刻意
 * 的：子串匹配会把 `spin`、`napping`、`saltMeter` 这类无害字段误伤成 `***`，
 * 既污染日志可读性，也让「哪些字段真的被脱敏」变成一场猜谜。
 *
 * **仓库内实际使用的凭据字段（对齐各层真实写法，不凭猜测扩面）**：
 * - `domain/model` `Profile`：`pinHash` / `salt`（Task 2、Task 9 唯一一对哈希字段）
 * - 其余是跨层通用的兜底名（token / password / secret / authorization / apikey /
 *   privatekey），阶段二接入同步与云函数时直接命中，无需再改本清单
 *
 * **新增凭据字段时必须同步本清单 + `tests/shared/redact.test.ts` 的用例**：
 * 脱敏工具的正确性本身就是一条安全需求（spec `child-profiles` §不采集敏感
 * 信息），漏一个键名的代价是某类凭据静默进入日志，而这类泄露没有任何测试
 * 会报错。同理，**不要**为了"以防万一"把 `pin*`、`*hash` 之类前缀/后缀规则
 * 加进来：那会把 `pinLength`（PIN 位数，4）这类非敏感字段一起掩掉，也会让
 * 「哪些字段被脱敏」重新变成猜谜。宁可显式列名 + 改的时候肉疼一下。
 */
const SENSITIVE_KEYS: readonly string[] = [
  /** PIN 明文与 PIN 哈希：档案切换凭据。 */
  'pin',
  'pinhash',
  /** 哈希盐：与 pinHash 合起来等价于口令。 */
  'salt',
  /** 常见的其他凭据字段名，统一兜底。 */
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'secret',
  'authorization',
  'apikey',
  'privatekey',
]

/** 脱敏后写入的占位符。 */
const MASK = '***'

/**
 * 判断键名是否命中敏感清单。
 *
 * 归一化方式：`trim()` + `toLowerCase()`。前者防的是外部拼装出的键名带意外
 * 空白，后者让 `PIN` / `pinHash` / `Salt` 都能命中——日志对象的键大小写
 * 来自各处手写代码，不归一化就等于给绕过留门。
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(key.trim().toLowerCase())
}

/**
 * 递归脱敏：把敏感键的值替换为 `'***'`，其余内容原样保留。
 *
 * 设计取舍（相对“只脱敏顶层”）：
 * 1. **递归**：日志对象常常是 `{ debug: { pin } }` 这类嵌套形态，只处理顶层
 *    等于没有保护。
 * 2. **键名匹配而非值匹配**：值匹配（比如“4 位数字看起来像 PIN”）既慢又会
 *    误伤题目答案之类的正常数字；而键名是“这段数据是什么”的显式声明。
 * 3. **不修改入参**：脱敏后的对象仍可能被别处复用，原地改写会让调用方看到
 *    自己没预期过的变化。返回一个新结构，`undefined` 值也照实返回。
 * 4. **循环引用安全**：用 `Map` 记录「原对象 → 已脱敏副本」，自引用结构
 *    直接复用副本而不是无限递归——日志里出现循环引用不太可能，但一旦出现
 *    让日志工具自己把进程卡死比丢一条日志糟糕得多。同时 `null` / `undefined`
 *    原样返回：把“没有值”掩码成 `'***'` 会让读日志的人误以为这里真有一个
 *    秘密值，反而制造假警报。
 *
 * @param value 待脱敏的任意值（对象、数组或原始值）。
 * @returns 结构相同但敏感字段已被掩码的新值；原始值直接返回。
 *
 * **类型说明**：`Date` / `Error` / `Map` / `Set` 会被转成日志友好的等价形态
 * （ISO 串 / `{name,message,stack}` / `[键,值]` 数组 / 数组）而不是原样透传。
 * 这是有意的：这些容器在 `JSON.stringify` 下本就会丢失信息，转成显式形态
 * 才不会让日志退化成空心对象。签名上的 `T` 因此只是"同一处调用点的便利"，
 * 不代表运行期类型逐字不变。
 */
export function redact<T>(value: T): T {
  return redactValue(value, new Map()) as T
}

function redactValue(value: unknown, cache: Map<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  /*
   * 循环引用：返回**已脱敏的副本**而不是原对象。
   *
   * 副本必须先登记再填充（`Map` 在此处充当“正在处理”的占位），否则自引用
   * 结构只能拿到尚未脱敏的原对象 —— 那样 `self` 会绕过脱敏把 `pin` 又带回
   * 输出里。用 `Map` 而不是 `WeakSet` 正是因为需要“对象 → 副本”的映射，
   * `WeakSet` 只能回答“见过没有”，答不了“副本是哪个”。
   */
  const cached = cache.get(value)
  if (cached !== undefined) {
    return cached
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = []
    cache.set(value, copy)
    value.forEach((item) => {
      copy.push(redactValue(item, cache))
    })
    return copy
  }

  /*
   * 类实例显式处理（必须排在通用 `Object.entries` 分支之前）。
   *
   * `Object.entries` 只取**可枚举自有属性**，因此 `new Date()` 会变成 `{}`、
   * `Error` 的 `message` / `stack` 会被静默丢弃 —— 脱敏确实生效，但排查信息
   * 一起没了，日志退化成 `{ event, error: {} }` 这种空心对象。本功能自己的
   * 两个日志点（`profile-list-failed` / `pin-verify-failed`）正是踩在这里。
   */
  if (value instanceof Date) {
    // 日期转 ISO 串：可读、可排序，且不带任何本地时区歧义。
    const iso = value.toISOString()
    cache.set(value, iso)
    return iso
  }

  if (value instanceof Error) {
    const output: Record<string, unknown> = {}
    cache.set(value, output)
    output.name = value.name
    output.message = value.message
    if (value.stack !== undefined) {
      output.stack = value.stack
    }
    /*
     * 可枚举自有属性仍递归脱敏。`Object.assign(err, { pin })` 是把上下文挂到
     * 异常上的常见写法，那些字段该掩照样掩 —— 保留 message 不等于放开异常
     * 身上捎带的自定义属性。
     */
    for (const [key, item] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? MASK : redactValue(item, cache)
    }
    return output
  }

  if (value instanceof Map) {
    // 转成 `[键, 值]` 数组：JSON 序列化不出 Map，日志出口多半最终要落 JSON。
    const copy: unknown[] = []
    cache.set(value, copy)
    for (const [key, item] of value.entries()) {
      /*
       * Map 的**字符串键**相当于对象的字段名：`['pin', '1234']` 语义上就是
       * `{ pin: '1234' }`。所以键命中敏感清单时掩的是**值**，键本身保留 ——
       * 保留键才能从日志里看出"掩的是哪一个字段"，全掩成 `['***','***']`
       * 只会让人猜。非字符串键无字段名语义，值照常递归。
       */
      const redactedItem =
        typeof key === 'string' && isSensitiveKey(key) ? MASK : redactValue(item, cache)
      copy.push([key, redactedItem])
    }
    return copy
  }

  if (value instanceof Set) {
    const copy: unknown[] = []
    cache.set(value, copy)
    for (const item of value.values()) {
      copy.push(redactValue(item, cache))
    }
    return copy
  }

  const output: Record<string, unknown> = {}
  cache.set(value, output)
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // `null` / `undefined` 原样返回：理由见上方设计说明第 4 点。
    if (item === null || item === undefined) {
      output[key] = item
      continue
    }
    output[key] = isSensitiveKey(key) ? MASK : redactValue(item, cache)
  }
  return output
}
