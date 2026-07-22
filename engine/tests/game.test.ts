import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as S from '../src/data/score';
import { ARM_TILES, CORNER_OFFSETS, PATH_LENGTH, SLOT_POS, TILE, nearestPathDistance, pathPos } from '../src/core/map';
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

  test('카운트다운은 R49까지 25초, 20마리 구간 R50부터 30초다', () => {
    expect(B.enemyCount(49)).toBeLessThan(20);
    expect(B.roundCountdownSeconds(49)).toBe(25);
    expect(B.enemyCount(50)).toBe(20);
    expect(B.roundCountdownSeconds(50)).toBe(30);

    const early = new Game();
    early.round = 48;
    early.roundTimer = 0.001;
    early.update(0.002);
    expect(early.round).toBe(49);
    expect(early.roundTimer).toBe(25);

    const late = new Game();
    late.round = 49;
    late.roundTimer = 0.001;
    late.update(0.002);
    expect(late.round).toBe(50);
    expect(late.roundTimer).toBe(30);
  });

  test('초반 전투는 감속 없이 dt만큼 진행되고 몬스터 HP만 완화된다', () => {
    const expectedHpMultipliers = [0.36, 0.49, 0.64, 0.81, 1];
    expectedHpMultipliers.forEach((expected, i) => {
      expect(B.earlyEnemyHpMultiplier(i + 1)).toBeCloseTo(expected, 8);
    });

    const game = new Game();
    game.round = 1;
    game.roundTimer = 999;
    game.enemies.push({
      kind: 'mob', name: '속도 확인', maxHp: 1e9, hp: 1e9, armor: 0,
      speed: 100, radius: 9, distance: 0,
    });
    game.update(0.1);

    expect(game.enemies[0].distance).toBeCloseTo(10, 5);
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

  test('다음 라운드 카운트다운은 웨이브가 다 나온 뒤부터 흐른다 (2026-07-19)', () => {
    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01);
    expect(game.round).toBe(1);
    expect(game.roundTimer).toBeCloseTo(B.ROUND_SECONDS, 1);

    // 스폰이 진행되는 동안 타이머는 멈춰 있다
    game.update(B.SPAWN_INTERVAL * 3);
    expect(game.roundTimer).toBeCloseTo(B.ROUND_SECONDS, 1);

    // 스폰 창(16기 × 0.18 ≈ 2.9초)이 끝나고 나서야 카운트다운이 흐른다.
    // 총 4.5초를 돌리면: 스폰 중 ~2.9초는 멈춰 있었고 나머지 ~1.6초만 깎였어야 한다.
    for (let i = 0; i < 40; i++) game.update(0.1);
    expect(game.round).toBe(1);
    expect(game.roundTimer).toBeLessThan(B.ROUND_SECONDS); // 카운트다운은 시작됐고
    expect(game.roundTimer).toBeGreaterThan(B.ROUND_SECONDS - 3); // 스폰 동안은 멈춰 있었다

    // 이제부터 남은 시간을 다 기다려야 다음 라운드다 — 빨리 잡아도 앞당겨지지 않는다
    const timer = game.roundTimer;
    game.update(timer - 0.05);
    expect(game.round).toBe(1);
    game.update(0.1);
    expect(game.round).toBe(2);
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
    // 표로 직접 지정 (2026-07-20, 사용자 지시): 15/16/17/18/20
    expect(B.ENEMY_COUNT_BY_CYCLE_POS).toEqual([11, 12, 13, 14, 15]);
    for (let r = 1; r <= 4; r++) {
      expect(B.enemyCount(r + 1)).toBeGreaterThan(B.enemyCount(r));
    }
    expect(B.enemyCount(1)).toBe(B.ENEMY_BASE_COUNT);
    expect(B.enemyCount(5)).toBe(B.ENEMY_COUNT_BY_CYCLE_POS[4]);
    // 사이클 경계: 수는 처음으로, 개당 체력은 크게 점프 — "새 몹은 적지만 굵다"
    expect(B.enemyCount(6)).toBe(B.ENEMY_BASE_COUNT);
    expect(B.enemyHP(6)).toBeGreaterThan(B.enemyHP(5) * 1.5);
  });

  test('R50부터는 사이클과 무관하게 20기 고정 (2026-07-20, 사용자 지시)', () => {
    for (const r of [50, 51, 54, 55, 60, 77]) {
      expect(B.enemyCount(r)).toBe(B.ENEMY_COUNT_FLAT);
    }
    // R49까지는 사이클이 돈다
    expect(B.enemyCount(49)).toBe(B.ENEMY_COUNT_BY_CYCLE_POS[B.posInCycle(49)]);
  });

  test('몹은 1열 종대로 걷는다 (2026-07-20, 사용자 지시)', () => {
    expect(B.MOB_LANE_OFFSET).toBe(0);
    expect(B.MOB_MAX_LATERAL).toBe(0);

    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01);
    for (let i = 0; i < 200; i++) game.update(0.05);
    const mobs = game.enemies.filter((e) => e.kind !== 'boss');
    expect(mobs.length).toBeGreaterThan(3);
    for (const e of mobs) expect(Math.abs(e.lateral ?? 0)).toBeLessThan(0.001);
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

  test('웨이브 총 체력 — 구간별 성장률 직접 지정 (2026-07-20: 10라운드 계단)', () => {
    const waveHp = (r: number) => B.enemyHP(r) * B.enemyCount(r);

    // 정의가 곧 법칙이다 — 반올림 오차 안에서 일치
    for (const r of [1, 7, 13, 25, 40, 55, 60]) {
      const target = B.waveTotalHp(r);
      expect(waveHp(r)).toBeGreaterThan(target * 0.97);
      expect(waveHp(r)).toBeLessThan(target * 1.03);
    }

    // R1 앵커 — 504(보드 DPS 28 × clear 18초) → 572 (2026-07-20, ×1.2 ×1.5 ×0.7 ×0.9).
    // 곱셈 앵커라 곡선 전체가 같이 올라가고 성장률은 안 바뀐다 — 구간 보정은 없다.
    expect(B.WAVE_HP_R1).toBeCloseTo(686.4, 8);
    // R40을 고정점으로 두고 지정 구간을 역산한다.
    expect(B.WAVE_RATE_SEGMENTS.map(([f, r]) => [f, Math.round(r * 100)]))
      .toEqual([[2, 19], [16, 17], [30, 16], [41, 17], [51, 10]]);
    // 보정 구간(R41~50)만은 실효 성장률이 다르다 — 아래에서 따로 본다.
    for (const r of [3, 8, 10, 15]) {
      expect(B.waveTotalHp(r) / B.waveTotalHp(r - 1)).toBeCloseTo(1 + B.WAVE_EARLY_RATE, 5);
    }
    // 각 구간의 실제 성장률이 표와 일치한다 — 표가 유일한 출처다
    for (const [from, rate] of B.WAVE_RATE_SEGMENTS) {
      if (from < 2) continue;
      expect(B.waveTotalHp(from) / B.waveTotalHp(from - 1)).toBeCloseTo(1 + rate, 5);
    }

    // 앵커만 올렸으므로 **모든 구간이 표의 성장률 그대로**다 — 예외 구간이 없다
    for (const r of [41, 45, 50]) {
      expect(B.waveTotalHp(r) / B.waveTotalHp(r - 1)).toBeCloseTo(1 + B.WAVE_LATEMID_RATE, 5);
    }
    expect(B.waveTotalHp(51) / B.waveTotalHp(50)).toBeCloseTo(1 + B.WAVE_WALL_RATE, 5);
    for (const r of [51, 55, 58, 65]) {
      expect(B.waveTotalHp(r) / B.waveTotalHp(r - 1)).toBeCloseTo(1 + B.WAVE_WALL_RATE, 5);
    }
    // 구간 표와 실제 곡선이 어긋나지 않는다 — 표가 유일한 출처다
    for (const [from, rate] of B.WAVE_RATE_SEGMENTS) {
      expect(B.waveGrowthRate(from)).toBeCloseTo(rate, 10);
    }
    expect(B.waveTotalHp(40)).toBeCloseTo(B.WAVE_HP_R40_ANCHOR, 4);
    // 벽(R51+)은 보드 실성장을 앞서야 무한 모드 영생이 없다 (과거 확인된 함정) —
    // 캐리 차단 후 보드 성장 추정 ~5-7%/R. 12%는 앞서지만 여유가 얇다 — 플레이테스트 확인.
    expect(B.WAVE_WALL_RATE).toBeGreaterThan(0.08);

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

  test('R60 클리어 — 타이머가 아니라 웨이브 정리가 기준이다 (2026-07-19)', () => {
    const game = new Game(() => 0.5);
    game.round = B.CLEAR_ROUND;
    const clearCountdown = B.roundCountdownSeconds(B.CLEAR_ROUND);
    game.roundTimer = clearCountdown;

    // R60 웨이브가 남아 있는 동안에는 시간이 얼마가 지나도 클리어가 아니고,
    // 다음 라운드 카운트다운도 흐르지 않는다 (몹은 판정만 확인하도록 정지시킨다)
    game.enemies.push({
      kind: 'mob', name: 'R60', maxHp: 1e9, hp: 1e9, armor: 0,
      speed: 0, radius: 9, distance: 100,
    });
    for (let i = 0; i < 100; i++) game.update(0.5);
    expect(game.cleared).toBe(false);
    expect(game.round).toBe(B.CLEAR_ROUND); // R61이 열리지 않는다
    expect(game.roundTimer).toBeCloseTo(clearCountdown, 1);

    // 마지막 몹을 잡으면 (놓쳐서 누출돼도 라이프만 남으면 같다) — 클리어
    const scoreBefore = game.score;
    game.enemies[0].hp = 0;
    game.update(1 / 60);
    expect(game.cleared).toBe(true);
    expect(game.clearPending).toBe(true);
    expect(game.paused).toBe(true); // 오버레이 동안 시간이 멈춘다
    expect(game.over).toBe(false); // 게임오버가 아니다
    expect(game.score).toBeGreaterThan(scoreBefore + S.CLEAR_SCORE - 1);

    // 멈춘 동안에는 아무 일도 안 일어난다
    game.update(1);
    expect(game.round).toBe(B.CLEAR_ROUND);

    // 계속 — 무한 모드. 후반 카운트다운 뒤 R61이 열린다
    game.continueAfterClear();
    expect(game.paused).toBe(false);
    game.update(clearCountdown + 0.1);
    expect(game.round).toBe(B.CLEAR_ROUND + 1);

    // 클리어는 한 번뿐 — 다시 발동하지 않는다
    expect(game.cleared).toBe(true);
    expect(game.clearPending).toBe(false);
  });

  test('R60에서 라이프가 0이 되면 클리어가 아니라 패배다', () => {
    const game = new Game(() => 0.5);
    game.round = B.CLEAR_ROUND;
    game.lives = 1;
    // 출구 직전 몹 — 누출로 마지막 라이프가 깎인다
    game.enemies.push({
      kind: 'mob', name: 'R60', maxHp: 10, hp: 10, armor: 0,
      speed: 1000, radius: 9, distance: PATH_LENGTH - 1,
    });
    game.update(0.5);
    expect(game.over).toBe(true);
    expect(game.cleared).toBe(false);
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
    // 원본 표는 [5, 8, 13, 20, 29, 39] (trigger #601~#606, Lv6까지). 보스 HP를 지수로
    // 세우면서 보상도 리스크를 따라가게 대체했고, Lv7은 5차에서 신설한 종반 적장이다.
    // 레벨당 증가율이 줄지 않아야 한다.
    expect(B.BOSS_KILL_MINERAL.length).toBe(B.BOSS_MAX_LEVEL);
    expect(bossKillMineral(1)).toBe(5);
    for (let lv = 1; lv < B.BOSS_MAX_LEVEL; lv++) {
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
  // 20 → 30 → 20 (2026-07-20, 사용자 지시). 웨이브 보상 폐지로 킬 미션이 초반의
  // 사실상 유일한 수입원이 되면서 30킬 문턱에서는 경제가 돌지 않았다.
  test('킬 미션 — 20킬마다 +20골드', () => {
    expect(B.KILL_MISSION_EVERY).toBe(20);
    expect(killIncome(0, 19).mineral).toBe(0); // 문턱 전에는 무소득
    expect(killIncome(19, 20).mineral).toBe(B.KILL_MISSION_REWARD);
    // 40~60 구간은 일회성 마일스톤(50킬)이 안 겹치게 골랐다
    expect(killIncome(20, 40).mineral).toBe(B.KILL_MISSION_REWARD);
    expect(killIncome(100, 140).mineral).toBe(2 * B.KILL_MISSION_REWARD); // 한 번에 두 문턱
  });

  // 일회성 초반 마일스톤 (2026-07-20, 사용자 지시) — 초반 수입 공백을 메우는 목돈
  test('누적 50·100킬은 한 번만 준다 — 반복 미션과 별개로 얹힌다', () => {
    expect(B.KILL_MILESTONES).toEqual([[50, 50], [100, 100]]);

    // 49 → 50: 반복 미션(40·60은 안 걸림)은 없고 마일스톤만
    expect(killIncome(49, 50).mineral).toBe(50);
    // 같은 문턱을 다시 지나가지 않는다 — 누적값 기준이라 두 번 안 걸린다
    expect(killIncome(50, 59).mineral).toBe(0);
    expect(killIncome(99, 100).mineral).toBe(100 + B.KILL_MISSION_REWARD); // 100은 반복 문턱이기도
    expect(killIncome(100, 199).mineral).toBe(4 * B.KILL_MISSION_REWARD); // 이후엔 반복만

    // 0 → 199: 반복 9회 + 마일스톤 50 + 100
    expect(killIncome(0, 199).mineral).toBe(9 * B.KILL_MISSION_REWARD + 150);
  });

  // 폐지 (2026-07-20, 사용자 지시: "웨이브 보상 삭제") — 라운드를 흘려보내는 것으로는
  // 아무것도 안 쌓인다. 수입이 전부 행동(킬 미션·보스 처치)에 걸린다.
  test('웨이브 클리어 보상은 없다 — 가만히 있으면 수입이 0이다', () => {
    for (const r of [1, 5, 30, 60]) expect(B.waveReward(r)).toBe(0);

    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01); // 라운드 1 시작

    // 몹을 아무도 안 잡고(킬 미션 없음) 보스도 안 부른 채 라운드만 넘긴다.
    // 누출 미네랄(LEAK_MINERAL)은 들어오므로 그 몫만 인정한다.
    const mineral = game.mineral;
    const livesBefore = game.lives;
    for (let i = 0; i < 50; i++) game.update(0.1);
    game.update(B.ROUND_SECONDS + 0.01);
    expect(game.round).toBe(2);

    const leaked = livesBefore - game.lives;
    expect(game.mineral).toBe(mineral + leaked * B.LEAK_MINERAL);
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
  const CORNER_COUNT = 4 * CORNER_OFFSETS.length;

  // 41 → 29 (2026-07-21, 사용자 지시): 모서리를 3×2(6칸)에서 L자 3칸으로 줄였다.
  // 보드가 넓으면 '수로 밀어붙이기'가 조합·티어보다 쉬워져 중반이 물러진다.
  test('타워 타일은 십자 17 + 모서리 12 = 29개', () => {
    expect(CROSS_COUNT).toBe(17);
    expect(CORNER_COUNT).toBe(12);
    expect(SLOT_POS).toHaveLength(29);
  });

  test('남긴 모서리 3칸은 경로에 가장 가까운 것들이다', () => {
    const distToPath = (x: number, y: number): number => {
      let min = Infinity;
      for (let d = 0; d < PATH_LENGTH; d += 4) {
        const [px, py] = pathPos(d);
        min = Math.min(min, Math.hypot(px - x, py - y));
      }
      return min;
    };
    const corners = SLOT_POS.slice(CROSS_COUNT);
    expect(corners).toHaveLength(12);
    // 6칸이던 시절 바깥 대각 2칸은 거리 74였다 — 그것들이 빠졌는지 확인
    for (const [x, y] of corners) expect(distToPath(x, y)).toBeLessThan(50);
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
