// 영웅 파워 커브의 기준선 (2026-07-13 3안 개편 후).
// 골드 → XP → 레벨업 → 세 스탯 자동 균등 성장. 레벨 배수는 폐지 — 파워는 스탯 × 증강뿐이다.
// 2026-07-21: Lv20 **하드캡** (사용자 지시) — 만렙 이후 영웅 성장은 증강 강화뿐이다.
// 7차에서 XP 지수를 1.10 → 1.08로 풀었다 — "R30~40에 크는 재미가 없다"(플레이테스트).
// 배경: economy-power-rebalance.md — XP 20골드 고정 + 완만한 지수(1.06)가
// "최소 타워 + 영웅 몰빵"을 지배 전략으로 만들어 성장 지수를 1.10으로 올렸다.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import { AUGMENTS } from '../src/data/hero';
import { Game } from '../src/game/game';
import { Hero, augmentAllowed, computeStats } from '../src/game/hero';
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

  test('비용 지수의 경제적 상한 ≈ Lv50 — 하드캡(Lv20)이 훨씬 먼저 온다', () => {
    // 지금은 Lv20 하드캡(2026-07-21)이 실제 상한이다. 이 테스트는 비용 곡선 자체의
    // 안전망 — 캡이 풀리는 실험을 해도 경제가 고레벨을 못 사게 지수가 지켜준다.
    expect(xpToLevel(52)).toBeGreaterThan(8572);
  });
});

describe('레벨 속도 — Lv20 하드캡 (2026-07-21, 사용자 지시)', () => {
  test('킬 XP만으로는 만렙에 한참 못 미친다 — 골드 구매가 도달 시점을 앞당긴다', () => {
    const hero = new Hero();
    for (let r = 1; r <= 45; r++) {
      hero.gainXp(B.enemyCount(r) * H.XP_PER_MOB * 1.3); // 막타 30% 가정
      hero.pendingAugmentPicks = 0;
    }
    expect(hero.level).toBeLessThan(H.HERO_MAX_LEVEL);
  });

  test('수입 저점의 ~20%를 XP에 넣으면 R45 안에 만렙에 닿고, 그 뒤로는 멈춘다', () => {
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
    // 하드캡 — 아무리 부어도 20에서 멈추고 초과 경험치는 버려진다.
    // 만렙 이후 영웅이 강해지는 길은 증강 강화뿐이다.
    expect(hero.level).toBe(H.HERO_MAX_LEVEL);
    expect(hero.atMaxLevel).toBe(true);
    expect(hero.xp).toBe(0);
    expect(hero.gainXp(1_000)).toBe(0); // 더는 안 큰다
  });

  test('만렙이면 XP 구매가 잠기고, 깨달음(경험치 일시불)은 드래프트에서 빠진다', () => {
    const game = new Game();
    game.mineral = 10_000;
    game.hero.level = H.HERO_MAX_LEVEL;

    expect(game.canBuyXp).toBe(false);
    const before = game.mineral;
    expect(game.buyXp()).toBe(false);
    expect(game.mineral).toBe(before); // 골드가 빠지지 않는다

    const enlighten = H.AUGMENTS.find((a) => a.id === 'enlighten')!;
    expect(augmentAllowed(game.hero, enlighten)).toBe(false); // 죽은 카드는 안 띄운다
    game.hero.level = H.HERO_MAX_LEVEL - 1;
    expect(augmentAllowed(game.hero, enlighten)).toBe(true);
  });
});

describe('레벨업 = 세 스탯 자동 지수 성장 (2026-07-21, 사용자 지시)', () => {
  test('레벨업은 선택 대기 없이 세 스탯을 같은 배율로 올린다', () => {
    const hero = new Hero();
    hero.gainXp(H.xpToNext(1));
    expect(hero.level).toBe(2);
    const attributes = H.attributesByLevel(2);
    expect(attributes.str / H.HERO_BASE_STR).toBeCloseTo(H.HERO_STAT_GROWTH);
    expect(attributes.agi / H.HERO_BASE_AGI).toBeCloseTo(H.HERO_STAT_GROWTH);
    expect(attributes.int / H.HERO_BASE_INT).toBeCloseTo(H.HERO_STAT_GROWTH);
  });

  test('지수 곡선 — 뒤로 갈수록 레벨 하나가 더 굵고, 만렙에서 잘린다', () => {
    const gainAt = (l: number) => H.attributesByLevel(l).str - H.attributesByLevel(l - 1).str;
    expect(gainAt(19)).toBeGreaterThan(gainAt(5) * 3); // 후반 레벨이 초반보다 훨씬 굵다
    // 하드캡 — 합성 레벨을 넣어도 만렙 값으로 잘린다
    expect(H.attributesByLevel(30)).toEqual(H.attributesByLevel(H.HERO_MAX_LEVEL));
  });

  test('만렙 공속 앵커 — 무증강 1.9~2.0회/초 (사용자 지시)', () => {
    const rate = 1 / computeStats(H.HERO_MAX_LEVEL, []).attackInterval;
    expect(rate).toBeGreaterThanOrEqual(1.9);
    expect(rate).toBeLessThanOrEqual(2.0);
  });
});

describe('증강이 역전을 만든다 — 레벨이 아니라', () => {
  test('무증강 Lv30 자동 성장 영웅은 GOD 타워를 크게 못 넘는다', () => {
    expect(heroDps(30)).toBeLessThan(GOD_TOWER_DPS * 1.5);
  });

  /**
   * 만렙 20 도입(2026-07-20) 전에는 Lv24를 앵커로 "GOD 1~2.5기"를 요구했다.
   * 이제 레벨이 20에서 멈추므로 **Lv24와 Lv30이 거의 같다** — 앵커를 만렙으로 옮긴다.
   *
   * 지키려는 계약은 그대로다: **레벨이 아니라 증강이 역전을 만든다.**
   * 만렙 자동 성장만으로는 GOD 한 기에 못 미치고, 공격 증강 3장을 얹어야 넘어선다.
   */
  test('만렙 자동 성장만으로는 GOD 한 기에 못 미친다', () => {
    expect(heroDps(H.HERO_MAX_LEVEL)).toBeLessThan(GOD_TOWER_DPS);
  });

  /**
   * **증강이 레벨보다 크다** — 이게 이 describe가 지키는 계약이다.
   * 만렙 자동 성장(99 DPS)에 공격 증강 3장을 얹으면 3배가 넘는다(317).
   */
  test('공격 3증강이 만렙 자동 성장보다 훨씬 크다', () => {
    const bare = heroDps(H.HERO_MAX_LEVEL);
    const built = heroDps(H.HERO_MAX_LEVEL, ['might', 'might', 'might']);
    expect(built / bare).toBeGreaterThan(3);
  });

  /**
   * 옛 [미달 기록](2026-07-20)의 목표 달성 — 공속 상향(만렙 1.96/초, 2026-07-21)으로
   * 공격 3증강 만렙 영웅이 GOD 한 기를 넘어섰다 (0.68배 → 1.9배).
   * 위쪽 가드도 함께 건다 — 영웅이 타워를 밀어내면 안 되므로 2.5배 아래.
   * 참고로 `might`는 지금 HERO_CARRY_BLOCKLIST에 걸려 실제 드래프트에는 안 나온다.
   */
  test('공격 3증강 만렙 영웅이 GOD 한 기를 넘는다 — 다만 압도하지는 않는다', () => {
    const dps = heroDps(H.HERO_MAX_LEVEL, ['might', 'might', 'might']);
    expect(dps).toBeGreaterThan(GOD_TOWER_DPS);
    expect(dps).toBeLessThan(GOD_TOWER_DPS * 2.5);
  });

  test('만렙을 넘겨도 거의 안 큰다 — 후반은 타워가 주축이라는 보장', () => {
    const atCap = heroDps(H.HERO_MAX_LEVEL);
    const wayPast = heroDps(H.HERO_MAX_LEVEL + 20);
    expect(wayPast / atCap).toBeLessThan(1.6); // 20레벨을 더 먹어도 1.6배 미만
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
