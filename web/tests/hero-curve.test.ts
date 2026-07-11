// 영웅 파워 커브의 기준선 (2026-07-11 2안 개편 후).
// 골드 → XP → 레벨업 → focus 스탯 적립. 레벨 배수는 폐지 — 파워는 스탯 × 증강뿐이다.
// 목표: R45(성장 정지)에 Lv 25~30 · 같은 골드의 한계 DPS 영웅 ≈ 타워 (income-curve.csv).

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import { AUGMENTS } from '../src/data/hero';
import { Hero, computeStats } from '../src/game/hero';
import { attackInterval, damage } from '../src/game/combat';
import { TIER_POOLS } from '../src/data/units';

const card = (id: string) => H.makeCard(AUGMENTS.find((a) => a.id === id)!, 'silver');

const GOD_TOWER_DPS = (() => {
  const def = TIER_POOLS[3][0];
  const tower = { def, tier: 4, cooldown: 0 };
  return damage(tower, [0, 0, 0, 0]) / attackInterval(tower);
})();

/** 레벨 L까지 focus를 유지했을 때 쌓이는 포인트 */
const pointsByLevel = (level: number): number => {
  let sum = 0;
  for (let l = 2; l <= level; l++) sum += H.levelStatPoints(l);
  return sum;
};

/** 힘몰빵 영웅의 DPS (증강 ids 적용) */
const strHeroDps = (level: number, ids: string[] = []): number => {
  const stats = computeStats(level, ids.map(card), { str: pointsByLevel(level), agi: 0, int: 0 });
  return stats.damage / stats.attackInterval;
};

/** 레벨 L까지 필요한 누적 XP */
const xpToLevel = (level: number): number => {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += H.xpToNext(l);
  return sum;
};

describe('경험치 비용 — 지수', () => {
  test('레벨이 오를수록 비용이 배수로 커진다', () => {
    expect(H.xpToNext(30)).toBeGreaterThan(H.xpToNext(10) * 2.5);
  });

  test('실질 상한 ≈ Lv60대 — R60 고점 수입(8,572) 전액으로도 Lv65는 못 산다', () => {
    expect(xpToLevel(65)).toBeGreaterThan(8572);
  });
});

describe('레벨 속도 — 골드가 주 연료다 (설계: R45에 Lv 25~30)', () => {
  test('킬 XP만으로는 Lv25에 한참 못 미친다 — 부축이다', () => {
    const hero = new Hero();
    for (let r = 1; r <= 45; r++) {
      hero.gainXp(B.enemyCount(r) * H.XP_PER_MOB * 1.3); // 막타 30% 가정
      hero.pendingAugmentPicks = 0;
    }
    expect(hero.level).toBeLessThan(25);
  });

  test('수입 저점의 ~25%를 XP에 넣으면 R45에 Lv 25~30', () => {
    const hero = new Hero();
    const goldBudget = 3651 * 0.2; // income-curve.csv R45 저점 × 20%
    let spent = 0;
    for (let r = 1; r <= 45; r++) {
      hero.gainXp(B.enemyCount(r) * H.XP_PER_MOB * 1.3);
      const target = (goldBudget * r) / 45;
      if (spent < target) {
        hero.gainXp(target - spent);
        spent = target;
      }
      hero.pendingAugmentPicks = 0;
    }
    expect(hero.level).toBeGreaterThanOrEqual(25);
    expect(hero.level).toBeLessThanOrEqual(31);
  });
});

describe('레벨업 = focus 스탯 적립', () => {
  test('레벨업마다 focus 스탯에 포인트가 쌓인다', () => {
    const hero = new Hero();
    hero.focus = 'agi';
    hero.gainXp(H.xpToNext(1));
    expect(hero.level).toBe(2);
    expect(hero.bought.agi).toBe(H.levelStatPoints(2));
    expect(hero.bought.str).toBe(0);
  });

  test('후반 레벨일수록 포인트가 굵다', () => {
    expect(H.levelStatPoints(25)).toBeGreaterThan(H.levelStatPoints(5));
  });
});

describe('골드 저울 — 같은 골드의 한계 DPS 영웅 ≈ 타워 (income-curve 기준)', () => {
  test('Lv27(XP ≈ 950골드) 힘몰빵 DPS가 골드×1.5의 0.5~1.6배 안', () => {
    // 보드 변환율(유효 DPS ≈ 누적수입 × 1.5~2.5)의 하단과 비교.
    // 영웅 프리미엄(이동·어그로)만큼 낮아도 되고, 크게 넘으면 과속이다.
    const gold = xpToLevel(27);
    const dps = strHeroDps(27);
    expect(dps).toBeGreaterThan(gold * 1.5 * 0.5);
    expect(dps).toBeLessThan(gold * 1.5 * 1.6);
  });
});

describe('증강이 역전을 만든다 — 레벨이 아니라', () => {
  test('무증강 Lv30 힘몰빵은 GOD 타워를 크게 못 넘는다', () => {
    expect(strHeroDps(30)).toBeLessThan(GOD_TOWER_DPS * 1.5);
  });

  test('공격 3증강(Lv24)이면 GOD 1~2.5기', () => {
    const dps = strHeroDps(24, ['might', 'might', 'might']);
    expect(dps).toBeGreaterThan(GOD_TOWER_DPS * 1);
    expect(dps).toBeLessThan(GOD_TOWER_DPS * 2.5);
  });

  test('계열 특화(원거리 3)가 혼합보다 세다 — 몰빵의 값어치', () => {
    const focused = strHeroDps(24, ['marksman', 'marksman', 'marksman']); // 원거리 3 = 특화
    const mixed = strHeroDps(24, ['marksman', 'marksman', 'might']); // 2+1 — 특화 미발동
    expect(focused).toBeGreaterThan(mixed);
  });
});

describe('초반은 타워의 시간', () => {
  test('영웅 1레벨 DPS는 GOD 타워의 5%도 안 된다', () => {
    expect(strHeroDps(1)).toBeLessThan(GOD_TOWER_DPS * 0.05);
  });

  test('첫 증강 전(Lv8)에는 GOD의 4분의 1도 안 된다', () => {
    expect(strHeroDps(8)).toBeLessThan(GOD_TOWER_DPS * 0.25);
  });
});
