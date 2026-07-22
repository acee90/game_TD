// ───────── Wiki 타워 계열(라인) 그룹핑 ─────────
// tower-lines.ts는 명칭 기준 참고 구성이라 손으로 매핑한다 — units.ts에 타워가
// 추가·변경되는데 이 매핑을 안 고치면 Wiki에서 조용히 빠지거나 어긋난다. 그 드리프트를
// 여기서 잡는다. 실제 합성 로직(engine/src/game/merge.ts)과는 무관함을 전제로 한다.

import { describe, expect, test } from 'vitest';
import { TOWER_CATALOG } from '@engine/data/tower-catalog';
import { GOD_TIER, RACES } from '@engine/data/units';
import { buildRaceGroups, lineStepFor, TOWER_LINES } from '../src/lib/wiki/tower-lines';

const nonGodEntries = TOWER_CATALOG.filter((e) => e.tier !== GOD_TIER);

describe('TOWER_LINES — 데이터 일관성', () => {
  test('일반 티어(Lv1~4) 타워가 정확히 하나의 라인 단계에 한 번씩만 등장한다', () => {
    const allSteps = TOWER_LINES.flatMap((line) => line.steps);
    expect(new Set(allSteps).size).toBe(allSteps.length); // 중복 없음
    expect(new Set(allSteps)).toEqual(new Set(nonGodEntries.map((e) => e.id))); // 누락 없음
  });

  test('각 라인은 길이 4(Lv1~Lv4)이고 각 단계의 실제 tier가 인덱스와 일치한다', () => {
    for (const line of TOWER_LINES) {
      expect(line.steps.length).toBe(4);
      line.steps.forEach((id, index) => {
        const entry = TOWER_CATALOG.find((e) => e.id === id);
        expect(entry, `${line.id}[${index}] = ${id}`).toBeDefined();
        expect(entry?.tier, `${line.id}[${index}] = ${id}`).toBe(index);
      });
    }
  });

  test('각 라인의 모든 단계가 라인이 선언한 병과와 일치한다', () => {
    for (const line of TOWER_LINES) {
      for (const id of line.steps) {
        const entry = TOWER_CATALOG.find((e) => e.id === id);
        expect(entry?.def.race, id).toBe(line.race);
      }
    }
  });

  test('GOD 등급 타워는 어떤 라인에도 속하지 않는다', () => {
    const godIds = new Set(TOWER_CATALOG.filter((e) => e.tier === GOD_TIER).map((e) => e.id));
    for (const line of TOWER_LINES) {
      for (const id of line.steps) expect(godIds.has(id)).toBe(false);
    }
  });

  test('lineStepFor — 일반 타워는 라인·인덱스를 찾고, GOD 타워는 undefined다', () => {
    for (const line of TOWER_LINES) {
      line.steps.forEach((id, index) => {
        expect(lineStepFor(id)).toEqual({ line, index });
      });
    }
    for (const entry of TOWER_CATALOG.filter((e) => e.tier === GOD_TIER)) {
      expect(lineStepFor(entry.id)).toBeUndefined();
    }
  });
});

describe('buildRaceGroups', () => {
  const groups = buildRaceGroups();

  test('병과 4개를 RACES 순서 그대로 담는다', () => {
    expect(groups.map((g) => g.race)).toEqual([0, 1, 2, 3]);
    expect(groups.map((g) => g.raceLabel)).toEqual([...RACES]);
  });

  test('모든 일반 티어 타워가 정확히 한 그룹의 한 라인에 한 번씩 등장한다', () => {
    const seen = groups.flatMap((g) => g.lines.flatMap((line) => line.steps.map((t) => t.id)));
    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(seen)).toEqual(new Set(nonGodEntries.map((e) => e.id)));
  });

  test('각 그룹의 라인은 그 병과 소속이고, 라인 안 타워도 그 병과다', () => {
    for (const group of groups) {
      for (const line of group.lines) {
        for (const tower of line.steps) expect(tower.race).toBe(group.race);
      }
    }
  });

  test('GOD 타워는 병과별로 중복·누락 없이 나뉘고 early가 late보다 앞에 온다', () => {
    const seenGod = groups.flatMap((g) => g.godTowers.map((t) => t.id));
    const expectedGod = TOWER_CATALOG.filter((e) => e.tier === GOD_TIER).map((e) => e.id);
    expect(new Set(seenGod)).toEqual(new Set(expectedGod));
    expect(seenGod.length).toBe(expectedGod.length);

    for (const group of groups) {
      const unlocks = group.godTowers.map((t) => t.godUnlock);
      const lateStart = unlocks.indexOf('late');
      if (lateStart >= 0) {
        expect(unlocks.slice(lateStart).every((u) => u === 'late')).toBe(true);
      }
    }
  });
});
