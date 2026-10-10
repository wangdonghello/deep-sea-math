/**
 * `src/domain/eventLog/ids` —— 事件 ID 生成。
 *
 * spec `offline-event-log` §离线可用 要求每个事件都带全局唯一的 `eventId`
 * （UUID），它是阶段二幂等同步的锚点，也是本模块与 `appendEvents` 去重的
 * 第一道闸门。
 *
 * 与 design §1 的四个注入点保持一致：`randomUUID` **可注入**。默认实现走
 * Web Crypto 的 `crypto.randomUUID()`，且在**调用时**才解析全局——与
 * `quiz/buildDailyQuest` 的 `defaultIdGenerator` 同一手法，这样 domain 模块
 * 被 import 进不提供该全局的环境（Node 单测）时不会在加载期炸掉。
 */

/** 可注入的 UUID 发生器签名。 */
export type RandomUuid = () => string

/**
 * 默认 UUID 发生器：Web Crypto 的 `crypto.randomUUID()`。
 *
 * 不在模块顶层取 `crypto`，是为了让「未注入又不支持 Web Crypto」的失败
 * 延后到真正生成 ID 的那一刻，而不是在 import 期就抛错。
 */
export const defaultRandomUuid: RandomUuid = () => globalThis.crypto.randomUUID()

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
