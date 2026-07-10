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

/** 원거리 계열을 몰았을 때 — 저격 태세가 터진다 */
const ARCHER_THREE = ['marksman', 'marksman', 'marksman'];
const archerDps = (level: number, ids: string[], str = 0): number => {
  const stats = computeStats(level, ids.map(card), { str, agi: 0, int: 0 });
  return stats.damage / stats.attackInterval;
};

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
    expect(H.AUGMENT_LEVELS[3]).toBeLessThanOrEqual(32);
  });

  test('다섯 번째는 35레벨 안쪽 — 각성이 늦지 않게', () => {
    expect(H.AUGMENT_LEVELS[4]).toBeLessThanOrEqual(35);
  });

  test('여섯 번째도 실제로 도달 가능한 레벨이다', () => {
    // 경험치 비용이 지수라 레벨은 45 언저리에서 멎는다
    expect(H.AUGMENT_LEVELS[5]).toBeLessThan(45);
  });

  test('24레벨이면 증강 세 개를 쥔다', () => {
    expect(H.augmentsByLevel(23)).toBe(2);
    expect(H.augmentsByLevel(24)).toBe(3);
  });

  test('실제로 세 번 고르게 된다', () => {
    const hero = new Hero();
    let picks = 0;
    while (hero.level < 24) {
      hero.gainXp(hero.xpNeeded);
      while (hero.pendingAugmentPicks > 0) {
        hero.addAugment(card('might'));
        picks++;
      }
    }
    expect(hero.level).toBe(24);
    expect(picks).toBe(3);
  });
});

describe('레벨은 선형, 역전은 시너지가 만든다', () => {
  test('레벨 성장은 선형이다 — 레벨만으로는 폭발하지 않는다', () => {
    const step = heroDps(20) - heroDps(10);
    expect(heroDps(40) - heroDps(30)).toBeCloseTo(step, 5);
  });

  test('증강이 없으면 40레벨이 되어도 GOD 타워를 못 넘는다', () => {
    expect(heroDps(40)).toBeLessThan(GOD_TOWER_DPS);
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

// 기준선은 **혼합 빌드**(계열을 다 못 몰아 특화가 안 터진 평범한 판)로 잡는다.
// 시뮬레이션에서 증강 3·5번째 시점의 골드 강화 중앙값은 0이었다 — 타일 41칸이
// 다 차기 전까지 미네랄은 전부 유닛으로 간다. 그래서 골드 0을 기준으로 잰다.
const MIXED_THREE = ['marksman', 'rapid', 'vigor']; // 원거리 2 — 특화(3) 미달
const MIXED_FIVE = ['marksman', 'rapid', 'vigor', 'longbow', 'might'];
const FOCUSED_FIVE = ['marksman', 'marksman', 'marksman', 'rapid', 'longbow'];

describe('궁수 기준선 — 3증강에 GOD 타워 한 기, 5증강에 각성', () => {
  test('혼합 3증강(24레벨)이면 GOD 타워 1~1.5기 수준이다', () => {
    const ratio = archerDps(24, MIXED_THREE, 0) / GOD_TOWER_DPS;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.5);
  });

  test('혼합 5증강(35레벨)이면 1.5~5기 수준으로 각성한다', () => {
    const ratio = archerDps(35, MIXED_FIVE, 0) / GOD_TOWER_DPS;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(5);
  });

  test('계열을 몰아 특화를 터뜨리면 혼합 빌드를 넘어선다 — 그게 몰빵의 값어치다', () => {
    expect(archerDps(24, ARCHER_THREE, 0)).toBeGreaterThan(archerDps(24, MIXED_THREE, 0));
    expect(archerDps(35, FOCUSED_FIVE, 0)).toBeGreaterThan(archerDps(35, MIXED_FIVE, 0));
  });

  test('스탯은 증강을 대체하지 못한다 — 힘 20을 사도 혼합 5증강에 못 미친다', () => {
    // 20포인트면 누적 1,830 미네랄. 스탯(골드)은 증강(선택)의 증폭기지 대체재가 아니다.
    expect(archerDps(35, [], 20)).toBeLessThan(archerDps(35, MIXED_FIVE, 0));
  });

  test('스탯 구매는 선형이지만 레벨 배수가 곱해져 후반 1포인트가 더 크다', () => {
    const worth = (level: number) => archerDps(level, [], 1) - archerDps(level, [], 0);
    expect(worth(40)).toBeGreaterThan(worth(10) * 3);
  });

  test('스탯 비용은 선형 증가 — 배수형과 달리 수십 포인트를 살 수 있다', () => {
    expect(H.statCost(10) - H.statCost(9)).toBe(H.statCost(1) - H.statCost(0));
    const cum = (n: number) =>
      Array.from({ length: n }, (_, i) => H.statCost(i)).reduce((a, b) => a + b, 0);
    // 30회(성장 곡선 포함 ≈ 40pt)에 ~6,800 — 옛 배수형은 17회에 이미 ~8,200이었다
    expect(cum(30)).toBeLessThan(8000);
  });
});

describe('초반은 타워의 시간', () => {
  test('영웅 1레벨 DPS는 GOD 타워의 5%도 안 된다', () => {
    expect(heroDps(1)).toBeLessThan(GOD_TOWER_DPS * 0.05);
  });

  test('첫 증강 전(1~9레벨)에는 GOD 타워의 4분의 1도 안 된다', () => {
    expect(heroDps(9)).toBeLessThan(GOD_TOWER_DPS * 0.25);
  });
});
