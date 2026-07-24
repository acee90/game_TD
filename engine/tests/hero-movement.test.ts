// 영웅 클릭 지점 이동 — 진행도 + 횡오프셋 모델 (docs/exec-plans/hero-point-movement.md)
// M0 기준 고정 + M1 게이트: 클릭 오차 ≤ 1px · 대각 이동 속도 상한 · 코너 무순간이동.
// FIXTURE 케이스는 Unity Core 미러(M3)와 수치를 비교하는 기준이다.

import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import {
  ALTAR_PATH_DISTANCE,
  CENTER,
  CORNER_BLEND,
  PATH_LENGTH,
  WALKABLE_HALF_WIDTH,
  WAYPOINTS,
  nearestPathDistance,
  pathPos,
  projectToPath,
} from '../src/core/map';
import { Hero } from '../src/game/hero';

describe('projectToPath — 클릭 좌표 분해', () => {
  test('중앙선 위 점은 lateral 0, 옛 nearestPathDistance와 같은 진행도', () => {
    for (const d of [30, 120, 300, 700, PATH_LENGTH - 30]) {
      const [x, y] = pathPos(d);
      const p = projectToPath(x, y);
      expect(Math.abs(p.lateral)).toBeLessThan(1e-6);
      expect(Math.abs(p.distance - d)).toBeLessThan(0.5);
      expect(Math.abs(nearestPathDistance(x, y) - d)).toBeLessThan(0.5);
    }
  });

  test('직선 구간 가장자리 클릭 — 실제 목적지 오차 1px 이하 (보행 폭 안)', () => {
    // 좌측 세로 구간 (156,52)→(156,196)의 안쪽: x로 ±22 비껴 클릭(보행 반폭 36 안, 코너서 멀리)
    for (const [cx, cy] of [
      [178, 100],
      [134, 110],
      [178, 140],
    ] as const) {
      const p = projectToPath(cx, cy);
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThanOrEqual(1);
    }
  });

  test('보행 영역 밖 클릭은 폭 안으로 보정된다', () => {
    const p = projectToPath(172 + 40, 100); // 길에서 40px 밖
    expect(Math.abs(p.lateral)).toBeLessThanOrEqual(WALKABLE_HALF_WIDTH);
    // 보정된 목적지는 중심선에서 딱 보행 반폭
    const [mx, my] = pathPos(p.distance);
    expect(Math.hypot(p.x - mx, p.y - my)).toBeLessThanOrEqual(WALKABLE_HALF_WIDTH + 1e-6);
  });

  test('FIXTURE — Unity Core 미러와 비교하는 기준값', () => {
    // (입력 x, y) → (distance, lateral) — M3에서 C# ProjectToPath가 같은 값을 내야 한다
    const fixture = [
      { in: [178, 100], out: projectToPath(178, 100) },
      { in: [40, 250], out: projectToPath(40, 250) },
      { in: [248, 432], out: projectToPath(248, 432) },
      { in: [CENTER[0], CENTER[1]], out: projectToPath(CENTER[0], CENTER[1]) },
    ];
    // 스냅샷 대신 자기서술 — 회귀가 생기면 여기가 깨진다.
    // (178,100)은 좌측 세로 통로(중심선 x=156): 입구 40 + (100−52) = 진행도 88,
    // 중심선에서 오른쪽 22px이므로 좌법선 기준 −22.
    expect(fixture[0].out.distance).toBeCloseTo(88, 0);
    expect(fixture[0].out.lateral).toBeCloseTo(-22, 5);
    expect(Math.abs(fixture[3].out.lateral)).toBeLessThanOrEqual(WALKABLE_HALF_WIDTH);
  });
});

describe('영웅 이동 — 2D 속도 예산과 연속성', () => {
  const mkHero = () => new Hero(ALTAR_PATH_DISTANCE);

  test('대각 이동(진행+횡)이 이동 속도를 넘지 않는다', () => {
    const hero = mkHero();
    const speed = hero.stats.moveSpeed;
    hero.moveTo(hero.x + 60, hero.y + 9); // 진행 + 횡 동시
    const dt = 1 / 60;
    let prev = [hero.x, hero.y] as const;
    for (let i = 0; i < 240; i++) {
      hero.step(dt);
      const cur = [hero.x, hero.y] as const;
      const moved = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      // 코너 감쇠가 횡좌표를 살짝 보태므로 소폭 여유
      expect(moved).toBeLessThanOrEqual(speed * dt * 1.8 + 1e-6);
      prev = cur;
    }
  });

  test('90도 코너를 가로질러도 순간이동이 없다', () => {
    const hero = mkHero();
    const dt = 1 / 60;
    const speed = hero.stats.moveSpeed;
    // 내부 코너 하나(웨이포인트 2번 = (156,196))를 사이에 둔 두 지점
    hero.distance = nearestPathDistance(172, 190);
    hero.lateral = WALKABLE_HALF_WIDTH;
    hero.moveTo(150, 212 + 20); // 코너 너머, 가장자리
    let prev = [hero.x, hero.y] as const;
    for (let i = 0; i < 600; i++) {
      hero.step(dt);
      const cur = [hero.x, hero.y] as const;
      const jump = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      expect(jump).toBeLessThanOrEqual(speed * dt + CORNER_BLEND * 0.25);
      prev = cur;
    }
    // 도착 확인 — 목적지 부근에 실제로 닿는다
    const arrived = Math.hypot(hero.x - projectToPath(150, 232).x, hero.y - projectToPath(150, 232).y);
    expect(arrived).toBeLessThan(H.HERO_ARRIVE_EPSILON + WALKABLE_HALF_WIDTH + 2);
  });

  test('클릭 지점 도착 — 유효 지점 오차 1px 이하', () => {
    const hero = mkHero();
    const target = projectToPath(180, 100);
    hero.moveTo(180, 100);
    for (let i = 0; i < 60 * 30 && Math.hypot(hero.x - target.x, hero.y - target.y) > 1; i++) {
      hero.step(1 / 60);
    }
    // 도착 판정 엡실론(2px) 안 — 목적지 마커와 실제 정지 위치가 일치해야 한다
    expect(Math.hypot(hero.x - target.x, hero.y - target.y)).toBeLessThanOrEqual(
      H.HERO_ARRIVE_EPSILON + 1,
    );
  });

  test('moveToDistance는 중앙선으로 — 기존 호출처(테스트·부활) 의미 보존', () => {
    const hero = mkHero();
    hero.lateral = 8;
    hero.targetLateral = 8;
    hero.moveToDistance(200);
    expect(hero.targetLateral).toBe(0);
  });

  test('부활은 제단 중앙선 — lateral 리셋', () => {
    const hero = mkHero();
    hero.lateral = 10;
    hero.takeDamage(1e9);
    expect(hero.alive).toBe(false);
    hero.respawnTimer = 0.01;
    hero.step(0.02);
    expect(hero.alive).toBe(true);
    expect(hero.lateral).toBe(0);
    expect(hero.distance).toBe(ALTAR_PATH_DISTANCE);
  });

  test('경로 밖 진행도 클램프 — 입구 앞·출구 뒤로는 못 간다', () => {
    const hero = mkHero();
    hero.moveToDistance(-50);
    expect(hero.targetDistance).toBe(0);
    hero.moveToDistance(PATH_LENGTH + 50);
    expect(hero.targetDistance).toBe(PATH_LENGTH);
  });

  test('웨이포인트 수는 설계 그대로 — 경로 자체는 불변', () => {
    expect(WAYPOINTS.length).toBe(14);
  });
});
