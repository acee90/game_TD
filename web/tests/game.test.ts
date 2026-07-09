import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import { ARM_TILES, PATH_LENGTH, SLOT_POS, pathPos } from '../src/core/map';
import { GOD_POOL_EARLY, GOD_POOL_LATE, GOD_TIER, godPool } from '../src/data/units';
import { Game } from '../src/game/game';
import { bossKillMineral, killIncome } from '../src/game/economy';
import { unitFor } from '../src/game/merge';
import type { Slot } from '../src/game/types';

const emptySlot = (game: Game): Slot => game.slots.find((s) => !s.tower)!;

/** pick 인덱스를 고정한 채 유닛 하나를 생성한다 */
function spawnWithPick(game: Game, pick: number): void {
  Object.defineProperty(game.pick, 'value', { get: () => pick, configurable: true });
  game.mineral += B.SPAWN_UNIT_MINERAL;
  game.spawnUnit(emptySlot(game));
}

describe('시작 상태 — 원본 trigger #349', () => {
  test('미네랄 55, 가스 6으로 시작한다', () => {
    const game = new Game();
    expect(game.mineral).toBe(55);
    expect(game.gas).toBe(6);
  });

  test('오프닝 카운트다운은 20초, 이후 라운드는 57초', () => {
    expect(B.OPENING_SECONDS).toBe(20);
    expect(B.ROUND_SECONDS).toBe(57);
  });
});

describe('조합 — 같은 유닛 2기가 상위 티어 1기가 된다', () => {
  test('같은 Lv1 2기를 놓으면 Lv2 1기로 합쳐진다', () => {
    const game = new Game();
    spawnWithPick(game, 1);
    spawnWithPick(game, 1);

    const towers = game.slots.filter((s) => s.tower).map((s) => s.tower!);
    expect(towers).toHaveLength(1);
    expect(towers[0].tier).toBe(1);
  });

  test('다른 Lv1 2기는 합쳐지지 않는다', () => {
    const game = new Game();
    spawnWithPick(game, 1);
    spawnWithPick(game, 2);

    const towers = game.slots.filter((s) => s.tower).map((s) => s.tower!);
    expect(towers).toHaveLength(2);
    expect(towers.every((t) => t.tier === 0)).toBe(true);
  });

  test('연쇄 조합 — Lv1 4기가 Lv3 1기가 된다', () => {
    const game = new Game();
    for (let i = 0; i < 4; i++) spawnWithPick(game, 3);

    const towers = game.slots.filter((s) => s.tower).map((s) => s.tower!);
    expect(towers).toHaveLength(1);
    expect(towers[0].tier).toBe(2);
  });

  test('조합 요구 수량은 2 (원본 AtLeast 2)', () => {
    expect(B.MERGE_REQUIRED).toBe(2);
  });
});

describe('선택자 — 결과는 랜덤이 아니라 공유 인덱스로 결정된다', () => {
  test('같은 인덱스는 같은 유닛을 준다', () => {
    expect(unitFor(1, 3, 0)).toBe(unitFor(1, 3, 0));
  });

  test('인덱스가 다르면 다른 유닛을 준다', () => {
    expect(unitFor(1, 1, 0).name).not.toBe(unitFor(1, 2, 0).name);
  });

  test('인덱스는 풀 크기로 순환한다', () => {
    expect(unitFor(1, 8, 0).name).toBe(unitFor(1, 1, 0).name);
  });

  test('보스를 잡으면 선택자가 한 칸 밀린다', () => {
    const game = new Game();
    const before = game.pick.value;
    game.pick.bump();
    expect(game.pick.value).toBe((before % B.PICK_INDEX_MAX) + 1);
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

  test('필드에 보스가 있으면 다시 소환할 수 없다', () => {
    const game = new Game();
    game.summonBoss();
    expect(game.canSummonBoss).toBe(false);
    expect(game.summonBoss()).toBe(false);
  });

  test('보스를 잡기 전에는 다음 레벨이 열리지 않는다', () => {
    const game = new Game();
    game.summonBoss();
    expect(game.nextBossLevel).toBe(1);
  });

  test('Lv1을 잡아야 Lv2가 열린다', () => {
    const game = new Game();
    game.summonBoss();
    const boss = game.enemies.find((e) => e.kind === 'boss')!;
    boss.hp = 0;
    game.update(0.016);
    game.bossCooldown = 0;

    expect(game.bossCleared).toBe(1);
    expect(game.nextBossLevel).toBe(2);
    expect(game.canSummonBoss).toBe(true);
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
    expect(game.activeBossLevel).toBeNull();
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

describe('소득 — 차감 없는 누적형 (원본 §8)', () => {
  test('200킬 마일스톤에서 보상이 나온다', () => {
    expect(killIncome(199, 200).mineral).toBeGreaterThanOrEqual(5);
  });

  test('반복 20킬 보상은 1000킬을 넘으면 커진다', () => {
    expect(killIncome(0, 20).mineral).toBe(10);
    expect(killIncome(1000, 1020).mineral).toBe(12);
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
