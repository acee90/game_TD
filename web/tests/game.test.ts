import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import { ARM_TILES, CORNER_COLS, CORNER_ROWS, PATH_LENGTH, SLOT_POS, TILE, nearestPathDistance, pathPos } from '../src/core/map';
import { CREATURE, GOD_POOL_EARLY, GOD_POOL_LATE, GOD_TIER, TIER_POOLS, godPool } from '../src/data/units';
import { damage } from '../src/game/combat';
import { Game } from '../src/game/game';
import { bossKillMineral, killIncome } from '../src/game/economy';
import { poolFor, unitFor } from '../src/game/merge';
import type { Slot } from '../src/game/types';

const emptySlot = (game: Game): Slot => game.slots.find((s) => !s.tower && s !== game.altarSlot)!;

/** 항상 풀의 index번째 유닛을 뽑는 결정적 난수 */
const fixedRand = (index: number, poolSize = 7): (() => number) => () => index / poolSize;

/** 미네랄 걱정 없이 유닛 하나를 생성한다 */
function spawn(game: Game): void {
  game.mineral += B.SPAWN_UNIT_MINERAL;
  game.spawnUnit(emptySlot(game));
}

describe('시작 상태', () => {
  test('원본대로 미네랄 55, 가스 6으로 시작한다', () => {
    const game = new Game();
    expect(B.START_MINERAL).toBe(55);
    expect(game.mineral).toBe(55);
    expect(game.gas).toBe(6);
  });

  test('제단과 영웅은 공짜로 주어진다', () => {
    const game = new Game();
    expect(game.hero).not.toBeNull();
    expect(game.mineral).toBe(B.START_MINERAL);
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
        if (game.paused) game.chooseAugment(0); // 증강 일시정지에 갇히지 않게
        game.update(0.3);
        expect(game.enemies.every((e) => e.kind !== 'boss')).toBe(true);
      }
      game.lives = B.START_LIVES; // 누출로 게임이 끝나지 않게 되돌린다
      game.over = false;
    }
    expect(game.round).toBeGreaterThan(10);
  });

  test('적 장갑은 5라운드마다 계단식으로 오른다', () => {
    expect(B.ENEMY_ARMOR_STEP_ROUNDS).toBe(5);

    // 같은 계단 안에서는 변하지 않는다
    expect(B.enemyArmor(5)).toBe(B.enemyArmor(9));
    expect(B.enemyArmor(10)).toBe(B.enemyArmor(14));

    // 계단을 넘으면 한 칸 오른다
    expect(B.enemyArmor(10) - B.enemyArmor(9)).toBe(B.ENEMY_ARMOR_PER_STEP);
    expect(B.enemyArmor(15) - B.enemyArmor(14)).toBe(B.ENEMY_ARMOR_PER_STEP);

    // 첫 계단 전에는 장갑이 없다
    expect(B.enemyArmor(1)).toBe(0);
    expect(B.enemyArmor(4)).toBe(0);
  });

  test('적 체력 지수는 타워 총합으로 감당 가능한 범위다', () => {
    // 타일 17개를 GOD으로 채웠을 때의 대략적 상한
    const wallDps = 17 * 1180;
    const needAtRound35 = (B.enemyHP(35) * B.enemyCount(35)) / B.ROUND_SECONDS;
    expect(needAtRound35).toBeLessThan(wallDps);
  });

  test('웨이브는 5라운드 사이클로 돈다', () => {
    expect(B.CYCLE_ROUNDS).toBe(5);
    expect(B.cycleOf(1)).toBe(0);
    expect(B.cycleOf(5)).toBe(0);
    expect(B.cycleOf(6)).toBe(1);
    expect(B.posInCycle(1)).toBe(0);
    expect(B.posInCycle(5)).toBe(4);
    expect(B.posInCycle(6)).toBe(0);
  });

  test('사이클 안에서는 몹 수가 늘고, 사이클이 넘어가면 수가 리셋되며 개당 체력이 뛴다', () => {
    for (let r = 1; r <= 4; r++) {
      expect(B.enemyCount(r + 1) - B.enemyCount(r)).toBe(B.ENEMY_COUNT_STEP);
    }
    expect(B.enemyCount(1)).toBe(B.ENEMY_BASE_COUNT);
    expect(B.enemyCount(5)).toBe(B.ENEMY_BASE_COUNT + 4 * B.ENEMY_COUNT_STEP);
    // 사이클 경계: 수는 처음으로, 개당 체력은 크게 점프 — "새 몹은 적지만 굵다"
    expect(B.enemyCount(6)).toBe(B.ENEMY_BASE_COUNT);
    expect(B.enemyHP(6)).toBeGreaterThan(B.enemyHP(5) * 1.5);
  });

  test('웨이브 타입 — R10부터 5의 배수는 사냥꾼(접촉 배수만 다르다)', () => {
    expect(B.waveTypeOf(5).id).toBe('normal');   // R10 전에는 안 나온다
    expect(B.waveTypeOf(9).id).toBe('normal');
    expect(B.waveTypeOf(10).id).toBe('hunter');
    expect(B.waveTypeOf(12).id).toBe('normal');
    expect(B.waveTypeOf(45).id).toBe('hunter');
    // 총체력 예산은 그대로 — 위협은 접촉 공격력 배수로만
    expect(B.WAVE_TYPES.hunter.contactDamageMult).toBeGreaterThan(3);
  });

  test('웨이브 총 체력 = 목표 clear × 기대 유효 DPS (재화→전투력 모델)', () => {
    const waveHp = (r: number) => B.enemyHP(r) * B.enemyCount(r);

    // 정의가 곧 법칙이다 — 반올림 오차 안에서 일치
    for (const r of [1, 7, 13, 25, 40, 55, 60]) {
      const target = B.expectedBoardDps(r) * B.targetClearSeconds(r);
      expect(waveHp(r)).toBeGreaterThan(target * 0.97);
      expect(waveHp(r)).toBeLessThan(target * 1.03);
    }

    // 목표 clear: R1부터 긴장(18초). 6차 보정 — 킥 없는 성장률 연속 램프 (balance.ts 주석)
    expect(B.targetClearSeconds(1)).toBeCloseTo(18, 1);
    // 후반 성장률은 보드 후반 성장(+7.1%/라운드)을 확실히 앞선다 — 아니면 생존 보드가
    // 곡선을 따돌리고 영생한다 (거듭제곱 꼬리로 확인한 함정)
    const lateGrowth = B.targetClearSeconds(56) / B.targetClearSeconds(55);
    expect(lateGrowth).toBeGreaterThan(1.1);
    // 킥 없음 — 성장률이 갑자기 점프하지 않는다 (라운드 간 성장률 증가폭 ≤ 2%p).
    // 선형 오프닝(≤램프 시작)은 상대 성장률이 자연 감소하므로 단조 검사는 램프부터.
    let prevRate = B.targetClearSeconds(2) / B.targetClearSeconds(1);
    for (let r = 2; r < 70; r++) {
      const rate = B.targetClearSeconds(r + 1) / B.targetClearSeconds(r);
      if (r >= B.WAVE_RAMP_START) {
        expect(rate).toBeGreaterThanOrEqual(prevRate - 1e-9); // 램프 이후 완화 구간 없음
      }
      expect(rate - prevRate).toBeLessThan(0.02); // 벽 킥 금지
      prevRate = rate;
    }

    // 총 체력은 단조 증가 — 사이클 경계 포함
    for (let r = 1; r < 60; r++) {
      expect(waveHp(r + 1)).toBeGreaterThanOrEqual(waveHp(r));
    }
  });

  test('웨이브 총 체력은 라운드가 지나며 줄지 않는다 — 사이클 경계에서도', () => {
    const waveHp = (r: number) => B.enemyHP(r) * B.enemyCount(r);
    for (let r = 1; r <= 40; r++) {
      expect(waveHp(r + 1)).toBeGreaterThanOrEqual(waveHp(r));
    }
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

  test('보스 처치 보상 — 리스크에 맞춰 상위 레벨이 가파르다 [프로토]', () => {
    // 원본 표는 [5, 8, 13, 20, 29, 39] (trigger #601~#606). 보스 HP를 레벨당 ×2.5로
    // 세우면서 보상도 리스크를 따라가게 대체했다 — 레벨당 증가율이 줄지 않아야 한다.
    expect(B.BOSS_KILL_MINERAL).toEqual([5, 10, 18, 32, 55, 90]);
    expect(bossKillMineral(1)).toBe(5);
    for (let lv = 1; lv < 6; lv++) {
      expect(bossKillMineral(lv + 1) / bossKillMineral(lv)).toBeGreaterThanOrEqual(1.6);
    }
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
  const CROSS_COUNT = 1 + ARM_TILES * 4;
  const CORNER_COUNT = 4 * CORNER_COLS * CORNER_ROWS;

  test('타워 타일은 십자 17 + 모서리 24 = 41개', () => {
    expect(CROSS_COUNT).toBe(17);
    expect(CORNER_COUNT).toBe(24);
    expect(SLOT_POS).toHaveLength(41);
  });

  test('모서리 타일은 경로와 겹치지 않는다', () => {
    const PATH_HALF_WIDTH = 12;
    const TILE_HALF = TILE / 2;
    const STEPS = 4000;

    for (let i = CROSS_COUNT; i < SLOT_POS.length; i++) {
      const [sx, sy] = SLOT_POS[i];
      for (let step = 0; step < STEPS; step++) {
        const [px, py] = pathPos((step / STEPS) * PATH_LENGTH);
        // 타일은 정사각형이므로 체비셰프 거리로 겹침을 본다
        const gap = Math.max(Math.abs(px - sx), Math.abs(py - sy));
        expect(gap).toBeGreaterThan(PATH_HALF_WIDTH + TILE_HALF - 1);
      }
    }
  });

  test('모서리 타일은 캔버스(420×470) 안에 있다', () => {
    const TILE_HALF = TILE / 2;
    for (const [x, y] of SLOT_POS) {
      expect(x - TILE_HALF).toBeGreaterThanOrEqual(0);
      expect(x + TILE_HALF).toBeLessThanOrEqual(420);
      expect(y - TILE_HALF).toBeGreaterThanOrEqual(0);
      expect(y + TILE_HALF).toBeLessThanOrEqual(470);
    }
  });

  test('네 모서리 블록은 중심 (210, 250)에 대해 대칭이다', () => {
    const corners = SLOT_POS.slice(CROSS_COUNT);
    const key = (x: number, y: number) => `${x},${y}`;
    const set = new Set(corners.map(([x, y]) => key(x, y)));

    for (const [x, y] of corners) {
      expect(set.has(key(420 - x, y))).toBe(true); // 좌우 대칭
      expect(set.has(key(x, 500 - y))).toBe(true); // 상하 대칭 (중심 y=250)
    }
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

describe('크리쳐 — 보조 타워', () => {
  const creatureName = (tier: number) =>
    TIER_POOLS[tier].find((u) => u.race === CREATURE)!.name;

  /** 지정한 유닛을 슬롯에 직접 꽂는다 */
  const place = (game: Game, slotIndex: number, tier: number, name: string) => {
    const def = TIER_POOLS[tier].find((u) => u.name === name)!;
    game.slots[slotIndex].tower = { def, tier, cooldown: 0 };
  };

  test('크리쳐는 딜이 깎인다', () => {
    const creature = TIER_POOLS[0].find((u) => u.race === CREATURE)!;
    const other = TIER_POOLS[0].find((u) => u.race !== CREATURE && u.tags.includes('power'))!;

    const creatureDps = damage({ def: creature, tier: 0, cooldown: 0 }, [0, 0, 0, 0]);
    const otherDps = damage({ def: other, tier: 0, cooldown: 0 }, [0, 0, 0, 0]);
    expect(creatureDps).toBeLessThan(otherDps);
    expect(creatureDps / otherDps).toBeCloseTo(B.CREATURE_DAMAGE_MULT, 5);
  });

  test('크리쳐가 없으면 감속이 없다', () => {
    const game = new Game();
    expect(game.slowAt(100)).toBe(1);
  });

  test('크리쳐 사거리 안에서는 몹이 느려진다', () => {
    const game = new Game();
    place(game, 1, 0, creatureName(0)); // 십자 상단 첫 칸

    const slot = game.slots[1];
    // 그 타일에서 가장 가까운 경로 지점
    const near = nearestPathDistance(slot.x, slot.y - 60);
    expect(game.slowAt(near)).toBeLessThan(1);
  });

  test('감속은 겹쳐도 가장 강한 것 하나만 적용된다', () => {
    const game = new Game();
    place(game, 1, 0, creatureName(0)); // 배수 0.9
    place(game, 2, 2, creatureName(2)); // 배수 0.76

    const slot = game.slots[1];
    const near = nearestPathDistance(slot.x, slot.y - 60);
    const factor = game.slowAt(near);

    // 곱(0.9 × 0.76 = 0.684)이 아니라 최솟값이어야 한다
    expect(factor).toBeGreaterThanOrEqual(Math.min(...B.CREATURE_SLOW));
    expect(factor).not.toBeCloseTo(0.9 * 0.76, 3);
  });

  test('티어가 높은 크리쳐일수록 더 느리게 만든다', () => {
    for (let tier = 0; tier < B.CREATURE_SLOW.length - 1; tier++) {
      expect(B.CREATURE_SLOW[tier + 1]).toBeLessThan(B.CREATURE_SLOW[tier]);
    }
    expect(Math.min(...B.CREATURE_SLOW)).toBeGreaterThan(0); // 완전 정지는 없다
  });

  test('감속을 받은 몹은 실제로 천천히 간다', () => {
    const slowed = new Game();
    place(slowed, 1, 2, creatureName(2));
    const plain = new Game();

    const slot = slowed.slots[1];
    const start = nearestPathDistance(slot.x, slot.y - 60);
    const mob = () => ({
      kind: 'mob' as const, name: 'x', maxHp: 1e9, hp: 1e9, armor: 1e9,
      speed: 50, radius: 9, distance: start,
    });
    slowed.enemies.push(mob());
    plain.enemies.push(mob());

    slowed.update(0.1);
    plain.update(0.1);

    expect(slowed.enemies[0].distance).toBeLessThan(plain.enemies[0].distance);
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
