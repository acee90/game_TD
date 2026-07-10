// Lv1 보스 난이도 기준선.
// "시작 미네랄로 산 유닛만으로 Lv1 보스를 잡을 수 있어야 한다"를 코드로 못박는다.
// balance.ts의 bossHP/bossArmor/SPAWN_UNIT_MINERAL을 건드리면 여기가 먼저 깨진다.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
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

/** 조합(2단계) 유무로 가른 킬레이트 — towers < 산 유닛 수면 조합이 일어난 것 */
function killRateBy(budget: number): { merged: number; plain: number } {
  const unitCount = Math.floor(budget / B.SPAWN_UNIT_MINERAL);
  const fights = SEEDS.map((s) => fightLv1Boss(s, budget));
  const merged = fights.filter((f) => f.towers < unitCount);
  const plain = fights.filter((f) => f.towers >= unitCount);
  return {
    merged: merged.filter((f) => f.killed).length / Math.max(1, merged.length),
    plain: plain.filter((f) => f.killed).length / Math.max(1, plain.length),
  };
}

describe('Lv1 보스 — 시작 전력으로 넘을 수 있어야 한다', () => {
  test('시작 미네랄로 유닛 네 기를 산다', () => {
    expect(Math.floor(B.START_MINERAL / B.SPAWN_UNIT_MINERAL)).toBe(4);
  });

  test('75 미네랄(6기)이면 거의 어떤 뽑기 운에도 Lv1 보스를 잡는다', () => {
    // 보스는 영웅에게 저지되지 않으므로 자리 운이 최악이면 아주 드물게 새어나간다
    expect(killRate(COMFORTABLE_BUDGET)).toBeGreaterThanOrEqual(0.95);
  });

  test('시작 미네랄만으로는 뽑기 운이다 — 2단계가 떠야 잡는 판이 된다', () => {
    const overall = killRate(B.START_MINERAL);
    expect(overall).toBeGreaterThan(0.3);
    expect(overall).toBeLessThan(0.9);

    const { merged, plain } = killRateBy(B.START_MINERAL);
    // 조합이 뜨면 대체로 잡고, 안 뜨면 가까스로 못 잡는다
    expect(merged).toBeGreaterThan(0.6);
    expect(plain).toBeLessThan(0.35);
  });

  test('Lv1 보스가 즉사하지는 않는다', () => {
    const fastest = Math.min(...SEEDS.map((s) => fightLv1Boss(s, COMFORTABLE_BUDGET).seconds));
    expect(fastest).toBeGreaterThan(3);
  });

  test('상위 보스는 같은 전력으로 잡히지 않는다 — 성장 압력이 있다', () => {
    const game = new Game(seeded(7));
    game.mineral = COMFORTABLE_BUDGET;
    while (game.spawnUnitAnywhere()) {
      // 소진까지
    }
    game.bossCleared = 3; // Lv1~3은 이미 잡았다고 치고
    game.summonBoss();
    expect(game.liveBossLevels).toEqual([4]);

    let seconds = 0;
    while (game.liveBossLevels.length > 0 && seconds < 200) {
      game.update(1 / 60);
      seconds += 1 / 60;
    }
    expect(game.bossCleared).toBe(3); // 못 잡고 돌파당한다
    expect(game.lives).toBeLessThan(B.START_LIVES);
  });
});
