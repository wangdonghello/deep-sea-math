import type { ChineseKind, ChineseQuestion } from './types'

const KIND_ORDER: readonly ChineseKind[] = ['pinyin', 'character', 'word', 'reading', 'poem']

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * 语文每日题组：按 kind 轮换，避免连续两题同一 skill；题量不足时回退到剩余题。
 */
export function pickChineseDaily(
  pool: readonly ChineseQuestion[],
  count = 6,
  random: () => number = Math.random,
): ChineseQuestion[] {
  const buckets = new Map<ChineseKind, ChineseQuestion[]>()
  for (const kind of KIND_ORDER) {
    buckets.set(kind, shuffled(pool.filter((question) => question.kind === kind), random))
  }
  const picked: ChineseQuestion[] = []
  let guard = 0
  while (picked.length < Math.min(count, pool.length) && guard < pool.length * 4) {
    guard += 1
    for (const kind of KIND_ORDER) {
      if (picked.length >= count) break
      const bucket = buckets.get(kind)
      if (bucket === undefined || bucket.length === 0) continue
      const index = bucket.findIndex((question) => question.skill !== picked.at(-1)?.skill)
      if (index === -1) continue
      picked.push(bucket.splice(index, 1)[0])
    }
  }
  if (picked.length < Math.min(count, pool.length)) {
    const chosen = new Set(picked.map((question) => question.id))
    for (const question of shuffled(pool, random)) {
      if (picked.length >= count) break
      if (!chosen.has(question.id)) {
        picked.push(question)
        chosen.add(question.id)
      }
    }
  }
  return picked
}
