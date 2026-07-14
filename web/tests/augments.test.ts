// 증강 풀 기능축 재편(2026-07-14)이 지켜야 할 것들.
// 근거: docs/reference/augment-taxonomy-v1.0.md — 아레나/TFT 대비 우리 풀이 스탯에 몰려 있었다.

import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import { AUGMENTS } from '../src/data/hero';
import { Game } from '../src/game/game';
import { Hero, augmentAllowed, computeStats } from '../src/game/hero';
import type { Enemy } from '../src/game/types';

const aug = (id: string) => AUGMENTS.find((a) => a.id === id)!;
const card = (id: string, rarity: H.Rarity = 'silver') => H.makeCard(aug(id), rarity);
const stats = (ids: string[], level = 30, growth?: { killStacks: number; waveStacks: number }) =>
  computeStats(level, ids.map((id) => card(id)), growth);

const mob = (distance: number, hp = 1000, maxHp = 1000): Enemy => ({
  kind: 'mob', name: 'x', maxHp, hp, armor: 0, speed: 0, radius: 8, distance,
});

describe('풀 구성 — 스탯에 몰리지 않는다', () => {
  test('모든 계열이 최소 9종씩 있다 — 한 판에 같은 카드가 반복되지 않게', () => {
    for (const kind of H.AUGMENT_KINDS) {
      const count = AUGMENTS.filter((a) => a.kind === kind).length;
      expect(count, `${kind} 계열이 너무 적다`).toBeGreaterThanOrEqual(9);
    }
  });

  test('스탯 강화 계열은 전체의 20%를 넘지 않는다', () => {
    const statShare = AUGMENTS.filter((a) => a.kind === 'stat').length / AUGMENTS.length;
    expect(statShare).toBeLessThanOrEqual(0.2);
  });

  test('대가가 달린 증강이 실제로 있다 — 아레나식 도박성', () => {
    const risky = AUGMENTS.filter(H.isRisky);
    expect(risky.length).toBeGreaterThanOrEqual(8);
    // 대가는 이득과 반대 방향이어야 한다
    for (const a of risky) {
      const p = a.penalty!;
      const worse =
        (p.hpMult !== undefined && p.hpMult < 1) ||
        (p.damageMult !== undefined && p.damageMult < 1) ||
        (p.moveSpeedMult !== undefined && p.moveSpeedMult < 1) ||
        (p.rangeMult !== undefined && p.rangeMult < 1) ||
        (p.attackSpeedMult !== undefined && p.attackSpeedMult < 1) ||
        (p.respawnCut !== undefined && p.respawnCut < 0);
      expect(worse, `${a.id}의 대가가 대가가 아니다`).toBe(true);
    }
  });

  test('모든 증강 id가 유일하다', () => {
    expect(new Set(AUGMENTS.map((a) => a.id)).size).toBe(AUGMENTS.length);
  });
});

describe('대가 — 등급이 대가를 키우지 않는다', () => {
  test('플래티넘 광전사는 이득만 커지고 체력 대가는 그대로다', () => {
    const silver = stats(['glasscannon']);
    const plat = computeStats(30, [card('glasscannon', 'platinum')]);
    const bare = stats([]);

    // 이득(공격력)은 등급으로 커진다
    expect(plat.damage).toBeGreaterThan(silver.damage);
    // 대가(체력 -30%)는 등급과 무관하게 같다
    expect(plat.maxHp).toBe(silver.maxHp);
    expect(plat.maxHp).toBeLessThan(bare.maxHp);
  });
});

describe('성장 — 쌓을수록 세진다', () => {
  test('막타를 쌓으면 공격력이 오르고, 상한에서 멈춘다', () => {
    const none = stats(['hunterinstinct'], 30, { killStacks: 0, waveStacks: 0 });
    const some = stats(['hunterinstinct'], 30, { killStacks: 50, waveStacks: 0 });
    const capped = stats(['hunterinstinct'], 30, { killStacks: 10_000, waveStacks: 0 });

    expect(some.damage).toBeGreaterThan(none.damage);
    // 사냥 본능: 막타당 +0.8%, 최대 +100% (가산 50%는 완력 한 장보다 약했다 → 배수로 상향)
    expect(capped.damage / none.damage).toBeCloseTo(2, 1);
    // 상한을 넘겨도 더 오르지 않는다
    const wayOver = stats(['hunterinstinct'], 30, { killStacks: 1e9, waveStacks: 0 });
    expect(wayOver.damage).toBe(capped.damage);
  });

  test('라운드를 넘길수록 커진다 — 상한 없이 누적', () => {
    const r0 = stats(['veteran'], 30, { killStacks: 0, waveStacks: 0 });
    const r30 = stats(['veteran'], 30, { killStacks: 0, waveStacks: 30 });
    expect(r30.damage / r0.damage).toBeCloseTo(1.9, 1); // 라운드당 +3% × 30
  });

  test('진화(growthMult)가 누적치 자체를 키운다', () => {
    const plain = stats(['veteran'], 30, { killStacks: 0, waveStacks: 20 });
    const evolved = stats(['veteran', 'evolution'], 30, { killStacks: 0, waveStacks: 20 });
    expect(evolved.damage).toBeGreaterThan(plain.damage);
  });

  test('성장 증강이 없으면 스택이 쌓여도 아무 일도 없다', () => {
    const a = stats(['might'], 30, { killStacks: 0, waveStacks: 0 });
    const b = stats(['might'], 30, { killStacks: 500, waveStacks: 50 });
    expect(b.damage).toBe(a.damage);
  });

  test('영웅 막타만 성장 스택이 된다 — 타워가 잡은 몹은 안 센다', () => {
    const game = new Game();
    game.enemies.push({ ...mob(10), hp: 0, lastHitByHero: false });
    game.update(0.016);
    expect(game.hero.killStacks).toBe(0);

    game.enemies.push({ ...mob(10), hp: 0, lastHitByHero: true });
    game.update(0.016);
    expect(game.hero.killStacks).toBe(1);
  });
});

describe('발동 효과 — 새 전투 프리미티브', () => {
  test('흡혈은 가한 피해만큼 영웅을 회복시킨다', () => {
    const game = new Game();
    const hero = game.hero;
    hero.addAugment(card('lifesteal'));
    hero.hp = 10;

    game.enemies.push(mob(hero.distance, 1e9, 1e9));
    for (let i = 0; i < 30; i++) game.update(0.1);

    expect(hero.hp).toBeGreaterThan(10);
  });

  test('처형은 체력이 낮은 몹을 즉사시킨다 — 보스는 예외', () => {
    const game = new Game();
    const hero = game.hero;
    hero.addAugment(card('execute'));
    const s = hero.stats;
    expect(s.executeBelow).toBeGreaterThan(0);

    // 처형 임계 바로 위, 영웅 한 방으로는 못 죽일 큰 체력의 몹
    const big = 1e6;
    const target = mob(hero.distance, big * s.executeBelow * 0.99, big);
    game.enemies.push(target);
    game.update(0.016);
    expect(target.hp).toBeLessThanOrEqual(0);

    // 보스는 같은 상황에서도 즉사하지 않는다
    const game2 = new Game();
    game2.hero.addAugment(card('execute'));
    const boss: Enemy = {
      kind: 'boss', name: 'B', maxHp: big, hp: big * s.executeBelow * 0.99,
      armor: 0, speed: 0, radius: 14, distance: game2.hero.distance, bossLevel: 1,
    };
    game2.enemies.push(boss);
    game2.update(0.016);
    expect(boss.hp).toBeGreaterThan(0);
  });

  test('화상은 공격이 끝난 뒤에도 계속 피해를 준다', () => {
    const game = new Game();
    const hero = game.hero;
    hero.addAugment(card('burn'));

    const target = mob(hero.distance, 1e9, 1e9);
    game.enemies.push(target);
    game.update(0.016); // 한 방 때려서 화상을 붙인다
    expect(target.burnTimer).toBeGreaterThan(0);

    const afterHit = target.hp;
    // 공격 쿨 중에도 화상이 깎는다
    game.update(0.1);
    expect(target.hp).toBeLessThan(afterHit);
  });

  test('감속 공격은 몹을 느리게 만든다', () => {
    const game = new Game();
    const hero = game.hero;
    hero.addAugment(card('frost'));

    const target = mob(hero.distance, 1e9, 1e9);
    game.enemies.push(target);
    game.update(0.016);

    expect(target.slowFactor).toBeLessThan(1);
    expect(target.slowTimer).toBeGreaterThan(0);
  });

  test('가시 갑옷은 때린 적에게 피해를 되돌린다', () => {
    const game = new Game();
    const hero = game.hero;
    hero.addAugment(card('thorns'));

    // 영웅에 붙어서 때리는 몹 — 영웅 공격이 안 닿게 사거리 밖 체력은 크게
    const target = mob(hero.distance, 1e9, 1e9);
    game.enemies.push(target);
    const before = target.hp;
    for (let i = 0; i < 20; i++) game.update(0.1);

    expect(target.hp).toBeLessThan(before);
  });

  test('위기 증강은 체력이 낮을 때만 켜진다', () => {
    const hero = new Hero();
    hero.addAugment(card('laststand'));
    const full = hero.attackDamage;

    hero.hp = hero.stats.maxHp * (H.LOW_HP_THRESHOLD - 0.05);
    expect(hero.attackDamage).toBeGreaterThan(full);
  });

  test('치명타 확률·배수는 상한을 넘지 않는다', () => {
    const many = stats(['crit', 'crit', 'crit', 'deadeye', 'deadeye']);
    expect(many.critChance).toBeLessThanOrEqual(H.CRIT_CHANCE_CAP);
    expect(many.critMult).toBeGreaterThan(H.CRIT_BASE_MULT);
  });

  test('피해 감소는 겹쳐도 상한을 넘지 않는다', () => {
    const stacked = computeStats(30, [
      card('plating', 'platinum'), card('plating', 'platinum'),
      card('aegis', 'platinum'), card('stoneskin', 'platinum'),
      card('secondwind', 'platinum'), card('vanguard', 'platinum'),
    ]);
    expect(stacked.damageReduction).toBeLessThanOrEqual(H.DAMAGE_REDUCTION_CAP);
  });
});

describe('경제 — 라운드 수입', () => {
  test('수확·가스 정맥은 라운드를 넘길 때 들어온다', () => {
    const game = new Game();
    game.hero.addAugment(card('harvest'));
    game.hero.addAugment(card('gasvein'));

    const s = game.hero.stats;
    // 수확은 고정 가산이 아니라 라운드 보상 **배수**다 (라운드가 커질수록 같이 커진다)
    expect(s.waveRewardMult).toBeGreaterThan(1);
    expect(s.gasPerWave).toBeGreaterThan(0);

    // 첫 라운드(0→1)는 설계상 보상이 없다 — 라운드를 한 번 넘긴 뒤부터 잰다
    for (let i = 0; i < 4000 && game.round < 1; i++) game.update(0.05);
    const mineral = game.mineral;
    const gas = game.gas;

    const round = game.round;
    for (let i = 0; i < 4000 && game.round === round; i++) game.update(0.05);

    expect(game.round).toBeGreaterThan(round);
    expect(game.mineral).toBeGreaterThan(mineral);
    expect(game.gas).toBeGreaterThan(gas);
  });

  test('학자는 경험치 획득을 늘린다', () => {
    const plain = new Game();
    const scholar = new Game();
    scholar.hero.addAugment(card('scholar'));

    for (const game of [plain, scholar]) {
      game.enemies.push({ ...mob(10), hp: 0 });
      game.update(0.016);
    }
    expect(scholar.hero.xp).toBeGreaterThan(plain.hero.xp);
  });
});

describe('유틸 — 어그로와 타워 지휘', () => {
  test('도발은 어그로 범위를 넓힌다', () => {
    const plain = new Hero();
    const provoker = new Hero();
    provoker.addAugment(card('provoke'));

    expect(provoker.stats.aggroRange).toBeGreaterThan(plain.stats.aggroRange);
    expect(plain.stats.aggroRange).toBe(H.HERO_AGGRO_RANGE);
  });

  test('결집은 타워 사거리를 넓힌다', () => {
    expect(stats(['rally']).towerRangeMult).toBeGreaterThan(1);
    expect(stats([]).towerRangeMult).toBe(1);
  });
});

describe('시너지 — 계열이 곧 플레이 스타일', () => {
  test('일곱 계열 모두 특화·대특화가 정의돼 있다', () => {
    for (const kind of H.AUGMENT_KINDS) {
      expect(H.SYNERGIES[kind].specialist).toBeDefined();
      expect(H.SYNERGIES[kind].master).toBeDefined();
    }
  });

  test('성장 대특화는 누적치를 크게 키운다', () => {
    const five = ['veteran', 'veteran', 'veteran', 'ironblood', 'momentum'];
    const withMastery = stats(five, 30, { killStacks: 0, waveStacks: 20 });
    const three = stats(['veteran', 'veteran', 'veteran'], 30, { killStacks: 0, waveStacks: 20 });
    expect(H.activeSynergies(five.map((id) => card(id)))).toHaveLength(2); // 특화 + 대특화
    expect(withMastery.damage).toBeGreaterThan(three.damage);
  });

  test('스킬 특화는 스킬 피해를 키운다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_volley'));
    const before = hero.skill!.damageMult;

    hero.addAugment(card('skill_amp'));
    hero.addAugment(card('skill_cdr')); // 스킬 3개 = 각성 특화
    expect(hero.skill!.damageMult).toBeGreaterThan(before);
  });
});

describe('스킬 확장 — 레이저 · 장판 · 처형', () => {
  const withSkill = (ids: string[]) => {
    const game = new Game();
    for (const id of ids) game.hero.addAugment(card(id));
    return game;
  };

  test('레이저는 앞쪽 직선의 적을 관통해 지속 피해를 준다', () => {
    const game = withSkill(['skill_laser']);
    const hero = game.hero;
    const near = mob(hero.distance + 40, 1e9, 1e9);
    const far = mob(hero.distance + 150, 1e9, 1e9);
    const behind = mob(hero.distance - 300, 1e9, 1e9); // 빔 밖
    game.enemies.push(near, far, behind);

    game.useSkill();
    expect(game.beam).not.toBeNull();
    for (let i = 0; i < 20; i++) game.update(0.1);

    expect(near.hp).toBeLessThan(1e9);
    expect(far.hp).toBeLessThan(1e9); // 관통 — 앞의 적이 막지 않는다
    expect(behind.hp).toBe(1e9);
  });

  test('고속 조사는 도트 간격을 절반으로 줄인다 (0.5초 → 0.25초)', () => {
    const plain = withSkill(['skill_laser']).hero.skill!;
    const rapid = withSkill(['skill_laser', 'laser_rapid']).hero.skill!;
    expect(rapid.tickInterval).toBeCloseTo(plain.tickInterval / 2, 5);
  });

  test('불화살은 바닥에 태우는 장판을 남긴다', () => {
    const game = withSkill(['skill_firearrow']);
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9));

    game.useSkill();
    expect(game.zones.length).toBe(1);
    expect(game.zones[0].dps).toBeGreaterThan(0);

    const afterHit = target.hp;
    game.update(0.5); // 장판이 계속 태운다
    expect(target.hp).toBeLessThan(afterHit);
  });

  test('얼음화살 장판은 피해 대신 감속을 건다', () => {
    const game = withSkill(['skill_icearrow']);
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9), mob(game.hero.distance, 1e9, 1e9));

    game.useSkill();
    expect(game.zones[0].dps).toBe(0);
    expect(game.zones[0].slow).toBeLessThan(1);

    game.update(0.1);
    expect(target.slowFactor).toBeLessThan(1);
  });

  test('장판 개조는 장판 스킬을 든 영웅에게만 뜬다', () => {
    const fire = withSkill(['skill_firearrow']).hero;
    const melee = withSkill(['skill_whirlwind']).hero;
    expect(augmentAllowed(fire, aug('zone_hot'))).toBe(true);
    expect(augmentAllowed(melee, aug('zone_hot'))).toBe(false);
  });

  test('처형자의 일격은 처치하면 쿨타임이 즉시 초기화된다', () => {
    const game = withSkill(['skill_execution']);
    const hero = game.hero;
    game.enemies.push(mob(hero.distance, 1, 1000)); // 한 방에 죽는다
    game.useSkill();
    expect(hero.skillCooldown).toBe(0); // 처치 → 쿨 초기화

    // 못 죽이면 쿨이 돈다
    const game2 = withSkill(['skill_execution']);
    game2.enemies.push(mob(game2.hero.distance, 1e9, 1e9));
    game2.useSkill();
    expect(game2.hero.skillCooldown).toBeGreaterThan(0);
  });

  test('한파는 모든 스킬에 감속을 붙인다', () => {
    const game = withSkill(['skill_whirlwind', 'skill_frostbite']);
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9));
    game.useSkill();
    expect(target.slowFactor).toBeLessThan(1);
  });

  test('허수아비·처형은 공속이 오르면 쿨이 짧아진다', () => {
    const slow = withSkill(['skill_decoy']).hero.skill!.cooldown;
    const fast = withSkill(['skill_decoy', 'rapid', 'rapid']).hero.skill!.cooldown;
    expect(fast).toBeLessThan(slow);

    // 공속과 무관한 스킬은 그대로
    const a = withSkill(['skill_meteor']).hero.skill!.cooldown;
    const b = withSkill(['skill_meteor', 'rapid', 'rapid']).hero.skill!.cooldown;
    expect(b).toBe(a);
  });

  test('반격 집중 — 맞으면 스킬 쿨타임이 줄어든다', () => {
    const hero = new Hero();
    hero.addAugment(card('skill_meteor'));
    hero.addAugment(card('skill_riposte'));
    hero.skillCooldown = 10;

    hero.takeDamage(1);
    expect(hero.skillCooldown).toBeLessThan(10);
  });
});

describe('사망·부활 폭발 (초신성)', () => {
  test('영웅이 죽으면 주변이 터진다', () => {
    const game = new Game();
    const hero = game.hero;
    hero.addAugment(card('supernova'));

    const target = mob(hero.distance, 1e9, 1e9);
    game.enemies.push(target);
    const before = target.hp;

    hero.takeDamage(1e9);
    expect(hero.alive).toBe(false);
    game.update(0.016);

    expect(target.hp).toBeLessThan(before);
  });
});

describe('가시 — 허수아비도 되받아친다', () => {
  test('허수아비를 때린 몹이 가시 피해를 받는다', () => {
    const game = new Game();
    const hero = game.hero;
    hero.addAugment(card('skill_decoy'));
    hero.addAugment(card('thornaura'));

    // 허수아비를 세우고, 그 앞에 몹을 붙인다
    game.enemies.push(mob(hero.distance - 30, 1e9, 1e9), mob(hero.distance - 30, 1e9, 1e9));
    game.useSkill();
    expect(game.decoy).not.toBeNull();

    const attacker = mob(game.decoy!.distance, 1e9, 1e9);
    game.enemies.push(attacker);
    const before = attacker.hp;
    for (let i = 0; i < 20; i++) game.update(0.1);

    expect(attacker.hp).toBeLessThan(before);
  });
});

describe('타워 복제 (복제 장치)', () => {
  test('증강이 없으면 복제 자체가 없다', () => {
    const game = new Game();
    expect(game.canCopyTower).toBe(false);
    expect(game.copyTierCap).toBe(-1);
  });

  test('복제 가능 티어 상한은 라운드·영웅 레벨을 따라 오른다', () => {
    const game = new Game();
    game.hero.addAugment(card('replicator'));
    const early = game.copyTierCap;

    game.round = 40;
    game.hero.level = 40;
    expect(game.copyTierCap).toBeGreaterThan(early);
  });

  test('예약한 타워가 라운드 종료 시 빈 타일에 복제된다 — 생성 비용은 오르지 않는다', () => {
    const game = new Game(() => 0.5);
    game.hero.addAugment(card('replicator'));
    game.mineral = 999;
    game.spawnUnitAnywhere();

    const source = game.slots.find((s) => s.tower)!;
    const before = game.slots.filter((s) => s.tower).length;
    const spawnedBefore = game.unitsSpawned;

    expect(game.markCopyTarget(source)).toBe(true);
    expect(game.copyTarget).toBe(source);

    // 복제는 '라운드를 끝냈을 때' 일어난다 — R1을 시작하고 R2로 넘어갈 때까지 돌린다
    for (let i = 0; i < 8000 && game.round < 2; i++) game.update(0.05);

    // 복제본이 원본과 같은 유닛이면 **즉시 조합된다** — 타워 수가 아니라 티어가 오른다.
    // 그래서 둘 중 하나로 확인한다: 타워가 늘었거나, 티어가 올랐거나.
    const towers = game.slots.filter((s) => s.tower);
    const merged = towers.some((s) => s.tower!.tier > 0);
    expect(towers.length > before || merged).toBe(true);

    // 복제는 유닛 생성 비용을 올리지 않는다 — 그게 복제의 값어치다
    expect(game.unitsSpawned).toBe(spawnedBefore);
    expect(game.copyTarget).toBeNull(); // 예약은 한 라운드짜리다
  });

  test('상한을 넘는 티어는 예약할 수 없다', () => {
    const game = new Game(() => 0.5);
    game.hero.addAugment(card('replicator'));
    game.mineral = 999;
    game.spawnUnitAnywhere();

    const slot = game.slots.find((s) => s.tower)!;
    slot.tower = { ...slot.tower!, tier: 3 }; // GOD — 초반엔 못 베낀다
    expect(game.canMarkCopy(slot)).toBe(false);
    expect(game.markCopyTarget(slot)).toBe(false);
  });
});

describe('화염 계열 — 씨앗 한 장은 약하고, 쌓아야 터진다', () => {
  const burnState = (ids: string[]) => {
    const game = new Game();
    for (const id of ids) game.hero.addAugment(card(id));
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target);
    return { game, target };
  };

  test('화상은 공격마다 중첩된다', () => {
    const { game, target } = burnState(['burn']);
    game.update(0.016);
    const first = target.burnStacks!;
    expect(first).toBe(1);

    // 여러 번 때리면 쌓인다 (상한까지)
    for (let i = 0; i < 60; i++) game.update(0.05);
    expect(target.burnStacks!).toBeGreaterThan(first);
    expect(target.burnStacks!).toBeLessThanOrEqual(game.hero.stats.burnMaxStacks);
  });

  test('화상은 방어력을 무시한다 (트루 피해)', () => {
    const armored = { ...mob(0, 1e9, 1e9), armor: 10_000 };
    const game = new Game();
    game.hero.addAugment(card('burn'));
    armored.distance = game.hero.distance;
    game.enemies.push(armored);

    game.update(0.016); // 화상 부착 (평타는 장갑에 거의 다 막힌다)
    const afterHit = armored.hp;
    game.update(0.5); // 화상만 타는 구간
    // 장갑 10000짜리 몹인데도 화상은 그대로 들어간다
    expect(armored.hp).toBeLessThan(afterHit);
  });

  test('불쏘시개는 최대 중첩을 늘린다', () => {
    const plain = new Hero();
    plain.addAugment(card('burn'));
    const kindled = new Hero();
    kindled.addAugment(card('burn'));
    kindled.addAugment(card('kindling'));

    expect(kindled.stats.burnMaxStacks).toBeGreaterThan(plain.stats.burnMaxStacks);
  });

  test('점화 — 최대 중첩에 닿으면 중첩을 태워 광역 폭발', () => {
    const game = new Game();
    game.hero.addAugment(card('burn'));
    game.hero.addAugment(card('ignite'));

    const target = mob(game.hero.distance, 1e9, 1e9);
    const bystander = mob(game.hero.distance + 30, 1e9, 1e9); // 폭발 반경 안, 평타 대상은 아님
    game.enemies.push(target, bystander);

    const before = bystander.hp;
    for (let i = 0; i < 200; i++) game.update(0.05);

    // 폭발이 옆 몹까지 태웠다
    expect(bystander.hp).toBeLessThan(before);
    // 터진 뒤엔 중첩이 비워진다 (상한에 계속 머무르지 않는다)
    expect(target.burnStacks ?? 0).toBeLessThan(game.hero.stats.burnMaxStacks);
  });

  test('발화술 — 화상 걸린 적은 모든 피해를 더 받는다', () => {
    const hero = new Hero();
    hero.addAugment(card('pyromancy'));
    expect(hero.stats.burnAmp).toBeGreaterThan(0);
  });

  test('불바다 장판도 화상을 쌓는다 — 도트끼리 맞물린다', () => {
    const game = new Game();
    game.hero.addAugment(card('skill_firearrow'));
    game.hero.addAugment(card('burn'));

    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9));
    game.useSkill();
    expect(game.zones.length).toBe(1);

    for (let i = 0; i < 40; i++) game.update(0.05);
    expect(target.burnStacks ?? 0).toBeGreaterThan(0);
  });
});
