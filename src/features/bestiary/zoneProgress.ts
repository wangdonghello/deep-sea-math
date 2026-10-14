import { BASE_ZONE, ZONES } from '../home/zones'

/**
 * `features/bestiary/zoneProgress.ts` — 区域进度的**唯一**推算口径。
 *
 * 为什么单独一个模块：早前"当前在哪一区"有两套算法——首页按"今天这组题
 * 完成没完成"给 0/1（`useHomeQuest`），地图 Tab 页按事件投影取最深已解锁区
 * （`useBestiary`）。两套口径在孩子完成过不止一组题时给出不同答案：地图
 * Tab 页显示深渊区，首页却只高亮到暮光区。孩子看到的是两张互相矛盾的地图。
 *
 * 现在两边都调 {@link resolveZoneProgress}。规则只有一条：**当前所在区 =
 * 已解锁区域中深度最大的那个**；一个都没解锁时为潜水艇基地。这与
 * `useBestiary` 原有口径一致（地图 Tab 页本来就是对的），变的是首页。
 *
 * 为什么"最深"而不是"第一个"：spec §完成题组推进深度——每完成一组向下潜
 * 一区，且答错不回退（design §3）。因此区域进度是单调向下的，最深已解锁
 * 区即当前位置。
 *
 * 纯函数、不读存储、不碰时钟：相同解锁集合反复求值必得同一结果。
 */

/** 区域进度（纯展示数据，由调用方转成各自 UI 的高亮态）。 */
export interface ZoneProgress {
  /** 当前所在区域 id；一个都没解锁时为 {@link BASE_ZONE} 的 id。 */
  readonly currentZoneId: string
  /** 当前所在区域在 {@link ZONES} 中的下标（0 基）；在基地时为 -1。 */
  readonly currentZoneIndex: number
  /** 已解锁的区域 id 集合（不含基地）。 */
  readonly unlockedZoneIds: ReadonlySet<string>
  /** 下一个待解锁区域；四区全解锁时为 `undefined`。 */
  readonly nextZoneId: string | undefined
}

/**
 * 由已解锁区域集合推算当前进度。
 *
 * @param unlockedZoneIds 已解锁的区域 id 集合（来自投影的 `zone:*` 键，
 *   调用方负责剥前缀；传入未知 id 不影响结果——只认 {@link ZONES} 里的配置）
 * @returns 见 {@link ZoneProgress}
 */
export function resolveZoneProgress(unlockedZoneIds: ReadonlySet<string>): ZoneProgress {
  const known = ZONES.filter((zone) => unlockedZoneIds.has(zone.id))
  // 最深已解锁区 = 数组中最后命中的那个（ZONES 顺序即下潜顺序，见 zones.ts）
  const current = known[known.length - 1]
  const next = ZONES.find((zone) => !unlockedZoneIds.has(zone.id))
  return {
    currentZoneId: current?.id ?? BASE_ZONE.id,
    currentZoneIndex: current === undefined ? -1 : ZONES.indexOf(current),
    unlockedZoneIds,
    nextZoneId: next?.id,
  }
}

/**
 * 从 `bestiaryUnlock` 投影键集合里剥出区域 id。
 *
 * 与 `app/questContext.ts` 里那段同形代码是**有意的重复**：那边属于装配层
 * (`src/app/`)，而这里是 `features/`；`features/` MUST NOT 反向依赖
 * `app/`（依赖方向：views → router → features → domain，`data` 与 `domain`
 * 平级，`app/` 只被 `router/routes` 消费）。两处都只有三行，重复的代价远
 * 小于为它开一条反向依赖。
 */
export function zoneIdsFromUnlockKeys(
  unlockKeys: Iterable<string>,
  prefix = 'zone:',
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const key of unlockKeys) {
    if (key.startsWith(prefix)) ids.add(key.slice(prefix.length))
  }
  return ids
}
