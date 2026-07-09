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

const heroDps = (level: number, ids: string[] = []): number => {
  const stats = computeStats(level, ids.map(augment));
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

/**
 * 잡몹을 전부 잡고 보스를 쿨타임마다 부른다는 가정 아래
 * 영웅이 목표 레벨에 도달하는 라운드를 구한다.
 */
function roundAtLevel(targetLevel: number, bossEveryRounds: number): number {
  const hero = new Hero(0, 0);
  for (let round = 1; round <= 200; round++) {
    hero.gainXp(B.enemyCount(round) * H.XP_PER_MOB);
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

describe('레벨 30 도달 시점 — R30~35', () => {
  test('보스를 안 부르면 조금 늦게, 그래도 창을 크게 벗어나지 않는다', () => {
    const round = roundAtLevel(30, 0);
    expect(round).toBeGreaterThanOrEqual(30);
    expect(round).toBeLessThanOrEqual(40);
  });

  test('보스를 2라운드마다 부르면 R30~35 안에 30레벨이 된다', () => {
    const round = roundAtLevel(30, 2);
    expect(round).toBeGreaterThanOrEqual(30);
    expect(round).toBeLessThanOrEqual(35);
  });

  test('보스는 성장을 앞당긴다', () => {
    expect(roundAtLevel(30, 2)).toBeLessThanOrEqual(roundAtLevel(30, 0));
  });
});

describe('레벨 30에 증강 3개', () => {
  test('증강은 10레벨마다 주어진다', () => {
    expect(H.AUGMENT_EVERY).toBe(10);
  });

  test('30레벨까지 정확히 3번 고른다', () => {
    const hero = new Hero(0, 0);
    let picks = 0;
    while (hero.level < 30) {
      hero.gainXp(hero.xpNeeded);
      while (hero.pendingAugmentPicks > 0) {
        hero.addAugment(augment('might'));
        picks++;
      }
    }
    expect(hero.level).toBe(30);
    expect(picks).toBe(3);
    expect(hero.augments).toHaveLength(3);
  });
});

describe('레벨 30 파워 — 증강이 갈림길이다', () => {
  test('증강 없는 30레벨은 GOD 타워 한 기에 못 미친다', () => {
    expect(heroDps(30)).toBeLessThan(GOD_TOWER_DPS);
  });

  test('공격 계열 3개를 몰면 GOD 타워의 2배를 넘는다', () => {
    expect(heroDps(30, ATTACK_THREE)).toBeGreaterThan(GOD_TOWER_DPS * 2);
  });

  test('아무거나 3개 고르면 2배에 못 미친다 — 시너지가 선택을 보상한다', () => {
    const scattered = heroDps(30, ['bulwark', 'swift', 'greed']);
    expect(scattered).toBeLessThan(GOD_TOWER_DPS * 2);
    expect(scattered).toBeLessThan(heroDps(30, ATTACK_THREE));
  });

  test('30레벨 이후로는 가파르다', () => {
    const at30 = heroDps(30, ATTACK_THREE);
    const at40 = heroDps(40, ATTACK_THREE);
    expect(at40 / at30).toBeCloseTo(Math.pow(H.HERO_DAMAGE_GROWTH, 10), 1);
    expect(at40).toBeGreaterThan(at30 * 4);
  });
});

describe('초반은 타워의 시간', () => {
  test('영웅 1레벨 DPS는 GOD 타워의 1%도 안 된다', () => {
    expect(heroDps(1)).toBeLessThan(GOD_TOWER_DPS * 0.02);
  });

  test('첫 증강 전(1~9레벨)에는 GOD 타워 근처도 못 간다', () => {
    expect(heroDps(9)).toBeLessThan(GOD_TOWER_DPS * 0.1);
  });
});
