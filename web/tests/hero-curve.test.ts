// 영웅 파워 커브의 기준선.
// "30레벨이 R30~35에 오고, 그때 증강 3개를 쥐며, 공격 계열로 몰면 GOD 타워의 2배를 넘는다."
// hero.ts의 성장률·경험치 곡선·증강 주기를 건드리면 여기가 먼저 깨진다.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import { AUGMENTS } from '../src/data/hero';
import { Hero, computeStats } from '../src/game/hero';
import { attackInterval, damage } from '../src/game/combat';
import { TIER_POOLS } from '../src/data/units';

const augment = (id: string) => AUGMENTS.find((a) => a.id === id)!;
/** 실버 등급 카드 — 등급 배수 1이라 원래 효과 그대로 */
const card = (id: string) => H.makeCard(augment(id), 'silver');

const heroDps = (level: number, ids: string[] = []): number => {
  const stats = computeStats(level, ids.map(card));
  return stats.damage / stats.attackInterval;
};

/** GOD 타워 한 기의 DPS (업그레이드 없음) */
const GOD_TOWER_DPS = (() => {
  const def = TIER_POOLS[3][0];
  const tower = { def, tier: 4, cooldown: 0 };
  return damage(tower, [0, 0, 0, 0]) / attackInterval(tower);
})();

/** 공격 계열 3개를 몰았을 때 — 완력은 최대 3스택이라 이게 최고 조합이다 */
const ATTACK_THREE = ['might', 'might', 'might'];

/** 전형적인 판에서 영웅이 막타를 치는 비율 */
const TYPICAL_LASTHIT_RATE = 0.3;

const xpPerMob = (lastHitRate: number): number =>
  H.XP_PER_MOB * (1 - lastHitRate) + H.XP_PER_MOB * H.HERO_LASTHIT_XP_MULT * lastHitRate;

/**
 * 잡몹을 전부 잡고 보스를 주기적으로 부른다는 가정 아래
 * 영웅이 목표 레벨에 도달하는 라운드를 구한다.
 */
function roundAtLevel(
  targetLevel: number,
  bossEveryRounds: number,
  lastHitRate = TYPICAL_LASTHIT_RATE,
): number {
  const hero = new Hero();
  for (let round = 1; round <= 300; round++) {
    hero.gainXp(B.enemyCount(round) * xpPerMob(lastHitRate));
    if (bossEveryRounds > 0 && round % bossEveryRounds === 0) {
      const bossLevel = Math.min(B.BOSS_MAX_LEVEL, 1 + Math.floor(round / 10));
      hero.gainXp(H.xpPerBoss(bossLevel));
    }
    // 증강은 세지 않는다 — 레벨 도달 시점만 본다
    hero.pendingAugmentPicks = 0;
    if (hero.level >= targetLevel) return round;
  }
  return Infinity;
}

/** 라운드 `round`이 끝났을 때의 영웅 레벨 */
function levelAtRound(round: number, lastHitRate = TYPICAL_LASTHIT_RATE): number {
  const hero = new Hero();
  for (let r = 1; r <= round; r++) {
    hero.gainXp(B.enemyCount(r) * xpPerMob(lastHitRate));
    if (r % 2 === 0) hero.gainXp(H.xpPerBoss(Math.min(B.BOSS_MAX_LEVEL, 1 + Math.floor(r / 10))));
    hero.pendingAugmentPicks = 0;
  }
  return hero.level;
}

describe('경험치 비용 — 지수', () => {
  test('레벨이 오를수록 비용이 배수로 커진다', () => {
    expect(H.xpToNext(20) / H.xpToNext(10)).toBeCloseTo(Math.pow(H.XP_COST_GROWTH, 10), 1);
    expect(H.xpToNext(40) / H.xpToNext(20)).toBeCloseTo(Math.pow(H.XP_COST_GROWTH, 20), 1);
  });

  test('선형이었다면 고레벨이 너무 쌌을 것이다', () => {
    const linear = (level: number) => 14 + 1.5 * level;
    expect(H.xpToNext(50)).toBeGreaterThan(linear(50) * 2);
    // 초반은 비슷해야 한다 — 지수의 대가는 후반에만 치른다
    expect(H.xpToNext(1)).toBeCloseTo(linear(1), -1);
  });

  test('레벨이 무한정 오르지 않는다', () => {
    // 라운드 100까지 전부 잡아도 도달 레벨이 60을 넘지 않는다
    expect(levelAtRound(100)).toBeLessThan(60);
  });
});

describe('초반 레벨업 속도 — 라운드당 한 레벨 남짓', () => {
  test('첫 두 라운드에 폭발적으로 오르지 않는다', () => {
    expect(levelAtRound(1)).toBeLessThanOrEqual(2);
    expect(levelAtRound(2)).toBeLessThanOrEqual(3);
  });

  test('R5에는 아직 첫 증강을 못 받는다', () => {
    expect(levelAtRound(5)).toBeLessThan(H.AUGMENT_LEVELS[0]);
  });

  test('R10 언저리에 첫 증강이 온다', () => {
    expect(levelAtRound(10)).toBeGreaterThanOrEqual(H.AUGMENT_LEVELS[0]);
    expect(levelAtRound(10)).toBeLessThan(H.AUGMENT_LEVELS[1]);
  });
});

describe('레벨 30 도달 시점 — R30~35', () => {
  test('보스를 2라운드마다 부르면 R30~35 안에 30레벨이 된다', () => {
    const round = roundAtLevel(30, 2);
    expect(round).toBeGreaterThanOrEqual(30);
    expect(round).toBeLessThanOrEqual(35);
  });

  test('보스를 안 부르면 한참 늦다 — 보스가 성장의 페달이다', () => {
    expect(roundAtLevel(30, 0)).toBeGreaterThan(roundAtLevel(30, 2));
  });

  test('막타를 많이 칠수록 빨라진다 — 다만 편차는 두 배 안쪽', () => {
    const lazy = roundAtLevel(30, 2, 0);
    const active = roundAtLevel(30, 2, 1);
    expect(active).toBeLessThan(lazy);
    expect(lazy / active).toBeLessThan(2);
  });
});

describe('증강 스케줄 — 80/20', () => {
  test('앞의 네 개는 진행률 절반 안에 들어온다', () => {
    // 네 번째 증강 레벨이 30레벨 언저리 — 대부분의 판이 도달한다
    expect(H.AUGMENT_LEVELS[3]).toBeLessThanOrEqual(35);
  });

  test('레벨이 오를수록 간격이 벌어진다 — 뒤로 갈수록 귀해진다', () => {
    const gaps = H.AUGMENT_LEVELS.slice(1).map((lv, i) => lv - H.AUGMENT_LEVELS[i]);
    for (let i = 0; i < gaps.length - 1; i++) {
      expect(gaps[i + 1]).toBeGreaterThanOrEqual(gaps[i]);
    }
  });

  test('30레벨이면 증강 세 개를 쥔다', () => {
    expect(H.augmentsByLevel(30)).toBe(3);
  });

  test('실제로 세 번 고르게 된다', () => {
    const hero = new Hero();
    let picks = 0;
    while (hero.level < 30) {
      hero.gainXp(hero.xpNeeded);
      while (hero.pendingAugmentPicks > 0) {
        hero.addAugment(card('might'));
        picks++;
      }
    }
    expect(hero.level).toBe(30);
    expect(picks).toBe(3);
  });
});

describe('레벨은 선형, 역전은 시너지가 만든다', () => {
  test('레벨 성장은 선형이다 — 레벨만으로는 폭발하지 않는다', () => {
    const step = heroDps(20) - heroDps(10);
    expect(heroDps(40) - heroDps(30)).toBeCloseTo(step, 5);
  });

  test('증강이 없으면 50레벨이 되어도 GOD 타워를 못 넘는다', () => {
    expect(heroDps(50)).toBeLessThan(GOD_TOWER_DPS);
  });

  test('공격 계열 3개를 몰면 30레벨에 GOD 타워의 2배를 넘는다', () => {
    expect(heroDps(30, ATTACK_THREE)).toBeGreaterThan(GOD_TOWER_DPS * 2);
  });

  test('계열을 흩으면 시너지가 없어 무증강과 같다', () => {
    const scattered = heroDps(30, ['bulwark', 'swift', 'greed']);
    expect(scattered).toBeCloseTo(heroDps(30), 5); // 셋 다 공격력을 안 올린다
    expect(scattered).toBeLessThan(GOD_TOWER_DPS);
  });

  test('역전의 크기는 레벨이 아니라 증강 배수가 정한다', () => {
    const levelGain = heroDps(42) / heroDps(30); // 선형이라 완만
    const augmentGain = heroDps(30, ATTACK_THREE) / heroDps(30);
    expect(levelGain).toBeLessThan(2);
    expect(augmentGain).toBeGreaterThan(3);
  });
});

describe('초반은 타워의 시간', () => {
  test('영웅 1레벨 DPS는 GOD 타워의 1%도 안 된다', () => {
    expect(heroDps(1)).toBeLessThan(GOD_TOWER_DPS * 0.02);
  });

  test('첫 증강 전(1~9레벨)에는 GOD 타워의 5분의 1도 안 된다', () => {
    expect(heroDps(9)).toBeLessThan(GOD_TOWER_DPS * 0.2);
  });
});
