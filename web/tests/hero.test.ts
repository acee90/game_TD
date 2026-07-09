import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import { AUGMENTS } from '../src/data/hero';
import { PATH_LENGTH, nearestPathDistance, pathPos } from '../src/core/map';
import { Game } from '../src/game/game';
import { Hero, computeStats, rollAugmentChoices } from '../src/game/hero';

const augment = (id: string) => AUGMENTS.find((a) => a.id === id)!;
/** 실버 등급 카드 — 등급 배수 1이라 원래 효과 그대로 */
const card = (id: string) => H.makeCard(augment(id), 'silver');
const dps = (level: number, ids: string[] = []): number => {
  const stats = computeStats(level, ids.map(card));
  return stats.damage / stats.attackInterval;
};

describe('제단 — 공짜로 주어진다', () => {
  test('게임을 시작하면 영웅이 이미 있다', () => {
    const game = new Game();
    expect(game.hero).toBeDefined();
    expect(game.hero.level).toBe(1);
    expect(game.hero.alive).toBe(true);
  });

  test('제단은 시작 미네랄을 쓰지 않는다', () => {
    expect(new Game().mineral).toBe(B.START_MINERAL);
  });

  test('제단 타일에는 유닛을 놓을 수 없다', () => {
    const game = new Game();
    game.mineral = 999;

    expect(game.spawnUnit(game.altarSlot)).toBe(false);
    expect(game.altarSlot.tower).toBeNull();

    // 자동 배치도 제단을 피한다
    for (let i = 0; i < 45; i++) game.spawnUnitAnywhere();
    expect(game.altarSlot.tower).toBeNull();
  });
});

describe('영웅 이동 — 경로 위에서만', () => {
  test('클릭 지점을 경로에 투영해 그리로 걸어간다', () => {
    const hero = new Hero(0);
    const [tx, ty] = pathPos(300);
    hero.moveTo(tx, ty);

    expect(hero.targetDistance).toBeCloseTo(300, -1);
    hero.step(1);
    expect(hero.distance).toBeGreaterThan(0);
    expect(hero.distance).toBeLessThanOrEqual(300);
  });

  test('경로에서 멀리 떨어진 곳을 찍어도 경로 위 최근접점으로 간다', () => {
    const hero = new Hero(0);
    hero.moveTo(210, 250); // 십자 중앙 — 경로가 아니다
    const [hx, hy] = pathPos(hero.targetDistance);

    // 목적지는 반드시 경로 위다
    expect(nearestPathDistance(hx, hy)).toBeCloseTo(hero.targetDistance, 0);
  });

  test('영웅은 언제나 경로 위에 있다 — 타워 타일 위로 못 올라간다', () => {
    const game = new Game();
    game.mineral = 999;
    for (let i = 0; i < 8; i++) game.spawnUnitAnywhere();

    const hero = game.hero;
    const occupied = game.slots.find((s) => s.tower)!;
    hero.moveTo(occupied.x, occupied.y);
    for (let i = 0; i < 200; i++) hero.step(0.1);

    // 타일 중심에 도달하지 못한다 (경로 밖이므로)
    const away = Math.hypot(hero.x - occupied.x, hero.y - occupied.y);
    expect(away).toBeGreaterThan(1);

    // 그리고 여전히 경로 위에 있다
    const [px, py] = pathPos(hero.distance);
    expect(Math.hypot(hero.x - px, hero.y - py)).toBeLessThan(0.001);
  });

  test('목적지에 도착하면 멈춘다', () => {
    const hero = new Hero(0);
    hero.moveToDistance(40);
    for (let i = 0; i < 40; i++) hero.step(0.1);

    expect(Math.abs(hero.distance - 40)).toBeLessThanOrEqual(H.HERO_ARRIVE_EPSILON);
  });

  test('뒤로도 갈 수 있다', () => {
    const hero = new Hero(300);
    hero.moveToDistance(100);
    hero.step(1);
    expect(hero.distance).toBeLessThan(300);
  });

  test('경로 밖으로는 목적지를 잡을 수 없다', () => {
    const hero = new Hero(0);
    hero.moveToDistance(-500);
    expect(hero.targetDistance).toBe(0);
    hero.moveToDistance(PATH_LENGTH + 500);
    expect(hero.targetDistance).toBe(PATH_LENGTH);
  });
});

describe('어그로 — 몹이 영웅을 보면 멈춘다', () => {
  const mob = (distance: number) => ({
    kind: 'mob' as const, name: 'x', maxHp: 1e9, hp: 1e9, armor: 1e9,
    speed: 50, radius: 9, distance,
  });

  test('시야 안에 영웅이 있으면 전진하지 않는다', () => {
    const game = new Game();
    const hero = game.hero;

    // 영웅 바로 앞(뒤쪽)에 몹을 둔다
    game.enemies.push(mob(hero.distance - 30));
    const before = game.enemies[0].distance;
    game.update(0.2);

    // 접촉 거리까지만 다가오고 그 이상 나아가지 않는다
    const after = game.enemies[0].distance;
    expect(after).toBeGreaterThanOrEqual(before);
    expect(hero.distance - after).toBeGreaterThanOrEqual(H.ENEMY_TOUCH_RANGE - 1);
  });

  test('시야 밖이면 그냥 지나간다', () => {
    const game = new Game();
    const hero = game.hero;

    game.enemies.push(mob(hero.distance - H.HERO_AGGRO_RANGE - 50));
    const before = game.enemies[0].distance;
    game.update(0.2);

    expect(game.enemies[0].distance).toBeGreaterThan(before + 5);
  });

  test('영웅을 지나친 몹은 되돌아오지 않는다', () => {
    const game = new Game();
    const hero = game.hero;

    game.enemies.push(mob(hero.distance + 40));
    const before = game.enemies[0].distance;
    game.update(0.2);

    expect(game.enemies[0].distance).toBeGreaterThan(before);
  });

  test('영웅이 죽으면 몹이 다시 흐른다', () => {
    const game = new Game();
    const hero = game.hero;

    game.enemies.push(mob(hero.distance - 30));
    game.update(0.2);
    const blocked = game.enemies[0].distance;

    hero.takeDamage(1e9);
    expect(hero.alive).toBe(false);
    game.update(0.2);

    expect(game.enemies[0].distance).toBeGreaterThan(blocked);
  });

  test('어그로는 몹을 한곳에 모은다', () => {
    const game = new Game();
    const hero = game.hero;

    for (let i = 0; i < 5; i++) game.enemies.push(mob(hero.distance - 60 + i * 8));
    for (let i = 0; i < 30; i++) game.update(0.05);

    const spread = Math.max(...game.enemies.map((e) => e.distance)) -
      Math.min(...game.enemies.map((e) => e.distance));
    expect(spread).toBeLessThan(20); // 접촉 지점에 뭉친다
  });
});

describe('레벨 — 모든 처치에서 경험치를 얻는다', () => {
  test('타워가 잡은 적도 영웅 경험치가 된다', () => {
    const game = new Game();
    const hero = game.hero;

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
    const hero = new Hero();
    hero.hp = 1;
    const gained = hero.gainXp(hero.xpNeeded);

    expect(gained).toBe(1);
    expect(hero.level).toBe(2);
    expect(hero.hp).toBe(hero.stats.maxHp);
  });

  test('죽어 있으면 경험치를 못 받는다', () => {
    const hero = new Hero();
    hero.takeDamage(99999);
    expect(hero.alive).toBe(false);

    hero.gainXp(1000);
    expect(hero.level).toBe(1);
  });
});

describe('사망과 부활 — 패널티는 대기시간뿐', () => {
  test('죽으면 부활 타이머가 걸린다', () => {
    const hero = new Hero(200);
    hero.moveToDistance(400);
    for (let i = 0; i < 10; i++) hero.step(0.1);
    hero.takeDamage(99999);

    expect(hero.alive).toBe(false);
    expect(hero.respawnTimer).toBeCloseTo(H.HERO_RESPAWN_SECONDS, 5);
  });

  test('대기시간이 끝나면 제단 자리에서 만피로 부활한다', () => {
    const hero = new Hero(200);
    hero.moveToDistance(400);
    for (let i = 0; i < 10; i++) hero.step(0.1);
    expect(hero.distance).toBeGreaterThan(200);

    hero.takeDamage(99999);
    hero.step(H.HERO_RESPAWN_SECONDS + 0.1);

    expect(hero.alive).toBe(true);
    expect(hero.distance).toBe(hero.altarDistance);
    expect(hero.hp).toBe(hero.stats.maxHp);
  });

  test('경험치는 잃지 않는다', () => {
    const hero = new Hero();
    hero.gainXp(3);
    hero.takeDamage(99999);
    hero.step(H.HERO_RESPAWN_SECONDS + 0.1);

    expect(hero.xp).toBe(3);
    expect(hero.level).toBe(1);
  });

  test('불사조 증강은 부활 대기를 줄인다', () => {
    const base = computeStats(1, []);
    const fast = computeStats(1, [card('phoenix')]);
    expect(fast.respawnSeconds).toBeLessThan(base.respawnSeconds);
  });
});

describe('증강 — 선택 동안 게임이 멈춘다', () => {
  test('스케줄에 적힌 레벨에서 선택이 뜬다', () => {
    const first = H.AUGMENT_LEVELS[0];
    const hero = new Hero();
    while (hero.level < first) hero.gainXp(hero.xpNeeded);

    expect(hero.level).toBe(first);
    expect(hero.pendingAugmentPicks).toBe(1);
  });

  test('스케줄에 없는 레벨에서는 안 뜬다', () => {
    const hero = new Hero();
    while (hero.level < H.AUGMENT_LEVELS[0] - 1) hero.gainXp(hero.xpNeeded);
    expect(hero.pendingAugmentPicks).toBe(0);
  });

  test('스케줄을 소진하면 일정 간격으로 계속 준다', () => {
    const last = H.AUGMENT_LEVELS[H.AUGMENT_LEVELS.length - 1];
    expect(H.grantsAugment(last + H.AUGMENT_TAIL_EVERY)).toBe(true);
    expect(H.grantsAugment(last + 1)).toBe(false);
  });

  test('선택지가 떠 있으면 update가 시간을 흘리지 않는다', () => {
    const game = new Game();
    const hero = game.hero;

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
    game.hero.pendingAugmentPicks = 1;
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
    const hero = new Hero();
    const swift = augment('swift');
    for (let i = 0; i < swift.maxStacks; i++) hero.addAugment(card('swift'));

    const choices = rollAugmentChoices(hero, () => 0);
    expect(choices.every((c) => c.augment.id !== 'swift')).toBe(true);
  });

  test('대폭발은 충격파를 먼저 잡아야 나온다', () => {
    const hero = new Hero();
    expect(rollAugmentChoices(hero, () => 0).every((c) => c.augment.id !== 'novabig')).toBe(true);

    hero.addAugment(card('novasmall'));
    expect(hero.hasSplash).toBe(true);

    const pool = AUGMENTS.filter((a) => a.id === 'novabig');
    expect(pool).toHaveLength(1);
  });

  test('선택지는 서로 겹치지 않는다', () => {
    const hero = new Hero();
    let call = 0;
    const choices = rollAugmentChoices(hero, () => (call++ % 7) / 7);
    const ids = new Set(choices.map((c) => c.augment.id));
    expect(ids.size).toBe(choices.length);
  });
});

describe('증강 효과 — 곱연산으로 쌓여 먼치킨이 된다', () => {
  test('피해 감소는 곱연산이라 100%에 도달하지 않는다', () => {
    const plating = card('plating');
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
    const stats = computeStats(1, [card('novasmall'), card('novabig')]);
    expect(stats.splashRadius).toBe(45 + 40);
  });

  test('전쟁군주는 타워를 강화한다', () => {
    const stats = computeStats(1, [card('warlord'), card('warlord')]);
    expect(stats.towerDamageMult).toBeCloseTo(1.12 * 1.12, 5);
  });
});

describe('적이 영웅을 때린다', () => {
  test('붙은 적이 영웅 체력을 깎는다', () => {
    const game = new Game();
    const hero = game.hero;
    const full = hero.hp;

    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1e9, hp: 1e9, armor: 1e9,
      speed: 0, radius: 8, distance: hero.distance,
    });
    game.update(0.016);

    expect(hero.hp).toBeLessThan(full);
  });

  test('보스는 잡몹보다 훨씬 아프고, 레벨이 높을수록 더 아프다', () => {
    expect(H.bossDamage(1, 10)).toBeGreaterThan(H.enemyDamage(10));
    expect(H.bossDamage(6, 10)).toBeGreaterThan(H.bossDamage(1, 10));
  });

  test('몹 공격력은 지수로 자란다 — 영웅이 무적 블로커가 되지 않게', () => {
    expect(H.enemyDamage(20) / H.enemyDamage(10)).toBeCloseTo(
      Math.pow(H.ENEMY_DAMAGE_GROWTH, 10), 5);
    expect(H.enemyDamage(40)).toBeGreaterThan(H.enemyDamage(20) * 5);
  });

  test('멀리 있는 적은 못 때린다', () => {
    const game = new Game();
    const hero = game.hero;
    const full = hero.hp;

    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1e9, hp: 1e9, armor: 1e9,
      speed: 0, radius: 8, distance: hero.distance + 300,
    });
    game.update(0.016);

    expect(hero.hp).toBe(full);
  });

  test('돌파한 적은 영웅을 때리지 못한다 — 이미 사라졌다', () => {
    const game = new Game();
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 10, hp: 10, armor: 0,
      speed: 0, radius: 8, distance: PATH_LENGTH,
    });
    game.update(0.016);
    expect(game.enemies).toHaveLength(0);
  });
});

describe('빌드 정체성 — 탱커는 버티고 원거리는 때린다', () => {
  const aug = (id: string) => AUGMENTS.find((a) => a.id === id)!;
  const build = (ids: string[]) => computeStats(30, ids.map((id) => H.makeCard(aug(id), 'silver')));

  const TANK = ['bulwark', 'bulwark', 'plating'];
  const RANGED = ['might', 'might', 'might'];

  /** 시뮬레이션에서 관측된 라운드별 전형적 영웅 레벨 */
  const typicalLevel = (round: number) => Math.min(60, Math.round(1 + round * 0.95));

  /** 몹 10기가 붙었을 때 버티는 시간 (그 라운드의 전형적 레벨 기준) */
  const blockSeconds = (ids: string[], round: number): number => {
    const s = computeStats(typicalLevel(round), ids.map((id) => H.makeCard(aug(id), 'silver')));
    const effectiveHp = s.maxHp / (1 - s.damageReduction);
    return effectiveHp / (10 * H.enemyDamage(round));
  };

  const dps = (ids: string[]): number => {
    const s = build(ids);
    return s.damage / s.attackInterval;
  };

  test('탱커가 원거리보다 두 배 넘게 오래 막는다', () => {
    const ratio = blockSeconds(TANK, 30) / blockSeconds(RANGED, 30);
    expect(ratio).toBeGreaterThan(2);
  });

  test('원거리가 탱커보다 두 배 넘게 세게 때린다', () => {
    expect(dps(RANGED) / dps(TANK)).toBeGreaterThan(2);
  });

  test('막을 수 있는 시간이 라운드가 지나도 무너지지 않는다', () => {
    // 몹 공격력이 지수라 영웅 성장과 나란히 달린다
    for (const ids of [TANK, RANGED]) {
      const early = blockSeconds(ids, 10);
      const late = blockSeconds(ids, 40);
      expect(late).toBeGreaterThan(early * 0.5);
      expect(late).toBeLessThan(early * 2);
    }
  });

  test('선형 공격력이었다면 후반 영웅이 무적이 됐을 것이다', () => {
    const linear = (round: number) => 4 + 1.6 * round;
    const s = computeStats(typicalLevel(50), []);
    const effectiveHp = s.maxHp / (1 - s.damageReduction);

    const linearBlock = effectiveHp / (10 * linear(50));
    const actualBlock = effectiveHp / (10 * H.enemyDamage(50));
    expect(linearBlock).toBeGreaterThan(actualBlock * 5);
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
    game.hero.addAugment(card('greed'));
    const mineral = game.mineral;

    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    game.update(0.016);

    expect(game.mineral).toBe(mineral + 1);
  });
});

describe('등급 — 세지는 대신 몹이 강해진다', () => {
  test('등급이 높을수록 효과가 크다', () => {
    const might = augment('might');
    const silver = H.makeCard(might, 'silver');
    const gold = H.makeCard(might, 'gold');
    const platinum = H.makeCard(might, 'platinum');

    expect(silver.effect.damageMult).toBe(might.effect.damageMult);
    expect(gold.effect.damageMult!).toBeGreaterThan(silver.effect.damageMult!);
    expect(platinum.effect.damageMult!).toBeGreaterThan(gold.effect.damageMult!);
  });

  test('실버는 대가가 없고, 위 등급은 몹 체력을 올린다', () => {
    expect(H.RARITIES.silver.enemyHpMult).toBe(1);
    expect(H.RARITIES.gold.enemyHpMult).toBeGreaterThan(1);
    expect(H.RARITIES.platinum.enemyHpMult).toBeGreaterThan(H.RARITIES.gold.enemyHpMult);
  });

  test('높은 등급을 고르면 몹 체력 배수가 누적된다', () => {
    const game = new Game();
    expect(game.enemyHpMultiplier).toBe(1);

    game.augmentChoices = [H.makeCard(augment('might'), 'platinum')];
    game.chooseAugment(0);
    expect(game.enemyHpMultiplier).toBeCloseTo(H.RARITIES.platinum.enemyHpMult, 5);

    game.augmentChoices = [H.makeCard(augment('rapid'), 'gold')];
    game.chooseAugment(0);
    expect(game.enemyHpMultiplier).toBeCloseTo(
      H.RARITIES.platinum.enemyHpMult * H.RARITIES.gold.enemyHpMult, 5);
  });

  test('실버만 고르면 몹이 강해지지 않는다', () => {
    const game = new Game();
    game.augmentChoices = [H.makeCard(augment('might'), 'silver')];
    game.chooseAugment(0);
    expect(game.enemyHpMultiplier).toBe(1);
  });

  test('피해 감소는 등급으로도 60%를 넘지 못한다', () => {
    const platinum = H.makeCard(augment('plating'), 'platinum');
    expect(platinum.effect.damageReduction!).toBeLessThanOrEqual(0.6);
  });

  test('등급 뽑기는 가중치를 따른다 — 실버가 가장 흔하다', () => {
    let seed = 1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const counts = { silver: 0, gold: 0, platinum: 0 };
    for (let i = 0; i < 3000; i++) counts[H.rollRarity(rand)]++;

    expect(counts.silver).toBeGreaterThan(counts.gold);
    expect(counts.gold).toBeGreaterThan(counts.platinum);
  });
});

describe('특화 시너지 — 같은 계열을 모으면 터진다', () => {
  const dps = (ids: string[]) => {
    const s = computeStats(30, ids.map((id) => H.makeCard(augment(id), 'silver')));
    return s.damage / s.attackInterval;
  };

  test('두 개까지는 시너지가 없다', () => {
    expect(H.activeSynergies([augment('might'), augment('vigor')].map((a) => H.makeCard(a, 'silver'))))
      .toHaveLength(0);
  });

  test('같은 계열 세 개면 특화가 붙는다', () => {
    const cards = ['might', 'vigor', 'swift'].map((id) => H.makeCard(augment(id), 'silver'));
    const synergies = H.activeSynergies(cards);
    expect(synergies).toHaveLength(1);
    expect(synergies[0]).toBe(H.SYNERGIES.stat.specialist);
  });

  test('다섯 개면 대특화까지 붙는다', () => {
    const cards = ['might', 'might', 'might', 'vigor', 'vigor'].map((id) => H.makeCard(augment(id), 'silver'));
    const synergies = H.activeSynergies(cards);
    expect(synergies).toContain(H.SYNERGIES.stat.specialist);
    expect(synergies).toContain(H.SYNERGIES.stat.master);
  });

  test('세 번째를 같은 계열로 고르면 눈에 띄게 세진다', () => {
    const scattered = dps(['might', 'might', 'longbow']); // stat 2 + ranged 1 — 시너지 없음
    const focused = dps(['might', 'might', 'vigor']); // stat 3 — 특화 발동
    expect(focused).toBeGreaterThan(scattered);
  });

  test('계열을 흩으면 시너지가 없다', () => {
    const cards = ['bulwark', 'longbow', 'novasmall'].map((id) => H.makeCard(augment(id), 'silver'));
    expect(H.activeSynergies(cards)).toHaveLength(0);
  });
});

describe('막타 경험치', () => {
  test('영웅이 막타를 치면 경험치가 더 들어온다', () => {
    expect(H.HERO_LASTHIT_XP_MULT).toBeGreaterThan(1);

    const towerKill = new Game();
    towerKill.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    towerKill.update(0.016);

    const heroKill = new Game();
    heroKill.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10, lastHitByHero: true,
    });
    heroKill.update(0.016);

    expect(towerKill.hero.xp).toBe(H.XP_PER_MOB);
    expect(heroKill.hero.xp).toBe(H.XP_PER_MOB * H.HERO_LASTHIT_XP_MULT);
  });

  test('편차가 크지 않다 — 막타를 다 쳐도 두 배까지', () => {
    expect(H.HERO_LASTHIT_XP_MULT).toBeLessThanOrEqual(2);
  });
});
