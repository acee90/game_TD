// 증강 풀 기능축 재편(2026-07-14)이 지켜야 할 것들.
// 근거: docs/reference/augment-taxonomy-v1.0.md — 아레나/TFT 대비 우리 풀이 스탯에 몰려 있었다.

import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import { AUGMENTS } from '../src/data/hero';
import { Game } from '../src/game/game';
import { Hero, computeStats } from '../src/game/hero';
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
    // 사냥 본능: 막타당 +0.4%, 최대 +50%
    expect(capped.damage / none.damage).toBeCloseTo(1.5, 1);
    // 상한을 넘겨도 더 오르지 않는다
    const wayOver = stats(['hunterinstinct'], 30, { killStacks: 1e9, waveStacks: 0 });
    expect(wayOver.damage).toBe(capped.damage);
  });

  test('라운드를 넘길수록 커진다 — 상한 없이 누적', () => {
    const r0 = stats(['veteran'], 30, { killStacks: 0, waveStacks: 0 });
    const r30 = stats(['veteran'], 30, { killStacks: 0, waveStacks: 30 });
    expect(r30.damage / r0.damage).toBeCloseTo(1.6, 1); // 라운드당 +2% × 30
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
    expect(s.mineralPerWave).toBeGreaterThan(0);
    expect(s.gasPerWave).toBeGreaterThan(0);

    // 첫 라운드(0→1)는 설계상 보상이 없다 — 라운드를 한 번 넘긴 뒤부터 잰다
    for (let i = 0; i < 4000 && game.round < 1; i++) game.update(0.05);
    const mineral = game.mineral;
    const gas = game.gas;

    const round = game.round;
    for (let i = 0; i < 4000 && game.round === round; i++) game.update(0.05);

    expect(game.round).toBeGreaterThan(round);
    expect(game.mineral).toBeGreaterThan(mineral + s.mineralPerWave - 1);
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
