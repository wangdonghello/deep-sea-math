/**
 * `src/domain/eventLog/ids` —— 事件 ID 生成。
 *
 * spec `offline-event-log` §离线可用 要求每个事件都带全局唯一的 `eventId`
 * （UUID），它是阶段二幂等同步的锚点，也是本模块与 `appendEvents` 去重的
 * 第一道闸门。
 *
 * 与 design §1 的四个注入点保持一致：`randomUUID` **可注入**。默认实现走
 * {@link randomUuid}：优先 Web Crypto 的 `crypto.randomUUID()`，HTTP 非安全
 * 上下文则退回 `getRandomValues` 生成 v4 UUID。
 */

import { randomUuid } from '@/domain/crypto/randomUuid'

/** 可注入的 UUID 发生器签名。 */
export type RandomUuid = () => string

/**
 * 默认 UUID 发生器：安全上下文走 `crypto.randomUUID()`，HTTP 预览地址退回
 * `getRandomValues`，避免创建档案时因缺少 Web Crypto 而反复回到创建页。
 */
export const defaultRandomUuid: RandomUuid = () => randomUuid()

/**
 * 生成一个事件 ID。
 *
 * @param randomUuid 注入的 UUID 发生器；缺省 {@link defaultRandomUuid}。
 *   测试注入固定发生器（如自增序号）即可让事件 ID 可复现。
 * @returns 一条全局唯一的事件 ID。
 */
export function createEventId(randomUuid: RandomUuid = defaultRandomUuid): string {
  return randomUuid()
}
