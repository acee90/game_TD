// ───────── 조합(합성) ─────────
// 출처: docs/reference/god-td-x-vz056-map-analysis-v1.0.md §5
//
// 원본은 2단계 파이프라인이다. 같은 유닛 2기가 모이면(AtLeast 2) 요청 카운터를 올리고,
// 별도 생성 트리거가 그 카운터를 소비해 상위 티어 1기를 만든다.
//
// 원본에서 티어 내 유닛 선택은 공유 인덱스 unit#73으로 결정되지만(§5.3), 그 인덱스를
// 회전시키는 트리거가 EUD에 있어 주기를 읽을 수 없다. 즉 플레이어 입장에서 관측되는
// 동작은 랜덤과 구분되지 않는다. 이 프로토는 그냥 균등 랜덤으로 뽑는다.

import * as B from '../data/balance';
import { GOD_TIER, TIER_POOLS, godPool, type UnitDef } from '../data/units';
import type { Slot } from './types';

/** 0 이상 1 미만의 난수를 돌려주는 함수 */
export type Rand = () => number;

export const poolFor = (tier: number, bossesKilled: number): readonly UnitDef[] =>
  tier === GOD_TIER ? godPool(bossesKilled) : TIER_POOLS[tier];

/** 티어 `tier`의 풀에서 한 유닛을 균등 랜덤으로 뽑는다 */
export function unitFor(tier: number, rand: Rand, bossesKilled: number): UnitDef {
  const pool = poolFor(tier, bossesKilled);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

export interface MergeResult {
  readonly slot: Slot;
  readonly produced: UnitDef;
  readonly tier: number;
  readonly consumed: string;
}

/**
 * 같은 이름 유닛이 MERGE_REQUIRED기 모인 가장 낮은 티어를 한 번 조합한다.
 * 연쇄 조합은 호출자가 반복 호출해서 처리한다.
 */
export function findMerge(
  slots: readonly Slot[],
  rand: Rand,
  bossesKilled: number,
): MergeResult | null {
  for (let tier = 0; tier < GOD_TIER; tier++) {
    const byName = new Map<string, Slot[]>();
    for (const slot of slots) {
      if (!slot.tower || slot.tower.tier !== tier) continue;
      const group = byName.get(slot.tower.def.name) ?? [];
      group.push(slot);
      byName.set(slot.tower.def.name, group);
    }
    for (const [name, group] of byName) {
      if (group.length < B.MERGE_REQUIRED) continue;
      return {
        slot: group[0],
        produced: unitFor(tier + 1, rand, bossesKilled),
        tier: tier + 1,
        consumed: name,
      };
    }
  }
  return null;
}
