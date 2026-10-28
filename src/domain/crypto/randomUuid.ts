/**
 * 生成 UUID v4。
 *
 * `crypto.randomUUID()` 只在安全上下文（HTTPS / localhost）可用；本项目的
 * 服务器预览地址是 `http://IP:端口`，此时它不存在，而创建档案 / 每日题组
 * 都需要 eventId。缺失时退回 `crypto.getRandomValues()`（HTTP 下仍可用），
 * 再缺就退回 `Math.random()`，保证离线/局域网预览也能落库。
 *
 * 不用于加密密钥；只用于事件 ID。
 */
export function randomUuid(): string {
  const cryptoObject = globalThis.crypto

  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof cryptoObject?.getRandomValues === 'function') {
    cryptoObject.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  // RFC 4122：版本 4，variant 10xx。
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}
