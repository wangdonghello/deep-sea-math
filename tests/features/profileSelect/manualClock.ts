import { createHash } from 'node:crypto'

import type { DigestFn } from '../../../src/domain/crypto/hashPin'

/** 单次 `advance` 内单个定时器最多触发的次数（防御疯摆定时器卡死进程）。 */
const MAX_TICKS_PER_ADVANCE = 10_000

interface Timer {
  /** 下一次到期时刻（虚拟毫秒）。 */
  due: number
  /** 触发周期（毫秒），到点后据此重新排期。 */
  period: number
  handler: () => void
}

/**
 * 手动推进的假时钟，仅供 `tests/features/profileSelect/` 下的用例注入。
 *
 * `setInterval` / `clearInterval` / `now` 与浏览器同源签名，因此同一个实例既能
 * 喂给 composable（`clock` 注入点），也能喂给组件（视图的 `clock` prop）。
 *
 * **语义对齐真实 `setInterval`**：每次触发后定时器会按原周期重新排期，因此
 * `advance(59_000)` 会让 1 秒周期的定时器触发 59 次，`advance(1_000)` 再触发
 * 第 60 次。若只触发一次就不管，“推进 59 秒”与“推进 1 秒”在表现上毫无差别，
 * 于是倒计时的逐秒推进根本测不出来。
 */
export class ManualClock {
  private current = 1_700_000_000_000
  private nextHandle = 1
  private readonly timers = new Map<number, Timer>()

  now(): number {
    return this.current
  }

  setInterval(handler: () => void, ms: number): number {
    const handle = this.nextHandle
    this.nextHandle += 1
    this.timers.set(handle, { due: this.current + ms, period: ms, handler })
    return handle
  }

  clearInterval(handle: number): void {
    this.timers.delete(handle)
  }

  /**
   * 推进 `ms` 毫秒，按到期顺序触发所有定时器（同步、不返回 Promise）。
   *
   * 每轮选出到期最早的定时器触发它，再把它排到下一个周期；若回调内部
   * `clearInterval` 了自己，则不再排期。计时上限见 {@link MAX_TICKS_PER_ADVANCE}。
   */
  advance(ms: number): void {
    this.current += ms

    for (let fired = 0; fired < MAX_TICKS_PER_ADVANCE; fired += 1) {
      const due = this.nextDueTimer()
      if (due === null) return
      due.timer.due += due.timer.period
      due.handler()
      // 回调可能已 clear 掉自己；此时不再排期（map 里已经没有它）。
      if (!this.timers.has(due.handle)) continue
    }
  }

  private nextDueTimer(): { handle: number; timer: Timer; handler: () => void } | null {
    let best: { handle: number; timer: Timer; handler: () => void } | null = null
    for (const [handle, timer] of this.timers.entries()) {
      if (timer.due > this.current) continue
      if (best === null || timer.due < best.timer.due) {
        best = { handle, timer, handler: timer.handler }
      }
    }
    return best
  }
}

/**
 * 同步 SHA-256 的 `DigestFn` 实现，仅供测试注入。
 *
 * 与 `tests/domain/crypto/hashPin.test.ts` 的做法同源：jsdom 不提供
 * `crypto.subtle`，因此这里用 `node:crypto` 提供逐字节等价的摘要实现，
 * 使 `verifyPin` 的真实验证路径（而非替身）可以在组件测试中被驱动。
 */
export const syncSha256: DigestFn = async (_algorithm, data) => {
  const digest = createHash('sha256').update(data).digest()
  return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength)
}
