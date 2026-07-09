// Lv1 보스 난이도 기준선.
// "시작 미네랄로 산 유닛만으로 Lv1 보스를 잡을 수 있어야 한다"를 코드로 못박는다.
// balance.ts의 bossHP/bossArmor/SPAWN_UNIT_MINERAL을 건드리면 여기가 먼저 깨진다.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import { ALTAR_MINERAL } from '../src/data/hero';
import { Game } from '../src/game/game';

/** 결정적 난수 — 시드마다 다른 유닛 조합이 나온다 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 시작 미네랄 55 + 20킬 보상 10 + 여유. 유닛 6기를 살 수 있는 예산. */
const COMFORTABLE_BUDGET = 75;

interface Fight {
  readonly killed: boolean;
  readonly seconds: number;
  readonly towers: number;
}

/** 예산을 유닛에 다 쓰고 Lv1 보스를 소환해 결과를 본다 */
function fightLv1Boss(seed: number, budget: number): Fight {
  const game = new Game(seeded(seed));
  game.mineral = budget;
  while (game.spawnUnitAnywhere()) {
    // 미네랄이 떨어지거나 타일이 찰 때까지
  }
  const towers = game.slots.filter((s) => s.tower).length;
  game.summonBoss();

  let seconds = 0;
  while (game.liveBossLevels.length > 0 && seconds < 200) {
    game.update(1 / 60);
    seconds += 1 / 60;
  }
  return { killed: game.bossCleared === 1, seconds, towers };
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const killRate = (budget: number): number =>
  SEEDS.filter((s) => fightLv1Boss(s, budget).killed).length / SEEDS.length;

describe('Lv1 보스 — 시작 전력으로 넘을 수 있어야 한다', () => {
  test('시작 미네랄로 유닛 여섯 기를 산다', () => {
    expect(Math.floor(B.START_MINERAL / B.SPAWN_UNIT_MINERAL)).toBeGreaterThanOrEqual(6);
  });

  test('75 미네랄(6기)이면 어떤 뽑기 운에도 Lv1 보스를 잡는다', () => {
    expect(killRate(COMFORTABLE_BUDGET)).toBe(1);
  });

  // 제단(40)을 세우면 유닛 세 기밖에 못 산다. 그 전력으로 Lv1 보스를 잡는 건 뽑기 운이다 —
  // 제단을 먼저 세울지 보스를 먼저 잡을지가 실제 선택이 되게 하는 지점이다.
  test('제단을 세우고 남은 미네랄로는 뽑기 운을 탄다', () => {
    const rate = killRate(B.START_MINERAL - ALTAR_MINERAL);
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.75);
  });

  test('Lv1 보스가 즉사하지는 않는다', () => {
    const fastest = Math.min(...SEEDS.map((s) => fightLv1Boss(s, COMFORTABLE_BUDGET).seconds));
    expect(fastest).toBeGreaterThan(3);
  });

  test('Lv2 보스는 같은 전력으로 잡히지 않는다 — 성장 압력이 있다', () => {
    const game = new Game(seeded(7));
    game.mineral = COMFORTABLE_BUDGET;
    while (game.spawnUnitAnywhere()) {
      // 소진까지
    }
    game.bossCleared = 1; // Lv1은 이미 잡았다고 치고
    game.summonBoss();
    expect(game.liveBossLevels).toEqual([2]);

    let seconds = 0;
    while (game.liveBossLevels.length > 0 && seconds < 200) {
      game.update(1 / 60);
      seconds += 1 / 60;
    }
    expect(game.bossCleared).toBe(1); // 못 잡고 돌파당한다
    expect(game.lives).toBeLessThan(B.START_LIVES);
  });
});
