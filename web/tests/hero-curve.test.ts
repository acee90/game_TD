// 영웅 파워 커브의 기준선 (2026-07-13 3안 개편 후).
// 골드 → XP → 레벨업 → 세 스탯 자동 균등 성장. 레벨 배수는 폐지 — 파워는 스탯 × 증강뿐이다.
// 목표 (2026-07-17 7차): 수입 20% 투자로 R45에 Lv ~27 · 실질 상한 ~Lv50.
// 7차에서 XP 지수를 1.10 → 1.08로 풀었다 — "R30~40에 크는 재미가 없다"(플레이테스트).
// 배경: economy-power-rebalance.md — XP 20골드 고정 + 완만한 지수(1.06)가
// "최소 타워 + 영웅 몰빵"을 지배 전략으로 만들어 성장 지수를 1.10으로 올렸다.

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

/** 자동 균등 성장 영웅의 DPS (증강 ids 적용) */
const heroDps = (level: number, ids: string[] = []): number => {
  const stats = computeStats(level, ids.map(card));
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

  test('실질 상한 ≈ Lv50 — R60 고점 수입(8,572) 전액을 부어도 Lv52는 못 산다', () => {
    // 지수가 완만해질수록 상한이 올라간다. 상한 자체보다 **끝이 있다는 것**이 요점이다 —
    // 레벨이 무한히 오르면 후반이 무의미하게 부푼다(선형 시절의 실패).
    expect(xpToLevel(52)).toBeGreaterThan(8572);
  });
});

describe('레벨 속도 — 골드가 주 연료다 (설계: 수입 20%로 R45에 Lv ~27)', () => {
  test('킬 XP만으로는 Lv25에 한참 못 미친다 — 부축이다', () => {
    const hero = new Hero();
    for (let r = 1; r <= 45; r++) {
      hero.gainXp(B.enemyCount(r) * H.XP_PER_MOB * 1.3); // 막타 30% 가정
      hero.pendingAugmentPicks = 0;
    }
    expect(hero.level).toBeLessThan(25);
  });

  test('수입 저점의 ~20%를 XP에 넣으면 R45에 Lv 25~30', () => {
    const hero = new Hero();
    // income-curve.csv R45 cumIncomeMid × 20%. 3651 → 5458 (2026-07-20 경제 재편:
    // 웨이브 보상 폐지 · 킬 마일스톤 신설 · 보스 보상 ×2 + 첫 돌파 보너스).
    // 시트가 원본이므로 시트가 바뀌면 이 값도 따라간다.
    const goldBudget = 5458 * 0.2;
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
    expect(hero.level).toBeLessThanOrEqual(30);
  });
});

describe('레벨업 = 세 스탯 자동 균등 성장', () => {
  test('레벨업은 선택 대기 없이 세 스탯을 같은 양만큼 올린다', () => {
    const hero = new Hero();
    hero.gainXp(H.xpToNext(1));
    expect(hero.level).toBe(2);
    expect(H.statBonusByLevel(2)).toBeCloseTo(H.levelStatPoints(2) / 3);
    const attributes = H.attributesByLevel(2);
    expect(attributes.str - H.HERO_BASE_STR).toBeCloseTo(H.statBonusByLevel(2));
    expect(attributes.agi - H.HERO_BASE_AGI).toBeCloseTo(H.statBonusByLevel(2));
    expect(attributes.int - H.HERO_BASE_INT).toBeCloseTo(H.statBonusByLevel(2));
  });

  test('후반 레벨일수록 포인트가 굵다', () => {
    expect(H.levelStatPoints(25)).toBeGreaterThan(H.levelStatPoints(5));
  });
});

describe('증강이 역전을 만든다 — 레벨이 아니라', () => {
  test('무증강 Lv30 자동 성장 영웅은 GOD 타워를 크게 못 넘는다', () => {
    expect(heroDps(30)).toBeLessThan(GOD_TOWER_DPS * 1.5);
  });

  test('공격 3증강(Lv24)이면 GOD 1~2.5기', () => {
    const dps = heroDps(24, ['might', 'might', 'might']);
    expect(dps).toBeGreaterThan(GOD_TOWER_DPS * 1);
    expect(dps).toBeLessThan(GOD_TOWER_DPS * 2.5);
  });

  test('계열 특화(강화 3)가 혼합보다 세다 — 몰빵의 값어치', () => {
    const focused = heroDps(24, ['marksman', 'marksman', 'marksman']); // 강화 3 = 특화
    const mixed = heroDps(24, ['marksman', 'marksman', 'plating']); // 강화 2 + 방어 1 — 특화 미발동
    expect(focused).toBeGreaterThan(mixed);
  });
});

describe('타워 증강 — 2장 이상이면 끝까지 타워가 앞선다 (2026-07-16 사용자 지시)', () => {
  test('전쟁군주 2장 + 가스 업그레이드 L15면 GOD 타워가 풀투자 영웅을 이긴다', () => {
    // 실버 대 실버 종반 비교 — 타워 쪽: 주력 병과 L15(가산 ×7) × 전쟁군주 2장(+40%).
    // L15 근거: 4차에서 가스 0.4/s — 광부 3기 기준 종반 몰빵 L15의 누적 비용 450가스는
    // R45까지의 채취(~1,200)에 여유 있게 들어온다.
    const towerStats = computeStats(38, [card('warlord'), card('warlord')]);
    const godEndgame =
      GOD_TOWER_DPS * (1 + B.UPGRADE_DAMAGE_PER_LEVEL * 15) * towerStats.towerDamageMult;
    // 영웅 쪽: 강화 5장(대특화 '초월' 발동) 풀투자
    const heroEndgame = heroDps(38, ['might', 'might', 'might', 'vigor', 'vigor']);
    expect(godEndgame).toBeGreaterThan(heroEndgame);
  });
});

describe('초반은 타워의 시간', () => {
  test('영웅 1레벨 DPS는 GOD 타워의 5%도 안 된다', () => {
    expect(heroDps(1)).toBeLessThan(GOD_TOWER_DPS * 0.05);
  });

  test('첫 증강 전(Lv8)에는 GOD의 4분의 1도 안 된다', () => {
    expect(heroDps(8)).toBeLessThan(GOD_TOWER_DPS * 0.25);
  });
});
