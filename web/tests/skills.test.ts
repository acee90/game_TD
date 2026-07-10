// 액티브 스킬과 스킬 개조 증강.
// 증강이 수치가 아니라 **관계**로 맺어지는 부분이라, 게이팅이 무너지면 조용히 망가진다.

import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import * as K from '../src/data/skills';
import { AUGMENTS } from '../src/data/hero';
import { Game } from '../src/game/game';
import { Hero, rollAugmentChoices } from '../src/game/hero';
import { PATH_LENGTH } from '../src/core/map';
import type { Enemy } from '../src/game/types';

const augment = (id: string) => AUGMENTS.find((a) => a.id === id)!;
const card = (id: string, rarity: H.Rarity = 'silver') => H.makeCard(augment(id), rarity);

/** 영웅 사거리 안에 잡몹 하나 */
const mob = (distance: number, hp = 1e9, speed = 40): Enemy => ({
  kind: 'mob', name: 'x', maxHp: hp, hp, armor: 0,
  speed, radius: 9, distance,
});

describe('스킬 획득 — 하나만 든다', () => {
  test('처음에는 스킬이 없다', () => {
    const hero = new Hero();
    expect(hero.skillId).toBeNull();
    expect(hero.skill).toBeNull();
    expect(hero.skillReady).toBe(false);
  });

  test('스킬 증강을 고르면 스킬이 생긴다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_volley'));

    expect(hero.skillId).toBe('volley');
    expect(hero.skill!.def.name).toBe('일제 사격');
    expect(hero.skillReady).toBe(true);
  });

  test('스킬을 이미 들면 다른 스킬 증강은 안 나온다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_volley'));

    for (const id of K.SKILL_IDS) {
      const grant = AUGMENTS.find((a) => a.grantsSkill === id)!;
      expect(H.skillGateAllows(grant, hero.skillId)).toBe(false);
    }
  });

  test('스킬이 없으면 개조 증강은 안 나온다', () => {
    const explosive = augment('explosive_arrow');
    const cdr = augment('skill_cdr');

    expect(H.skillGateAllows(explosive, null)).toBe(false);
    expect(H.skillGateAllows(cdr, null)).toBe(false);
  });

  test("개조 증강은 그 스킬을 들어야만 나온다", () => {
    const explosive = augment('explosive_arrow'); // volley 전용
    expect(H.skillGateAllows(explosive, 'volley')).toBe(true);
    expect(H.skillGateAllows(explosive, 'meteor')).toBe(false);
  });

  test("'any' 개조는 아무 스킬이나 있으면 나온다", () => {
    const cdr = augment('skill_cdr');
    for (const id of K.SKILL_IDS) expect(H.skillGateAllows(cdr, id)).toBe(true);
  });

  test('실제 뽑기가 게이트를 지킨다', () => {
    const hero = new Hero();
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // 스킬이 없는 동안에는 개조 증강이 한 번도 안 나온다
    for (let i = 0; i < 200; i++) {
      for (const c of rollAugmentChoices(hero, rand)) {
        expect(c.augment.skillMod).toBeUndefined();
      }
    }

    hero.addAugment(card('skill_decoy'));

    // 스킬을 들면 다른 스킬 증강은 사라지고, 그 스킬 전용 개조가 등장한다
    let sawTaunt = false;
    for (let i = 0; i < 400; i++) {
      for (const c of rollAugmentChoices(hero, rand)) {
        expect(c.augment.grantsSkill).toBeUndefined();
        expect(c.augment.id).not.toBe('explosive_arrow'); // volley 전용
        if (c.augment.id === 'taunt_dummy') sawTaunt = true;
      }
    }
    expect(sawTaunt).toBe(true);
  });
});

describe('스킬 개조 — 수치가 아니라 관계다', () => {
  test('냉각은 쿨타임을 줄이되 1초 밑으로는 안 내려간다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_volley'));
    const base = hero.skill!.cooldown;

    hero.addAugment(card('skill_cdr'));
    expect(hero.skill!.cooldown).toBeCloseTo(base * 0.8, 5);

    for (let i = 0; i < 10; i++) hero.addAugment(card('skill_cdr'));
    expect(hero.skill!.cooldown).toBeGreaterThanOrEqual(1);
  });

  test('증폭은 스킬 피해를 곱한다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_meteor'));
    const base = hero.skill!.damageMult;

    hero.addAugment(card('skill_amp'));
    expect(hero.skill!.damageMult).toBeCloseTo(base * 1.45, 5);
  });

  test('연사는 화살 수를 늘린다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_volley'));
    expect(hero.skill!.targets).toBe(K.SKILLS.volley.targets);

    hero.addAugment(card('multishot'));
    expect(hero.skill!.targets).toBe(K.SKILLS.volley.targets + 2);
  });

  test('폭발 화살은 화살마다 반경을 준다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_volley'));
    expect(hero.skill!.mods.explosiveRadius).toBe(0);

    hero.addAugment(card('explosive_arrow'));
    expect(hero.skill!.mods.explosiveRadius).toBeGreaterThan(0);
  });

  test('연사 + 폭발 화살 — 화살이 늘고 각자 터진다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_volley'));
    hero.addAugment(card('multishot'));
    hero.addAugment(card('explosive_arrow'));

    const skill = hero.skill!;
    expect(skill.targets).toBe(6);
    expect(skill.mods.explosiveRadius).toBe(32);
  });

  test('회오리는 소용돌이에 반경과 감속을 붙인다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_whirlwind'));
    const base = hero.skill!.radius;

    hero.addAugment(card('cyclone'));
    expect(hero.skill!.radius).toBe(base + 25);
    expect(hero.skill!.mods.slowFactor).toBeLessThan(1);
  });

  test('감속은 겹쳐도 가장 강한 것 하나', () => {
    const mods = K.foldMods([{ slowFactor: 0.6 }, { slowFactor: 0.8 }]);
    expect(mods.slowFactor).toBe(0.6);
  });

  test('등급은 스킬 개조를 키우지 않는다 — 개조는 스택으로 키운다', () => {
    const silver = H.makeCard(augment('skill_amp'), 'silver');
    const platinum = H.makeCard(augment('skill_amp'), 'platinum');
    expect(platinum.augment.skillMod!.damageMult).toBe(silver.augment.skillMod!.damageMult);
  });
});

describe('스킬 시전', () => {
  test('스킬이 없으면 못 쓴다', () => {
    const game = new Game();
    expect(game.canUseSkill).toBe(false);
    expect(game.useSkill()).toBe(false);
  });

  test('쓰면 쿨타임이 돈다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    game.enemies.push(mob(game.hero.distance));

    expect(game.useSkill()).toBe(true);
    expect(game.hero.skillCooldown).toBeCloseTo(game.hero.skill!.cooldown, 5);
    expect(game.canUseSkill).toBe(false);

    game.update(game.hero.skill!.cooldown + 0.1);
    expect(game.canUseSkill).toBe(true);
  });

  test('죽어 있으면 못 쓴다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    game.hero.takeDamage(1e9);

    expect(game.canUseSkill).toBe(false);
    expect(game.useSkill()).toBe(false);
  });

  test('소용돌이는 주변 적 전체를 때린다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    const d = game.hero.distance;

    game.enemies.push(mob(d - 20), mob(d + 20), mob(d + 500));
    const before = game.enemies.map((e) => e.hp);
    game.useSkill();

    expect(game.enemies[0].hp).toBeLessThan(before[0]);
    expect(game.enemies[1].hp).toBeLessThan(before[1]);
    expect(game.enemies[2].hp).toBe(before[2]); // 사거리 밖
  });

  test('회오리를 쥐면 소용돌이가 적을 늦춘다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    game.hero.addAugment(card('cyclone'));
    const enemy = mob(game.hero.distance - 20);
    game.enemies.push(enemy);

    game.useSkill();
    expect(enemy.slowFactor).toBeLessThan(1);
    expect(enemy.slowTimer).toBeGreaterThan(0);

    // 시간이 지나면 풀린다
    game.update(enemy.slowTimer! + 0.1);
    expect(enemy.slowFactor).toBeUndefined();
  });

  test('일제 사격은 지정된 수만큼만 때린다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_volley'));
    const d = game.hero.distance;
    for (let i = 0; i < 8; i++) game.enemies.push(mob(d + i * 2));

    game.useSkill();
    const hit = game.enemies.filter((e) => e.hp < e.maxHp).length;
    expect(hit).toBe(game.hero.skill!.targets);
  });

  test('폭발 화살은 맞은 적 주변까지 번진다', () => {
    const plain = new Game();
    plain.hero.addAugment(card('skill_volley'));
    const explosive = new Game();
    explosive.hero.addAugment(card('skill_volley'));
    explosive.hero.addAugment(card('explosive_arrow'));

    for (const game of [plain, explosive]) {
      const d = game.hero.distance;
      for (let i = 0; i < 10; i++) game.enemies.push(mob(d + i * 6));
      game.useSkill();
    }

    const hitCount = (game: Game) => game.enemies.filter((e) => e.hp < e.maxHp).length;
    expect(hitCount(explosive)).toBeGreaterThan(hitCount(plain));
  });

  test('유성은 적이 가장 많이 몰린 곳에 떨어진다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_meteor'));

    // 영웅 근처에 1기, 멀리 뭉친 곳에 5기
    const near = mob(game.hero.distance);
    const far = [0, 5, 10, 15, 20].map((o) => mob(700 + o));
    game.enemies.push(near, ...far);

    game.useSkill();
    expect(far.every((e) => e.hp < e.maxHp)).toBe(true);
    expect(near.hp).toBe(near.maxHp);
  });

  test('적이 없으면 유성은 헛돌지 않는다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_meteor'));
    expect(() => game.useSkill()).not.toThrow();
  });
});

describe('허수아비 — 원거리 영웅의 탱커', () => {
  test('영웅 앞쪽(몹이 오는 쪽)에 선다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_decoy'));
    game.useSkill();

    expect(game.decoy).not.toBeNull();
    expect(game.decoy!.distance).toBeLessThan(game.hero.distance);
  });

  test('몹이 허수아비에 붙잡힌다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_decoy'));
    game.useSkill();

    const decoy = game.decoy!;
    const enemy = mob(decoy.distance - 30);
    game.enemies.push(enemy);
    game.update(0.3);

    expect(decoy.distance - enemy.distance).toBeGreaterThanOrEqual(H.ENEMY_TOUCH_RANGE - 1);
  });

  test('허수아비에 붙은 몹은 영웅을 때리지 않는다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_decoy'));
    game.useSkill();

    // 허수아비 자리에 몹을 둔다 — 영웅과도 가깝다
    const enemy = mob(game.decoy!.distance, 1e9, 0);
    game.enemies.push(enemy);

    const heroHp = game.hero.hp;
    game.update(0.05);

    expect(game.hero.hp).toBe(heroHp);
    expect(game.decoy!.hp).toBeLessThan(game.decoy!.maxHp);
  });

  test('체력이 다하면 사라진다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_decoy'));
    game.useSkill();
    game.decoy!.hp = 1;

    const enemy = mob(game.decoy!.distance, 1e9, 0);
    game.enemies.push(enemy);
    game.update(0.05);

    expect(game.decoy).toBeNull();
  });

  test('수명이 다하면 사라진다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_decoy'));
    game.useSkill();

    game.update(K.DECOY_LIFETIME + 0.1);
    expect(game.decoy).toBeNull();
  });

  test('도발 인형은 체력이 두 배다', () => {
    const plain = new Game();
    plain.hero.addAugment(card('skill_decoy'));
    plain.useSkill();

    const taunting = new Game();
    taunting.hero.addAugment(card('skill_decoy'));
    taunting.hero.addAugment(card('taunt_dummy'));
    taunting.useSkill();

    // 반올림이 한 번(최종값)만 들어가므로 ±1 오차를 허용한다
    expect(taunting.decoy!.maxHp).toBeCloseTo(plain.decoy!.maxHp * 2, -1);
    expect(taunting.decoy!.taunts).toBe(true);
  });

  // 영웅이 살아 있으면 영웅 어그로가 먼저 걸려 허수아비 효과를 가린다.
  // 영웅을 죽여 허수아비만 남긴 뒤 비교한다.
  const decoyOnly = (augments: string[]) => {
    const game = new Game();
    for (const id of augments) game.hero.addAugment(card(id));
    game.useSkill();
    game.hero.takeDamage(1e9);
    return game;
  };

  test('도발 인형은 이미 지나친 몹도 끌어당긴다', () => {
    const taunting = decoyOnly(['skill_decoy', 'taunt_dummy']);
    const passed = mob(taunting.decoy!.distance + 40);
    taunting.enemies.push(passed);
    const before = passed.distance;
    taunting.update(0.2);
    expect(passed.distance).toBe(before); // 붙잡혀서 전진하지 못한다

    const plain = decoyOnly(['skill_decoy']);
    const passedPlain = mob(plain.decoy!.distance + 40);
    plain.enemies.push(passedPlain);
    const beforePlain = passedPlain.distance;
    plain.update(0.2);
    expect(passedPlain.distance).toBeGreaterThan(beforePlain); // 그냥 지나간다
  });

  test('허수아비가 없으면 몹은 그냥 흐른다', () => {
    const game = new Game();
    const enemy = mob(50);
    game.enemies.push(enemy);
    game.update(0.2);
    expect(enemy.distance).toBeGreaterThan(50);
  });
});

describe('자동 시전 — 플레이어는 무엇을 들지만 고른다', () => {
  test('쿨타임이 차도 조건을 못 채우면 안 쏜다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind')); // 최소 2기 필요

    expect(game.canUseSkill).toBe(true);
    expect(game.shouldAutoCastSkill).toBe(false);

    game.enemies.push(mob(game.hero.distance, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(false); // 1기뿐

    game.enemies.push(mob(game.hero.distance + 10, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(true);
  });

  test('조건을 채우면 update가 알아서 쏜다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    const a = mob(game.hero.distance, 1e9, 0);
    const b = mob(game.hero.distance + 10, 1e9, 0);
    game.enemies.push(a, b);

    game.update(0.016);

    expect(game.hero.skillCooldown).toBeGreaterThan(0);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  test('유성은 뭉쳤을 때만 떨어진다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_meteor')); // 최소 3기

    game.enemies.push(mob(500, 1e9, 0), mob(900, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(false); // 흩어져 있다

    game.enemies.push(mob(505, 1e9, 0), mob(510, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(true); // 500 언저리에 3기
  });

  test('일제 사격은 한 기만 있어도 쏜다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_volley'));
    expect(game.shouldAutoCastSkill).toBe(false);

    game.enemies.push(mob(game.hero.distance + 20, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(true);
  });

  test('허수아비는 이미 서 있으면 다시 안 세운다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_decoy'));
    game.enemies.push(mob(game.hero.distance - 40, 1e9, 0), mob(game.hero.distance - 60, 1e9, 0));

    expect(game.shouldAutoCastSkill).toBe(true);
    game.useSkill();
    game.hero.skillCooldown = 0;

    expect(game.decoy).not.toBeNull();
    expect(game.shouldAutoCastSkill).toBe(false);
  });

  test('허수아비는 뒤쪽 몹에는 반응하지 않는다 — 이미 지나간 몹이다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_decoy'));
    game.enemies.push(mob(game.hero.distance + 40, 1e9, 0), mob(game.hero.distance + 60, 1e9, 0));

    expect(game.shouldAutoCastSkill).toBe(false);
  });

  test('죽어 있으면 자동 시전도 없다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    game.enemies.push(mob(game.hero.distance, 1e9, 0), mob(game.hero.distance + 5, 1e9, 0));
    game.hero.takeDamage(1e9);

    expect(game.shouldAutoCastSkill).toBe(false);
  });

  test('증강 선택 중에는 시전하지 않는다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    game.enemies.push(mob(game.hero.distance, 1e9, 0), mob(game.hero.distance + 5, 1e9, 0));
    game.hero.pendingAugmentPicks = 1;
    game.update(0.016); // 선택지를 띄운다

    expect(game.paused).toBe(true);
    expect(game.shouldAutoCastSkill).toBe(false);
  });
});

describe('스킬은 막타 경험치를 준다', () => {
  test('스킬로 잡으면 영웅 막타로 친다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_whirlwind'));
    game.enemies.push({ ...mob(game.hero.distance, 1), hp: 1 });

    game.useSkill();
    game.update(0.016);

    expect(game.kills).toBe(1);
    expect(game.hero.xp).toBe(H.XP_PER_MOB * H.HERO_LASTHIT_XP_MULT);
  });
});

describe('돌파와 스킬', () => {
  test('돌파한 몹은 허수아비를 지나 사라진다', () => {
    const game = new Game();
    game.enemies.push(mob(PATH_LENGTH, 10, 0));
    game.update(0.016);
    expect(game.enemies).toHaveLength(0);
  });
});
