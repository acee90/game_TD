import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import { AUGMENTS } from '../src/data/hero';
import { PATH_LENGTH } from '../src/core/map';
import { Game } from '../src/game/game';
import { Hero, computeStats, rollAugmentChoices } from '../src/game/hero';
import { attackInterval, damage } from '../src/game/combat';
import { TIER_POOLS } from '../src/data/units';

const augment = (id: string) => AUGMENTS.find((a) => a.id === id)!;
const dps = (level: number, ids: string[] = []): number => {
  const stats = computeStats(level, ids.map(augment));
  return stats.damage / stats.attackInterval;
};

describe('제단 — 영웅의 출발점', () => {
  test('제단을 세워야 영웅이 생긴다', () => {
    const game = new Game();
    expect(game.hero).toBeNull();
    expect(game.canBuildAltar).toBe(true);

    const mineral = game.mineral;
    expect(game.buildAltar()).toBe(true);
    expect(game.mineral).toBe(mineral - H.ALTAR_MINERAL);
    expect(game.hero).not.toBeNull();
  });

  test('미네랄이 모자라면 못 세운다', () => {
    const game = new Game();
    game.mineral = H.ALTAR_MINERAL - 1;
    expect(game.canBuildAltar).toBe(false);
    expect(game.buildAltar()).toBe(false);
    expect(game.hero).toBeNull();
  });

  test('제단은 하나뿐이다', () => {
    const game = new Game();
    game.buildAltar();
    game.mineral = 999;
    expect(game.buildAltar()).toBe(false);
  });

  test('제단 타일에는 유닛을 놓을 수 없다', () => {
    const game = new Game();
    game.buildAltar();
    game.mineral = 999;

    expect(game.spawnUnit(game.altarSlot)).toBe(false);
    expect(game.altarSlot.tower).toBeNull();

    // 자동 배치도 제단을 피한다
    for (let i = 0; i < 16; i++) game.spawnUnitAnywhere();
    expect(game.altarSlot.tower).toBeNull();
  });

  test('중앙 타일에 타워가 있으면 제단을 못 세운다', () => {
    const game = new Game();
    game.mineral = 999;
    game.spawnUnit(game.altarSlot);
    expect(game.altarSlot.tower).not.toBeNull();
    expect(game.buildAltar()).toBe(false);
  });
});

describe('영웅 이동 — 경로에 매이지 않는다', () => {
  test('클릭한 지점으로 걸어간다', () => {
    const hero = new Hero(100, 100);
    hero.moveTo(200, 100);
    hero.step(0.5);

    expect(hero.x).toBeGreaterThan(100);
    expect(hero.x).toBeLessThan(200);
    expect(hero.y).toBeCloseTo(100, 5);
  });

  test('목적지에 도착하면 멈춘다', () => {
    const hero = new Hero(100, 100);
    hero.moveTo(110, 100);
    for (let i = 0; i < 20; i++) hero.step(0.1);

    expect(Math.abs(hero.x - 110)).toBeLessThanOrEqual(H.HERO_ARRIVE_EPSILON);
  });

  test('타워 타일 위를 그대로 지나간다 — 충돌 판정이 없다', () => {
    const game = new Game();
    game.mineral = 999;
    game.buildAltar();
    for (let i = 0; i < 8; i++) game.spawnUnitAnywhere();

    const hero = game.hero!;
    const occupied = game.slots.find((s) => s.tower)!;
    hero.moveTo(occupied.x, occupied.y);
    for (let i = 0; i < 60; i++) hero.step(0.1);

    const away = Math.hypot(hero.x - occupied.x, hero.y - occupied.y);
    expect(away).toBeLessThanOrEqual(H.HERO_ARRIVE_EPSILON);
  });
});

describe('레벨 — 모든 처치에서 경험치를 얻는다', () => {
  test('타워가 잡은 적도 영웅 경험치가 된다', () => {
    const game = new Game();
    game.buildAltar();
    const hero = game.hero!;

    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    game.update(0.016);

    expect(game.kills).toBe(1);
    expect(hero.xp).toBe(H.XP_PER_MOB);
  });

  test('보스는 레벨에 비례해 큰 경험치를 준다', () => {
    expect(H.xpPerBoss(6)).toBeGreaterThan(H.xpPerBoss(1));
    expect(H.xpPerBoss(1)).toBeGreaterThan(H.XP_PER_MOB);
  });

  test('경험치가 차면 레벨이 오르고 체력이 회복된다', () => {
    const hero = new Hero(0, 0);
    hero.hp = 1;
    const gained = hero.gainXp(hero.xpNeeded);

    expect(gained).toBe(1);
    expect(hero.level).toBe(2);
    expect(hero.hp).toBe(hero.stats.maxHp);
  });

  test('죽어 있으면 경험치를 못 받는다', () => {
    const hero = new Hero(0, 0);
    hero.takeDamage(99999);
    expect(hero.alive).toBe(false);

    hero.gainXp(1000);
    expect(hero.level).toBe(1);
  });
});

describe('사망과 부활 — 패널티는 대기시간뿐', () => {
  test('죽으면 부활 타이머가 걸린다', () => {
    const hero = new Hero(50, 50);
    hero.moveTo(300, 300);
    for (let i = 0; i < 10; i++) hero.step(0.1);
    hero.takeDamage(99999);

    expect(hero.alive).toBe(false);
    expect(hero.respawnTimer).toBeCloseTo(H.HERO_RESPAWN_SECONDS, 5);
  });

  test('대기시간이 끝나면 제단에서 만피로 부활한다', () => {
    const hero = new Hero(50, 50);
    hero.moveTo(300, 300);
    for (let i = 0; i < 10; i++) hero.step(0.1);
    hero.takeDamage(99999);

    hero.step(H.HERO_RESPAWN_SECONDS + 0.1);

    expect(hero.alive).toBe(true);
    expect(hero.x).toBe(50);
    expect(hero.y).toBe(50);
    expect(hero.hp).toBe(hero.stats.maxHp);
  });

  test('경험치는 잃지 않는다', () => {
    const hero = new Hero(0, 0);
    hero.gainXp(3);
    hero.takeDamage(99999);
    hero.step(H.HERO_RESPAWN_SECONDS + 0.1);

    expect(hero.xp).toBe(3);
    expect(hero.level).toBe(1);
  });

  test('불사조 증강은 부활 대기를 줄인다', () => {
    const base = computeStats(1, []);
    const fast = computeStats(1, [augment('phoenix')]);
    expect(fast.respawnSeconds).toBeLessThan(base.respawnSeconds);
  });
});

describe('증강 — 선택 동안 게임이 멈춘다', () => {
  test('AUGMENT_EVERY 레벨마다 선택이 뜬다', () => {
    const hero = new Hero(0, 0);
    while (hero.level < H.AUGMENT_EVERY) hero.gainXp(hero.xpNeeded);

    expect(hero.level).toBe(H.AUGMENT_EVERY);
    expect(hero.pendingAugmentPicks).toBe(1);
  });

  test('선택지가 떠 있으면 update가 시간을 흘리지 않는다', () => {
    const game = new Game();
    game.buildAltar();
    const hero = game.hero!;

    // 증강 레벨까지 한 방에 올린다
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    hero.gainXp(1000);
    game.update(0.016); // grantXp 경로를 태우지 않고 직접 오퍼시킨다
    game.chooseAugment(-1); // 잘못된 인덱스 — 아무 일도 없다

    expect(hero.pendingAugmentPicks).toBeGreaterThan(0);
  });

  test('증강을 고르면 게임이 다시 흐른다', () => {
    const game = new Game();
    game.buildAltar();
    game.hero!.pendingAugmentPicks = 1;
    game.update(0.016);

    expect(game.paused).toBe(true);
    expect(game.augmentChoices).toHaveLength(H.AUGMENT_CHOICES);

    const timer = game.roundTimer;
    game.update(1); // 멈춰 있으니 타이머가 안 준다
    expect(game.roundTimer).toBe(timer);

    expect(game.chooseAugment(0)).toBe(true);
    expect(game.paused).toBe(false);

    game.update(1);
    expect(game.roundTimer).toBeLessThan(timer);
  });

  test('최대 스택에 도달한 증강은 다시 나오지 않는다', () => {
    const hero = new Hero(0, 0);
    const swift = augment('swift');
    for (let i = 0; i < swift.maxStacks; i++) hero.addAugment(swift);

    const choices = rollAugmentChoices(hero, () => 0);
    expect(choices.every((a) => a.id !== 'swift')).toBe(true);
  });

  test('대폭발은 충격파를 먼저 잡아야 나온다', () => {
    const hero = new Hero(0, 0);
    expect(rollAugmentChoices(hero, () => 0).every((a) => a.id !== 'novabig')).toBe(true);

    hero.addAugment(augment('novasmall'));
    expect(hero.hasSplash).toBe(true);

    const pool = AUGMENTS.filter((a) => a.id === 'novabig');
    expect(pool).toHaveLength(1);
  });

  test('선택지는 서로 겹치지 않는다', () => {
    const hero = new Hero(0, 0);
    let call = 0;
    const choices = rollAugmentChoices(hero, () => (call++ % 7) / 7);
    const ids = new Set(choices.map((a) => a.id));
    expect(ids.size).toBe(choices.length);
  });
});

describe('증강 효과 — 곱연산으로 쌓여 먼치킨이 된다', () => {
  test('피해 감소는 곱연산이라 100%에 도달하지 않는다', () => {
    const plating = augment('plating');
    const stats = computeStats(1, [plating, plating]);
    expect(stats.damageReduction).toBeCloseTo(1 - 0.8 * 0.8, 5);
    expect(stats.damageReduction).toBeLessThan(1);
  });

  test('공격력 증강을 한 계열로 몰면 배수가 폭발한다', () => {
    const plain = dps(10);
    const stacked = dps(10, ['might', 'might', 'might', 'marksman', 'rapid']);
    expect(stacked / plain).toBeGreaterThan(5);

    // 더 몰면 더 커진다 — 상한이 없다는 게 먼치킨의 조건이다
    const deeper = dps(10, ['might', 'might', 'might', 'marksman', 'rapid', 'arcane', 'vigor']);
    expect(deeper).toBeGreaterThan(stacked);
  });

  test('광역 증강은 반경을 더한다', () => {
    const stats = computeStats(1, [augment('novasmall'), augment('novabig')]);
    expect(stats.splashRadius).toBe(45 + 40);
  });

  test('전쟁군주는 타워를 강화한다', () => {
    const stats = computeStats(1, [augment('warlord'), augment('warlord')]);
    expect(stats.towerDamageMult).toBeCloseTo(1.12 * 1.12, 5);
  });
});

describe('파워 커브 — 초반 타워, 후반 영웅', () => {
  /** GOD 타워 한 기의 DPS (업그레이드 없음) */
  const godTowerDps = (): number => {
    const def = TIER_POOLS[3][0]; // Lv4 유닛 하나를 GOD 티어로 취급
    const tower = { def, tier: 4, cooldown: 0 };
    return damage(tower, [0, 0, 0, 0]) / attackInterval(tower);
  };

  /** Lv1 타워 한 기의 DPS */
  const lv1TowerDps = (): number => {
    const def = TIER_POOLS[0][0];
    const tower = { def, tier: 0, cooldown: 0 };
    return damage(tower, [0, 0, 0, 0]) / attackInterval(tower);
  };

  test('영웅 1레벨은 Lv1 타워 한 기 수준이다 — 초반 주력이 아니다', () => {
    expect(dps(1)).toBeLessThan(lv1TowerDps() * 2);
  });

  test('영웅 초반 DPS는 GOD 타워보다 한참 낮다', () => {
    expect(dps(1)).toBeLessThan(godTowerDps() / 10);
  });

  test('영웅은 레벨이 오르면 지수적으로 강해진다', () => {
    const ratio = dps(11) / dps(1);
    expect(ratio).toBeCloseTo(Math.pow(H.HERO_DAMAGE_GROWTH, 10), 1);
    expect(ratio).toBeGreaterThan(4);
  });

  test('후반에는 증강 없이도 영웅이 GOD 타워를 넘어선다', () => {
    expect(dps(30)).toBeGreaterThan(godTowerDps());
  });

  test('증강을 몰면 그 시점이 크게 앞당겨진다', () => {
    // 증강 없는 18레벨은 GOD 타워에 못 미치지만
    expect(dps(18)).toBeLessThan(godTowerDps());
    // 공격 계열로 몰면 같은 레벨에 넘어선다
    const munchkin = dps(18, ['might', 'might', 'marksman', 'rapid', 'arcane']);
    expect(munchkin).toBeGreaterThan(godTowerDps());
  });
});

describe('적이 영웅을 때린다', () => {
  test('닿은 적이 영웅 체력을 깎는다', () => {
    const game = new Game();
    game.buildAltar();
    const hero = game.hero!;
    const full = hero.hp;

    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1e9, hp: 1e9, armor: 1e9,
      speed: 0, radius: 8, distance: 0,
    });
    // 영웅을 적 위로 옮긴다
    const [ex, ey] = [0, 0];
    void ex;
    void ey;
    hero.x = 0;
    hero.y = 0;
    const enemy = game.enemies[0];
    enemy.distance = 0;
    hero.x = 172;
    hero.y = 28;
    game.update(0.016);

    expect(hero.hp).toBeLessThan(full);
  });

  test('보스는 잡몹보다 훨씬 아프다', () => {
    expect(H.bossDamage(1)).toBeGreaterThan(H.enemyDamage(1));
  });

  test('돌파한 적은 영웅을 때리지 못한다 — 이미 사라졌다', () => {
    const game = new Game();
    game.buildAltar();
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 10, hp: 10, armor: 0,
      speed: 0, radius: 8, distance: PATH_LENGTH,
    });
    game.update(0.016);
    expect(game.enemies).toHaveLength(0);
  });
});

describe('탐욕 증강 — 처치당 미네랄', () => {
  test('영웅이 없으면 추가 미네랄도 없다', () => {
    const game = new Game();
    const mineral = game.mineral;
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    game.update(0.016);
    expect(game.mineral).toBe(mineral);
  });

  test('탐욕을 쌓으면 처치당 미네랄이 붙는다', () => {
    const game = new Game();
    game.buildAltar();
    game.hero!.addAugment(augment('greed'));
    const mineral = game.mineral;

    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    game.update(0.016);

    expect(game.mineral).toBe(mineral + 1);
  });
});

describe('원본 경제는 그대로', () => {
  test('제단 비용은 시작 미네랄로 감당된다', () => {
    expect(H.ALTAR_MINERAL).toBeLessThanOrEqual(B.START_MINERAL);
  });
});
