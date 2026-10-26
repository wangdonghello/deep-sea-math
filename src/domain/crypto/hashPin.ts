/**
 * `src/domain/crypto/` —— PIN 哈希抽象。
 *
 * PIN 属于验证凭据（Constitution Check §1 安全与合规底线）：**只存哈希、
 * 只比对哈希**，日志与错误信息 MUST NOT 输出明文。本模块是这句话在代码里
 * 的唯一实现点——业务层拿不到哈希算法，只能调 `hashPin` / `verifyPin`。
 *
 * 摘要算法以**参数注入**而不是直接引用 `crypto.subtle`，三个原因：
 * 1. `domain/` 不得依赖浏览器 API，硬编码 `crypto.subtle` 会让本模块的公共
 *    签名被迫依赖 Web Crypto 全局，也把「host 有没有 Web Crypto」变成调用方
 *    要操心的事；
 * 2. 摘要算法是**可替换的安全策略**：将来若要从 SHA-256 迁到带盐迭代的
 *    PBKDF2，改动应被限制在这一层的实现里，不该蔓延到调用方；
 * 3. 测试可注入一个只依赖 `node:crypto` 的同步实现，从而在不依赖宿主全局的
 *    前提下逐分支断言（包括「摘要返回空」这类注入方违约的情形）。
 */

/**
 * 摘要算法窄接口。
 *
 * 刻意**不**写成 `SubtleCrypto['digest']` 或 `BufferSource` 这类 Web Crypto
 * 全局类型：那会让 `domain/` 的公共 API 泄漏浏览器专有类型，调用方（含 Node
 * 侧测试与非浏览器宿主）被迫引入相关 lib 才能引用签名。
 *
 * - `algorithm` 固定为 `'SHA-256'`：PIN 短、本地设备、无人值守离线字典攻击
 *   成本主要由 salt 承担，加迭代次数应在策略层显式决策，不是这里偷偷换算法。
 * - `data` 收 `Uint8Array<ArrayBuffer>`（而非更宽的 `BufferSource`）：让调用方
 *   自行决定编码（这里是 UTF-8），接口本身不预设 Web Crypto 的
 *   `ArrayBufferView` 联合类型；显式的 `ArrayBuffer` 形参同时满足
 *   `crypto.subtle.digest` 对 `ArrayBufferView<ArrayBuffer>` 的要求。
 *   同步或异步实现均可，返回即视为已完成。
 */
import { sha256 } from './sha256'

export type DigestFn = (algorithm: 'SHA-256', data: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>

/** `digest('SHA-256', …)` 的唯一合法算法名，供默认注入与测试对齐。 */
const SHA256 = 'SHA-256' as const

/**
 * 默认摘要注入：优先 Web Crypto；非安全上下文（HTTP 局域网地址）下浏览器
 * 不提供 `crypto.subtle`，此时退回纯 JS SHA-256，否则家长 PIN 会每次保存/
 * 校验都抛错，表现为“一直让重新输入”。
 */
const defaultDigest: DigestFn = (algorithm, data) => {
  const subtle = globalThis.crypto?.subtle
  if (subtle !== undefined) return subtle.digest(algorithm, data)
  return Promise.resolve(sha256(data).buffer as ArrayBuffer)
}

/**
 * 把摘要结果转成小写十六进制字符串。
 *
 * 取 `ArrayBuffer` 而非 `Uint8Array` 是为了与 `DigestFn` 的返回类型严格对齐
 * （Web Crypto 原生返回 `ArrayBuffer`），转换只发生一次且不复制底层内存。
 */
function toHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer)
  let hex = ''
  for (let index = 0; index < view.byteLength; index += 1) {
    hex += view[index].toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * 对 PIN 做加盐哈希，产出小写十六进制摘要。
 *
 * 输入拼装为 `pin + salt`，与 `design.md` §Compliance Plan 的约定逐字一致
 * (`crypto.subtle.digest('SHA-256', pin + per-profile salt)`)。salt 由
 * `profile` 生成时一次性产出并与哈希**同库存储**，因此这里不再额外生成随机
 * 盐 —— 随机数不可注入会破坏 domain 的确定性测试前提。
 *
 * @param pin 待哈希的 PIN 明文，MUST NOT 为空。
 * @param salt 该档案专属的盐，MUST NOT 为空；换盐即换哈希。
 * @param digest 注入的摘要实现，缺省走 Web Crypto。
 * @returns 64 位小写十六进制摘要字符串。
 * @throws {Error} `pin` 或 `salt` 为空 —— 空 PIN / 空盐会静默产生可预测哈希，
 *   与其留着不如尽早失败。
 * @throws {Error} 摘要结果为空 —— 说明注入的 `digest` 名不副实，绝不能把
 *   空串当合法哈希继续比对。
 */
export async function hashPin(
  pin: string,
  salt: string,
  digest: DigestFn = defaultDigest,
): Promise<string> {
  if (pin === '') {
    throw new Error('hashPin: PIN 不能为空')
  }
  if (salt === '') {
    throw new Error('hashPin: salt 不能为空')
  }

  const bytes = new TextEncoder().encode(`${pin}${salt}`)
  const buffer = await digest(SHA256, bytes)

  if (buffer.byteLength === 0) {
    throw new Error('hashPin: 摘要结果为空，注入的 digest 实现不合法')
  }

  return toHex(buffer)
}

/**
 * 校验 PIN 是否匹配已存哈希。
 *
 * 比较走「逐字符累计差异、最后一次性判定」的**常量时间**写法：不上
 * `===`，因为字符串相等是短路比较，攻击者可借响应时间差逐位爆破 PIN。
 *
 * @param pin 待校验的 PIN 明文，MUST NOT 为空。
 * @param salt 建档时使用的盐，必须与哈希时一致。
 * @param hash 已存的十六进制哈希。
 * @param digest 注入的摘要实现，必须与产出 `hash` 时一致。
 * @returns 匹配返回 `true`；PIN 错、盐错或哈希被截断均返回 `false`。
 * @throws {Error} `pin` 或 `salt` 为空 —— 与 {@link hashPin} 同样尽早失败，
 *   不把「输入不合法」伪装成「PIN 不正确」（那会误导上层走重试锁定计数）。
 */
export async function verifyPin(
  pin: string,
  salt: string,
  hash: string,
  digest: DigestFn = defaultDigest,
): Promise<boolean> {
  // 合法性校验复用 hashPin 的同一套规则，避免两份错误文案漂移后
  // 「什么算空输入」在两处变得不一致。
  const computed = await hashPin(pin, salt, digest)

  // 长度不等先返回 false：逐位比较在长度不同的情况下无意义，且这一步不
  // 泄露任何关于 PIN 的信息（长度只与已存哈希的形态有关）。
  if (computed.length !== hash.length) {
    return false
  }

  let difference = 0
  for (let index = 0; index < computed.length; index += 1) {
    // 用结果或运算累积差异，保证循环次数固定、无提前 return。
    difference |= computed.charCodeAt(index) ^ hash.charCodeAt(index)
  }

  return difference === 0
}
