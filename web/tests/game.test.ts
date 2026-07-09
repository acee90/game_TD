import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import { ARM_TILES, PATH_LENGTH, SLOT_POS, pathPos } from '../src/core/map';
import { GOD_POOL_EARLY, GOD_POOL_LATE, GOD_TIER, godPool } from '../src/data/units';
import { Game } from '../src/game/game';
import { bossKillMineral, killIncome } from '../src/game/economy';
import { poolFor, unitFor } from '../src/game/merge';
import type { Slot } from '../src/game/types';

const emptySlot = (game: Game): Slot => game.slots.find((s) => !s.tower)!;

/** 항상 풀의 index번째 유닛을 뽑는 결정적 난수 */
const fixedRand = (index: number, poolSize = 7): (() => number) => () => index / poolSize;

/** 미네랄 걱정 없이 유닛 하나를 생성한다 */
function spawn(game: Game): void {
  game.mineral += B.SPAWN_UNIT_MINERAL;
  game.spawnUnit(emptySlot(game));
}

describe('시작 상태 — 원본 trigger #349', () => {
  test('미네랄 55, 가스 6으로 시작한다', () => {
    const game = new Game();
    expect(game.mineral).toBe(55);
    expect(game.gas).toBe(6);
  });

  test('원본 라운드 간격은 57초이고, 프로토는 그보다 짧다', () => {
    expect(B.ORIGINAL_ROUND_SECONDS).toBe(57);
    expect(B.ROUND_SECONDS).toBeLessThan(B.ORIGINAL_ROUND_SECONDS);
  });

  test('첫 라운드는 오프닝 대기 뒤에 시작한다', () => {
    const game = new Game();
    expect(game.round).toBe(0);
    expect(game.roundTimer).toBe(B.OPENING_SECONDS);
    expect(B.OPENING_SECONDS).toBeLessThan(B.ROUND_SECONDS);

    game.update(B.OPENING_SECONDS + 0.01);
    expect(game.round).toBe(1);
  });

  test('round는 진행 중인 라운드를 가리킨다 — 웨이브가 도는 동안 숫자가 앞서지 않는다', () => {
    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01);
    // 라운드 1의 몹이 스폰되는 동안 round는 계속 1이어야 한다
    for (let i = 0; i < 10; i++) {
      game.update(0.3);
      expect(game.round).toBe(1);
    }
  });
});

describe('라운드 진행 — 고정 간격', () => {
  test('웨이브를 다 정리해도 다음 라운드가 앞당겨지지 않는다', () => {
    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01);
    expect(game.round).toBe(1);

    // 라운드 1의 몹을 전부 지워버려도
    for (let i = 0; i < 60; i++) game.update(0.3);
    game.enemies = [];
    game.lives = B.START_LIVES;
    game.over = false;

    // 남은 시간만큼은 그대로 기다린다
    const remaining = game.roundTimer;
    expect(remaining).toBeGreaterThan(0);
    game.update(remaining - 0.01);
    expect(game.round).toBe(1);

    game.update(0.02);
    expect(game.round).toBe(2);
  });

  test('라운드 간격은 항상 ROUND_SECONDS다 — 느리게 잡아도 이득이 없다', () => {
    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01);

    for (let round = 1; round <= 5; round++) {
      expect(game.round).toBe(round);
      expect(game.roundTimer).toBeCloseTo(B.ROUND_SECONDS, 1);
      game.update(B.ROUND_SECONDS);
      game.lives = B.START_LIVES;
      game.over = false;
    }
  });

  test('일반 웨이브는 보스를 만들지 않는다 — 보스는 소환으로만 나온다', () => {
    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01);

    for (let round = 0; round < 60; round++) {
      for (let step = 0; step < 100; step++) {
        game.update(0.3);
        expect(game.enemies.every((e) => e.kind !== 'boss')).toBe(true);
      }
      game.lives = B.START_LIVES; // 누출로 게임이 끝나지 않게 되돌린다
      game.over = false;
    }
    expect(game.round).toBeGreaterThan(10);
  });

  test('웨이브당 잡몹은 15기에서 시작한다', () => {
    expect(B.enemyCount(1)).toBe(B.ENEMY_BASE_COUNT);
    expect(B.ENEMY_BASE_COUNT).toBe(15);
    expect(B.enemyCount(8)).toBeGreaterThan(B.enemyCount(1));
  });

  test('모든 라운드가 잡몹만 낸다 — 특별 웨이브는 없다', () => {
    for (const round of [1, 7, 22, 41, 93]) {
      const game = new Game();
      game.round = round - 1;
      game.roundTimer = 0.001;
      game.update(0.002);

      expect(game.round).toBe(round);
      for (let i = 0; i < 3; i++) game.update(B.SPAWN_INTERVAL + 0.001);
      expect(game.enemies.every((e) => e.kind === 'mob')).toBe(true);
    }
  });
});

describe('조합 — 같은 유닛 2기가 상위 티어 1기가 된다', () => {
  test('같은 Lv1 2기를 놓으면 Lv2 1기로 합쳐진다', () => {
    const game = new Game(fixedRand(0));
    spawn(game);
    spawn(game);

    const towers = game.slots.filter((s) => s.tower).map((s) => s.tower!);
    expect(towers).toHaveLength(1);
    expect(towers[0].tier).toBe(1);
  });

  test('다른 Lv1 2기는 합쳐지지 않는다', () => {
    let call = 0;
    const game = new Game(() => (call++ === 0 ? 0 / 7 : 1 / 7));
    spawn(game);
    spawn(game);

    const towers = game.slots.filter((s) => s.tower).map((s) => s.tower!);
    expect(towers).toHaveLength(2);
    expect(towers.every((t) => t.tier === 0)).toBe(true);
  });

  test('연쇄 조합 — Lv1 4기가 Lv3 1기가 된다', () => {
    const game = new Game(fixedRand(2));
    for (let i = 0; i < 4; i++) spawn(game);

    const towers = game.slots.filter((s) => s.tower).map((s) => s.tower!);
    expect(towers).toHaveLength(1);
    expect(towers[0].tier).toBe(2);
  });

  test('조합 요구 수량은 2 (원본 AtLeast 2)', () => {
    expect(B.MERGE_REQUIRED).toBe(2);
  });
});

describe('유닛 추첨 — 티어 풀에서 균등 랜덤', () => {
  test('난수 0은 풀의 첫 유닛, 1에 가까우면 마지막 유닛', () => {
    const pool = poolFor(1, 0);
    expect(unitFor(1, () => 0, 0)).toBe(pool[0]);
    expect(unitFor(1, () => 0.999, 0)).toBe(pool[pool.length - 1]);
  });

  test('난수가 정확히 1이어도 풀 밖으로 나가지 않는다', () => {
    const pool = poolFor(1, 0);
    expect(unitFor(1, () => 1, 0)).toBe(pool[pool.length - 1]);
  });

  test('풀 전체가 뽑힐 수 있다', () => {
    const pool = poolFor(0, 0);
    const seen = new Set(pool.map((_, i) => unitFor(0, () => i / pool.length, 0).name));
    expect(seen.size).toBe(pool.length);
  });
});

describe('GOD 풀 — 처치 보스 수로 분기 (trigger #523 / #534)', () => {
  test('보스 5기 이하면 초기 풀', () => {
    expect(godPool(5)).toBe(GOD_POOL_EARLY);
  });

  test('보스 6기 이상이면 확장 풀', () => {
    expect(godPool(6)).toBe(GOD_POOL_LATE);
    expect(GOD_POOL_LATE.length).toBeGreaterThan(GOD_POOL_EARLY.length);
  });

  test('GOD 티어는 4', () => {
    expect(GOD_TIER).toBe(4);
  });
});

describe('보스 소환 — 상시 액션, 쿨타임만, 순차 해금', () => {
  test('시작하자마자 Lv1을 소환할 수 있고 비용이 들지 않는다', () => {
    const game = new Game();
    const mineral = game.mineral;

    expect(game.canSummonBoss).toBe(true);
    expect(game.summonBoss()).toBe(true);
    expect(game.mineral).toBe(mineral);
    expect(game.enemies.some((e) => e.kind === 'boss')).toBe(true);
  });

  test('쿨타임이 남아 있으면 소환할 수 없다', () => {
    const game = new Game();
    game.summonBoss();
    expect(game.canSummonBoss).toBe(false);
    expect(game.summonBoss()).toBe(false);
  });

  test('쿨타임은 보스와 교전 중에도 흐른다', () => {
    const game = new Game();
    game.summonBoss();
    const start = game.bossCooldown;
    game.update(5);

    expect(game.liveBossLevels).toEqual([1]); // 아직 교전 중
    expect(game.bossCooldown).toBeCloseTo(start - 5, 5);
  });

  test('교전 중이어도 쿨타임이 차면 또 소환할 수 있다', () => {
    const game = new Game();
    game.summonBoss();
    game.bossCooldown = 0;

    expect(game.canSummonBoss).toBe(true);
    expect(game.summonBoss(1)).toBe(true);
    expect(game.liveBossLevels).toEqual([1, 1]);
  });

  test('보스를 잡기 전에는 다음 레벨이 열리지 않는다', () => {
    const game = new Game();
    game.summonBoss();
    expect(game.maxBossLevel).toBe(1);
  });

  test('열리지 않은 레벨은 소환할 수 없다', () => {
    const game = new Game();
    expect(game.canSummonBossLevel(1)).toBe(true);
    expect(game.canSummonBossLevel(2)).toBe(false);
    expect(game.summonBoss(2)).toBe(false);
    expect(game.enemies).toHaveLength(0);
  });

  test('열린 레벨은 낮은 것도 다시 부를 수 있다', () => {
    const game = new Game();
    game.bossCleared = 3;
    expect(game.maxBossLevel).toBe(4);
    for (const level of [1, 2, 3, 4]) expect(game.canSummonBossLevel(level)).toBe(true);
    expect(game.canSummonBossLevel(5)).toBe(false);

    expect(game.summonBoss(1)).toBe(true);
    expect(game.liveBossLevels).toEqual([1]);
  });

  test('이미 잡은 레벨을 다시 잡아도 해금 단계는 그대로다', () => {
    const game = new Game();
    game.bossCleared = 3;
    game.summonBoss(1);
    game.enemies.find((e) => e.kind === 'boss')!.hp = 0;
    game.update(0.016);

    expect(game.bossCleared).toBe(3);
    expect(game.maxBossLevel).toBe(4);
  });

  test('낮은 레벨 보스는 보상이 적다', () => {
    expect(bossKillMineral(1)).toBeLessThan(bossKillMineral(6));
  });

  test('Lv1을 잡아야 Lv2가 열린다', () => {
    const game = new Game();
    game.summonBoss();
    const boss = game.enemies.find((e) => e.kind === 'boss')!;
    boss.hp = 0;
    game.update(0.016);
    game.bossCooldown = 0;

    expect(game.bossCleared).toBe(1);
    expect(game.maxBossLevel).toBe(2);
    expect(game.canSummonBossLevel(2)).toBe(true);
    expect(game.canSummonBossLevel(3)).toBe(false);
  });

  test('보스 처치 보상은 원본 표를 따른다', () => {
    expect(B.BOSS_KILL_MINERAL).toEqual([5, 8, 13, 20, 29, 39]);
    expect(bossKillMineral(1)).toBe(5);
    expect(bossKillMineral(6)).toBe(39);
  });

  test('보스가 돌파하면 다음 레벨이 열리지 않는다', () => {
    const game = new Game();
    game.summonBoss();
    const boss = game.enemies.find((e) => e.kind === 'boss')!;
    boss.distance = PATH_LENGTH;
    game.update(0.016);

    expect(game.bossCleared).toBe(0);
    expect(game.liveBossLevels).toEqual([]);
  });

  test('쿨타임 중에는 소환할 수 없다', () => {
    const game = new Game();
    game.summonBoss();
    const boss = game.enemies.find((e) => e.kind === 'boss')!;
    boss.hp = 0;
    game.update(0.016);

    expect(game.bossCooldown).toBeGreaterThan(0);
    expect(game.canSummonBoss).toBe(false);
  });
});

describe('소득 — 차감 없는 누적형', () => {
  test('200킬 마일스톤에서 보상이 나온다', () => {
    expect(killIncome(199, 200).mineral).toBeGreaterThanOrEqual(5);
  });

  test('반복 20킬 보상은 없앴다 — 킬만으로는 마일스톤 전까지 무소득', () => {
    expect(killIncome(0, 20).mineral).toBe(0);
    expect(killIncome(0, 199).mineral).toBe(0);
  });

  test('웨이브를 넘기면 목돈이 들어오고, 라운드가 오를수록 커진다', () => {
    expect(B.waveReward(5)).toBeGreaterThan(B.waveReward(1));

    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01); // 라운드 1 시작 — 아직 보상 없음
    const mineral = game.mineral;

    game.update(B.ROUND_SECONDS + 0.01); // 라운드 2 시작 — 라운드 1 클리어 보상
    expect(game.mineral).toBeGreaterThanOrEqual(mineral + B.waveReward(1));
  });

  test('킬이 늘지 않으면 소득도 없다', () => {
    expect(killIncome(50, 50)).toEqual({ mineral: 0, notes: [] });
  });

  test('누출은 라이프를 깎지만 미네랄을 준다 (strings:358)', () => {
    const game = new Game();
    const mineral = game.mineral;
    const lives = game.lives;
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 10, hp: 10, armor: 0,
      speed: 0, radius: 8, distance: PATH_LENGTH,
    });
    game.update(0.016);

    expect(game.lives).toBe(lives - 1);
    expect(game.mineral).toBe(mineral + B.LEAK_MINERAL);
  });
});

describe('맵 — 십자 일주', () => {
  test('타워 타일은 17개 (중앙 1 + 가지별 4)', () => {
    expect(SLOT_POS).toHaveLength(1 + ARM_TILES * 4);
    expect(SLOT_POS).toHaveLength(17);
  });

  test('타일 좌표가 겹치지 않는다', () => {
    const keys = new Set(SLOT_POS.map(([x, y]) => `${x},${y}`));
    expect(keys.size).toBe(SLOT_POS.length);
  });

  test('경로 길이는 양수다', () => {
    expect(PATH_LENGTH).toBeGreaterThan(0);
  });

  test('입구는 북측 왼쪽, 출구는 북측 오른쪽 — 둘 다 위쪽이고 출구가 더 오른쪽', () => {
    const [inX, inY] = pathPos(0);
    const [outX, outY] = pathPos(PATH_LENGTH);
    expect(outX).toBeGreaterThan(inX);
    expect(inY).toBeLessThan(120);
    expect(outY).toBeLessThan(120);
  });

  test('반시계방향 — 경로 초반에는 왼쪽으로 돈다', () => {
    // 입구에서 내려온 뒤 첫 방향 전환은 왼쪽(-x)이어야 한다
    const early = pathPos(PATH_LENGTH * 0.18);
    const later = pathPos(PATH_LENGTH * 0.28);
    expect(later[0]).toBeLessThan(early[0]);
  });

  test('모든 적은 같은 지점에서 출발한다', () => {
    const game = new Game();
    game.summonBoss();
    expect(game.enemies[0].distance).toBe(0);
  });
});

describe('업그레이드 — 가스 소비', () => {
  test('가스가 모자라면 실패한다', () => {
    const game = new Game();
    game.gas = 0;
    expect(game.upgrade(0)).toBe(false);
    expect(game.upgrades[0]).toBe(0);
  });

  test('성공하면 가스를 쓰고 레벨이 오른다', () => {
    const game = new Game();
    game.gas = 100;
    expect(game.upgrade(1)).toBe(true);
    expect(game.upgrades[1]).toBe(1);
    expect(game.upgrades[0]).toBe(0);
    expect(game.gas).toBe(100 - B.upgradeGasCost(0));
  });
});
