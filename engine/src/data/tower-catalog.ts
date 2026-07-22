// ───────── 타워 카탈로그 ─────────
// Wiki·도감이 쓰는 파생 데이터 — 풀(TIER_POOLS·GOD_POOL_*)을 열거해 각 타워의
// tier와 GOD 해금 시점을 붙인다. UnitDef에는 tier 필드가 없으므로 여기서만 파생한다.
// GOD 확장 풀은 초기 풀을 spread로 다시 담으므로 ID 기준으로 한 번만 노출한다.

import {
  GOD_POOL_EARLY,
  GOD_POOL_LATE,
  GOD_TIER,
  TIER_POOLS,
  type UnitDef,
} from './units';

export interface CatalogTower {
  /** = def.id — 조회·URL 키 */
  readonly id: string;
  readonly def: UnitDef;
  /** 0..3 = Lv1..Lv4 (TIER_POOLS 인덱스), 4 = GOD */
  readonly tier: number;
  /** GOD 풀 소속 — 초기 풀 / 확장 풀(보스 6처치 해금). GOD가 아니면 null */
  readonly godUnlock: 'early' | 'late' | null;
}

function buildCatalog(): readonly CatalogTower[] {
  const entries: CatalogTower[] = [];

  TIER_POOLS.forEach((pool, tier) => {
    for (const def of pool) entries.push({ id: def.id, def, tier, godUnlock: null });
  });

  const earlyIds = new Set(GOD_POOL_EARLY.map((def) => def.id));
  for (const def of GOD_POOL_EARLY) {
    entries.push({ id: def.id, def, tier: GOD_TIER, godUnlock: 'early' });
  }
  for (const def of GOD_POOL_LATE) {
    if (earlyIds.has(def.id)) continue; // 초기 풀 spread 재등장 — 한 번만
    entries.push({ id: def.id, def, tier: GOD_TIER, godUnlock: 'late' });
  }

  return entries;
}

/** 전체 타워 — 티어 오름차순(풀 순서 보존), GOD는 초기 풀 먼저 */
export const TOWER_CATALOG: readonly CatalogTower[] = buildCatalog();

const BY_ID: ReadonlyMap<string, CatalogTower> = new Map(
  TOWER_CATALOG.map((entry) => [entry.id, entry]),
);

/** ID로 카탈로그 항목을 찾는다 — 없는 ID면 undefined (Wiki 상세 404 처리용) */
export function towerById(id: string): CatalogTower | undefined {
  return BY_ID.get(id);
}
