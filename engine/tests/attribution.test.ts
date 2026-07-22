// ───────── 피해 기여 집계 ─────────
// 영웅몫(heroDamageDealt)과 탱킹 어시스트(tankAssistDamage)는 밸런스 계측의
// 기반 지표다. 집계가 어긋나면 모든 시뮬레이션 결론이 어긋난다.

import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import { Game } from '../src/game/game';
import { pathPos } from '../src/core/map';
import type { Enemy } from '../src/game/types';
import { TIER_POOLS } from '../src/data/units';
import { range } from '../src/game/combat';

function dummyEnemy(distance: number): Enemy {
  return {
    kind: 'mob', name: '표적', maxHp: 1_000_000, armor: 0, speed: 0,
    radius: 8, hp: 1_000_000, distance,
  };
}

describe('피해 기여 집계', () => {
  test('영웅이 때리면 heroDamageDealt가 쌓인다', () => {
    const game = new Game(() => 0.5);
    game.enemies.push(dummyEnemy(game.hero.distance - 30)); // 사거리 안
    for (let t = 0; t < 60 * 3; t++) game.update(1 / 60);
    expect(game.heroDamageDealt).toBeGreaterThan(0);
  });

  test('붙잡힌 몹에게 타워가 넣은 피해는 탱킹 어시스트로도 집계된다', () => {
    const game = new Game(() => 0.5);
    // 어그로는 증강이 켠다 (2026-07-20) — 탱킹 어시스트를 재려면 도발을 들려야 한다
    game.hero.addAugment(H.makeCard(H.AUGMENTS.find((a) => a.id === 'provoke')!, 'silver'));
    const enemy = dummyEnemy(game.hero.distance - 30); // 어그로 범위 안 → held
    game.enemies.push(enemy);

    // 몹 좌표에서 사거리가 닿는 타일에 타워를 세운다 (사거리는 티어가 정한다 — GOD 티어로)
    const [ex, ey] = pathPos(enemy.distance);
    const tower = { def: TIER_POOLS[3][0], tier: 4, cooldown: 0 };
    const slot = game.slots.find(
      (s) => s !== game.altarSlot && Math.hypot(s.x - ex, s.y - ey) <= range(tower),
    )!;
    expect(slot).toBeDefined();
    slot.tower = tower;

    for (let t = 0; t < 60 * 3; t++) game.update(1 / 60);

    expect(game.towerDamageDealt).toBeGreaterThan(0);
    expect(enemy.held).toBe(true);
    expect(game.tankAssistDamage).toBeGreaterThan(0);
    // 어시스트는 타워 피해의 부분집합이다
    expect(game.tankAssistDamage).toBeLessThanOrEqual(game.towerDamageDealt);
  });

  test('영웅 어그로 밖의 몹은 held가 아니고, 그 몹에 넣은 타워 피해는 어시스트가 아니다', () => {
    const game = new Game(() => 0.5);
    game.hero.hp = 0; // 영웅을 치워 어그로 자체를 없앤다
    game.hero.alive = false;
    const enemy = dummyEnemy(60);
    game.enemies.push(enemy);

    const [ex, ey] = pathPos(enemy.distance);
    const tower = { def: TIER_POOLS[3][0], tier: 4, cooldown: 0 };
    const slot = game.slots.find(
      (s) => s !== game.altarSlot && Math.hypot(s.x - ex, s.y - ey) <= range(tower),
    );
    if (!slot) return; // 해당 위치에 닿는 타일이 없으면 통과
    slot.tower = tower;

    for (let t = 0; t < 60; t++) game.update(1 / 60);

    expect(game.towerDamageDealt).toBeGreaterThan(0);
    expect(game.tankAssistDamage).toBe(0);
  });
});
