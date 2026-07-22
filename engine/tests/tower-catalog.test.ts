// ───────── 타워 카탈로그 · Wiki view-model ─────────
// Wiki URL의 키인 UnitDef.id의 유일성·형식과, Wiki 표시 수치가 combat.ts 결과와
// 정확히 일치함을 강제한다 (exec-plans/website-shell-tower-wiki.md §4, M3 게이트).
// 밸런스 수치를 하드코딩하지 않는다 — 수치의 원본은 코드다.

import { describe, expect, test } from 'vitest';
import {
  GOD_POOL_EARLY,
  GOD_POOL_LATE,
  GOD_TIER,
  TIER_POOLS,
  type Race,
  type UnitDef,
} from '../src/data/units';
import { TOWER_CATALOG, towerById } from '../src/data/tower-catalog';
import { towerWikiView, towerWikiViewById, WIKI_UPGRADES } from '../src/lib/tower-wiki';
import {
  attackInterval,
  damage,
  isCreature,
  isSplash,
  range,
  slowFactor,
  splashRadius,
} from '../src/game/combat';
import type { Tower } from '../src/game/types';

/** 풀에 등장하는 모든 def — GOD_POOL_LATE는 초기 풀 spread를 포함하므로 전체를 덮는다 */
const ALL_POOL_DEFS: readonly UnitDef[] = [...TIER_POOLS.flat(), ...GOD_POOL_LATE];

describe('UnitDef.id — 안정 ID 계약', () => {
  test('모든 풀에서 ID가 유일하다 (같은 def 재등장은 허용)', () => {
    const byId = new Map<string, UnitDef>();
    for (const def of ALL_POOL_DEFS) {
      const seen = byId.get(def.id);
      // GOD 확장 풀의 spread처럼 같은 객체의 재등장은 중복이 아니다
      if (seen) expect(seen).toBe(def);
      byId.set(def.id, def);
    }
    // GOD_POOL_LATE는 초기 풀 4종을 이미 포함한다 — 고유 수 = 티어 28 + GOD 11
    expect(byId.size).toBe(TIER_POOLS.flat().length + GOD_POOL_LATE.length);
  });

  test('ID는 영문 kebab-case다', () => {
    for (const def of ALL_POOL_DEFS) {
      expect(def.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  test('ID 접두사가 병과와 일치한다', () => {
    const PREFIX: Record<Race, string> = { 0: 'army-', 1: 'artillery-', 2: 'magic-', 3: 'summon-' };
    for (const def of ALL_POOL_DEFS) {
      expect(def.id.startsWith(PREFIX[def.race]), `${def.id} (${def.name})`).toBe(true);
    }
  });
});

describe('타워 카탈로그', () => {
  test('GOD 중복 없이 전체 풀을 한 번씩 담는다', () => {
    // GOD_POOL_LATE는 초기 풀 4종을 이미 포함한다 — 고유 수 = 티어 28 + GOD 11
    const expected = TIER_POOLS.flat().length + GOD_POOL_LATE.length;
    expect(TOWER_CATALOG.length).toBe(expected);
    expect(new Set(TOWER_CATALOG.map((e) => e.id)).size).toBe(TOWER_CATALOG.length);
  });

  test('tier 파생이 소속 풀과 일치한다', () => {
    for (const entry of TOWER_CATALOG) {
      if (entry.tier === GOD_TIER) {
        expect(GOD_POOL_LATE).toContain(entry.def);
      } else {
        expect(TIER_POOLS[entry.tier]).toContain(entry.def);
      }
    }
  });

  test('GOD 해금 시점 파생 — 초기 4 · 확장 7, 그 외 null', () => {
    const god = TOWER_CATALOG.filter((e) => e.tier === GOD_TIER);
    expect(god.filter((e) => e.godUnlock === 'early').map((e) => e.def)).toEqual([...GOD_POOL_EARLY]);
    expect(god.filter((e) => e.godUnlock === 'late').length).toBe(
      GOD_POOL_LATE.length - GOD_POOL_EARLY.length,
    );
    for (const entry of TOWER_CATALOG.filter((e) => e.tier !== GOD_TIER)) {
      expect(entry.godUnlock).toBeNull();
    }
  });

  test('towerById — 전수 왕복 조회, 없는 ID는 undefined', () => {
    for (const entry of TOWER_CATALOG) {
      expect(towerById(entry.id)).toBe(entry);
    }
    expect(towerById('no-such-tower')).toBeUndefined();
  });
});

describe('Wiki view-model — 수치는 combat.ts 결과와 일치한다', () => {
  test('기준 업그레이드는 0이다', () => {
    expect(WIKI_UPGRADES).toEqual([0, 0, 0, 0]);
  });

  test('전 타워의 원시 수치가 같은 입력의 combat 함수 결과와 같다', () => {
    for (const entry of TOWER_CATALOG) {
      const view = towerWikiView(entry);
      const tower: Tower = { def: entry.def, tier: entry.tier, cooldown: 0 };
      expect(view.damage).toBe(damage(tower, [0, 0, 0, 0]));
      expect(view.attackInterval).toBe(attackInterval(tower));
      expect(view.dps).toBe(view.damage / view.attackInterval);
      expect(view.range).toBe(range(tower));
      if (isSplash(tower)) expect(view.splashRadius).toBe(splashRadius(tower));
      else expect(view.splashRadius).toBeNull();
      if (isCreature(tower)) expect(view.slowFactor).toBe(slowFactor(tower));
      else expect(view.slowFactor).toBeNull();
    }
  });

  test('표시 문자열은 게임 내 패널과 같은 반올림 규칙이다', () => {
    for (const entry of TOWER_CATALOG) {
      const view = towerWikiView(entry);
      expect(view.text.damage).toBe(view.damage.toFixed(0));
      const rate = 1 / Math.max(0.01, view.attackInterval);
      expect(view.text.attacksPerSecond).toBe(rate >= 10 ? rate.toFixed(1) : rate.toFixed(2));
      expect(view.text.dps).toBe((view.damage / view.attackInterval).toFixed(0));
      expect(view.text.range).toBe(view.range.toFixed(0));
      if (view.splashRadius !== null) expect(view.text.splashRadius).toBe(view.splashRadius.toFixed(0));
      if (view.slowFactor !== null) {
        expect(view.text.slow).toBe(`이동속도 ${Math.round(view.slowFactor * 100)}%로 감속`);
      }
    }
  });

  test('towerWikiViewById — 조회 성공·실패', () => {
    for (const entry of TOWER_CATALOG) {
      expect(towerWikiViewById(entry.id)?.id).toBe(entry.id);
    }
    expect(towerWikiViewById('no-such-tower')).toBeUndefined();
  });
});
