// ───────── 조합(합성) ─────────
// 출처: docs/갓타워디펜스X_VZ056_맵파일분석_v1.0.md §5
//
// 원본은 2단계 파이프라인이다. 같은 유닛 2기가 모이면(AtLeast 2) 요청 카운터를 올리고,
// 별도 생성 트리거가 그 카운터를 소비해 상위 티어 1기를 만든다. 어느 유닛이 나올지는
// 랜덤이 아니라 **공유 인덱스 unit#73**이 정한다(§5.3).
//
// 그 인덱스를 회전시키는 트리거는 EUD에 있어 주기를 읽을 수 없다. 여기서는 매 프레임
// 1..7을 돌리고 생성 순간에 읽는다. 플레이어에게는 랜덤처럼 보이지만 결정적이고,
// 보스를 잡으면 인덱스가 +1 밀려서(trigger #602~#606) 결과 분포가 실제로 바뀐다.

import * as B from '../data/balance';
import { GOD_TIER, TIER_POOLS, godPool, type UnitDef } from '../data/units';
import type { Slot } from './types';

/** 1..PICK_INDEX_MAX 를 순환하는 공유 선택자 */
export class PickIndex {
  private elapsed = 0;
  private offset = 0;

  /** 현재 값 (1..PICK_INDEX_MAX) */
  get value(): number {
    const ticks = Math.floor(this.elapsed / B.PICK_INDEX_PERIOD) + this.offset;
    return (ticks % B.PICK_INDEX_MAX) + 1;
  }

  advanceTime(dt: number): void {
    this.elapsed += dt;
  }

  /** 보스 처치 시 +1 — trigger #602~#606의 SetDeaths(unit#73, Add, 1) */
  bump(): void {
    this.offset += 1;
  }
}

/** 티어 `tier`에서 인덱스 `pick`(1-base)이 가리키는 유닛 */
export function unitFor(tier: number, pick: number, bossesKilled: number): UnitDef {
  const pool = tier === GOD_TIER ? godPool(bossesKilled) : TIER_POOLS[tier];
  return pool[(pick - 1) % pool.length];
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
  pick: number,
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
        produced: unitFor(tier + 1, pick, bossesKilled),
        tier: tier + 1,
        consumed: name,
      };
    }
  }
  return null;
}
