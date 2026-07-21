// 증강 풀 기능축 재편(2026-07-14)이 지켜야 할 것들.
// 근거: docs/reference/augment-taxonomy-v1.0.md — 아레나/TFT 대비 우리 풀이 스탯에 몰려 있었다.

import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import * as K from '../src/data/skills';
import { AUGMENTS } from '../src/data/hero';
import { Game } from '../src/game/game';
import { Hero, computeStats } from '../src/game/hero';
import type { Enemy } from '../src/game/types';

const aug = (id: string) => AUGMENTS.find((a) => a.id === id)!;
const card = (id: string, rarity: H.Rarity = 'silver') => H.makeCard(aug(id), rarity);
const stats = (ids: string[], level = 30, growth?: { killStacks: number; waveStacks: number }) =>
  computeStats(level, ids.map((id) => card(id)), growth);

/** 마나를 채우고 시전한다 — 마나 전환(TFT식) 후 스킬은 0마나로 시작한다 */
const castNow = (game: Game): boolean => {
  game.hero.mana = game.hero.manaMax;
  return game.useSkill();
};

const mob = (distance: number, hp = 1000, maxHp = 1000): Enemy => ({
  kind: 'mob', name: 'x', maxHp, hp, armor: 0, speed: 0, radius: 8, distance,
});

describe('풀 구성 — 스탯에 몰리지 않는다', () => {
  // 계열별 최소 종수 — ≥9였다. 증강이 **레벨→라운드 4장**으로 줄고(2026-07-20)
  // 경제가 골드 2종으로 압축되면서(2026-07-21) 이 하한이 옛 전제가 됐다. 한 판에 4장만
  // 받으므로 "한 계열 9종"은 과했다. 카드 리뉴얼 본편에서 축을 재정의할 때 다시 잡는다.
  // 지금은 "우연히 텅 빈 계열"만 잡는 느슨한 하한(≥4)으로 둔다.
  test('계열마다 최소한의 종수는 있다 (리뉴얼 중 임시 하한)', () => {
    for (const kind of H.AUGMENT_KINDS) {
      const count = AUGMENTS.filter((a) => a.kind === kind).length;
      expect(count, `${kind} 계열이 너무 적다`).toBeGreaterThanOrEqual(4);
    }
  });

  test('스탯 강화 계열은 전체의 20%를 넘지 않는다', () => {
    const statShare = AUGMENTS.filter((a) => a.kind === 'stat').length / AUGMENTS.length;
    expect(statShare).toBeLessThanOrEqual(0.2);
  });

  test('대가가 달린 증강이 실제로 있다 — 아레나식 도박성', () => {
    // 2026-07-21 대정리로 대가형 변형 카드(피의 계약·석화 피부·봉화·순교·투자 등)를
    // 중복으로 삭제해 하한을 8 → 4로 내렸다. 남은 대가형: 거인·광전사·결투가·집념·폭발.
    const risky = AUGMENTS.filter(H.isRisky);
    expect(risky.length).toBeGreaterThanOrEqual(4);
    // 대가는 이득과 반대 방향이어야 한다
    for (const a of risky) {
      const p = a.penalty!;
      const worse =
        (p.hpMult !== undefined && p.hpMult < 1) ||
        (p.damageMult !== undefined && p.damageMult < 1) ||
        (p.moveSpeedMult !== undefined && p.moveSpeedMult < 1) ||
        (p.rangeMult !== undefined && p.rangeMult < 1) ||
        (p.attackSpeedMult !== undefined && p.attackSpeedMult < 1) ||
        (p.skillDamageMult !== undefined && p.skillDamageMult < 1) ||
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
  // 2026-07-21 재설계 (사용자 지시): 처치 스택은 **누가 잡았든** 모든 처치를 센다.
  // 값은 막타 시절의 1/4 (사냥 본능 2 → 0.5). '라운드마다 공격력' 축은 폐지됐다.
  test('처치를 쌓으면 공격력이 고정치만큼, 상한 없이 계속 오른다', () => {
    const none = stats(['hunterinstinct'], 30, { killStacks: 0, waveStacks: 0 });
    const some = stats(['hunterinstinct'], 30, { killStacks: 50, waveStacks: 0 });
    const more = stats(['hunterinstinct'], 30, { killStacks: 10_000, waveStacks: 0 });

    expect(some.damage).toBeGreaterThan(none.damage);
    // 사냥 본능: 처치당 +0.5 (고정, 실버 기준). 50킬이면 +25.
    expect(some.damage - none.damage).toBe(25);
    // 상한이 없다 — 많이 쌓을수록 계속 오른다
    expect(more.damage).toBeGreaterThan(some.damage);
    expect(more.damage - none.damage).toBe(5_000);
  });

  test('라운드마다 공격력 성장은 폐지됐다 — 체력 성장(강철 혈통)만 남는다', () => {
    for (const id of ['veteran', 'momentum', 'adaptive', 'warmachine']) {
      expect(AUGMENTS.some((a) => a.id === id), `${id}는 삭제됐어야 한다`).toBe(false);
    }
    const r0 = stats(['ironblood'], 30, { killStacks: 0, waveStacks: 0 });
    const r30 = stats(['ironblood'], 30, { killStacks: 0, waveStacks: 30 });
    expect(r30.maxHp).toBeGreaterThan(r0.maxHp); // 라운드당 체력 +5% 누적
    expect(r30.damage).toBe(r0.damage); // 공격력은 라운드로 크지 않는다
  });

  test('진화(growthMult)가 누적치 자체를 키운다', () => {
    const plain = stats(['hunterinstinct'], 30, { killStacks: 100, waveStacks: 0 });
    const evolved = stats(['hunterinstinct', 'evolution'], 30, { killStacks: 100, waveStacks: 0 });
    expect(evolved.damage).toBeGreaterThan(plain.damage);
  });

  test('성장 증강이 없으면 스택이 쌓여도 아무 일도 없다', () => {
    const a = stats(['might'], 30, { killStacks: 0, waveStacks: 0 });
    const b = stats(['might'], 30, { killStacks: 500, waveStacks: 50 });
    expect(b.damage).toBe(a.damage);
  });

  test('누가 잡았든 성장 스택이 된다 — 타워 처치도 센다 (2026-07-21 막타 조건 폐지)', () => {
    const game = new Game();
    game.enemies.push({ ...mob(10), hp: 0, lastHitByHero: false });
    game.update(0.016);
    expect(game.hero.killStacks).toBe(1); // 타워가 잡아도 센다

    game.enemies.push({ ...mob(10), hp: 0, lastHitByHero: true });
    game.update(0.016);
    expect(game.hero.killStacks).toBe(2);
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

  test('흡혈은 등급으로 증폭되지 않고 총 12%를 넘지 않는다', () => {
    const silver = card('berserk', 'silver');
    const platinum = card('berserk', 'platinum');
    expect(silver.augment.effect.lifesteal).toBe(0.03);
    expect(platinum.augment.effect.lifesteal).toBe(0.03);

    const hero = new Hero();
    for (let i = 0; i < 3; i++) hero.addAugment(card('lifesteal', 'platinum'));
    hero.addAugment(card('bloodthirst', 'platinum'));
    hero.addAugment(card('berserk', 'platinum'));
    expect(hero.stats.lifesteal).toBe(H.LIFESTEAL_CAP);
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
    // 이지스·재기는 드래프트 비활성이지만 데이터는 남아 있다 — 합산 상한은 데이터 성질이라
    // 비활성 카드까지 겹치는 최악 케이스로 검증한다.
    const stacked = computeStats(30, [
      card('plating', 'platinum'), card('plating', 'platinum'),
      card('aegis', 'platinum'), card('aegis', 'platinum'),
      card('secondwind', 'platinum'), card('provoke', 'platinum'),
    ]);
    expect(stacked.damageReduction).toBeLessThanOrEqual(H.DAMAGE_REDUCTION_CAP);
  });
});

describe('경제 — 라운드 수입', () => {
  test('가스 정맥은 라운드를 넘길 때 들어온다', () => {
    const game = new Game();
    game.hero.addAugment(card('gasvein'));

    const s = game.hero.stats;
    expect(s.gasPerWave).toBeGreaterThan(0);

    // 첫 라운드(0→1)는 설계상 보상이 없다 — 라운드를 한 번 넘긴 뒤부터 잰다
    for (let i = 0; i < 4000 && game.round < 1; i++) game.update(0.05);
    const gas = game.gas;

    const round = game.round;
    for (let i = 0; i < 4000 && game.round === round; i++) game.update(0.05);

    expect(game.round).toBeGreaterThan(round);
    expect(game.gas).toBeGreaterThan(gas); // 가스 정맥은 라운드를 넘길 때 들어온다
  });

  // 골드 증강은 딱 둘 — 즉시 골드(일확천금) + 처치 골드(탐욕) (2026-07-21, 사용자 지시)
  test('일확천금은 고르는 즉시 목돈을 준다 (라운드마다가 아니라 일회성)', () => {
    const game = new Game();
    game.augmentChoices = [card('windfall')];
    const before = game.mineral;
    game.chooseAugment(0);
    expect(game.mineral).toBe(before + 250);

    // 즉시 골드는 스탯이 아니라 일회성이다 — 스탯에 안 남는다
    expect(game.hero.stats).not.toHaveProperty('instantMineral');
  });

  test('죽은 라운드보상 증강(수확·재벌)은 삭제됐다', () => {
    for (const id of ['harvest', 'tycoon', 'prospector', 'apprentice', 'bounty']) {
      expect(AUGMENTS.some((a) => a.id === id)).toBe(false);
    }
    // 골드를 주는 경제 증강은 둘뿐이다
    const gold = AUGMENTS.filter(
      (a) => a.kind === 'econ' && (a.effect.instantMineral || a.effect.mineralPerKill),
    );
    expect(gold.map((a) => a.id).sort()).toEqual(['greed', 'windfall']);
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

  test('전쟁군주는 타워 공격력을 키운다 (타워 지휘는 이 한 장으로 통합 — 2026-07-21)', () => {
    for (const id of ['commander', 'rally', 'beacon']) {
      expect(AUGMENTS.some((a) => a.id === id), `${id}는 삭제됐어야 한다`).toBe(false);
    }
    expect(stats(['warlord']).towerDamageMult).toBeGreaterThan(1);
    expect(stats([]).towerDamageMult).toBe(1);
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
    const five = ['hunterinstinct', 'hunterinstinct', 'bloodthirst', 'bloodthirst', 'ironblood'];
    const withMastery = stats(five, 30, { killStacks: 200, waveStacks: 20 });
    const three = stats(
      ['hunterinstinct', 'hunterinstinct', 'bloodthirst'], 30, { killStacks: 200, waveStacks: 20 });
    expect(H.activeSynergies(five.map((id) => card(id)))).toHaveLength(2); // 특화 + 대특화
    expect(withMastery.damage).toBeGreaterThan(three.damage);
  });

  test('스킬 특화는 스킬 피해를 키운다', () => {
    const hero = new Hero();
    hero.skillId = 'volley';
    const before = hero.skill!.damageMult;

    hero.addAugment(card('skill_amp'));
    hero.addAugment(card('skill_cdr')); // 스킬 3개 = 각성 특화
    expect(hero.skill!.damageMult).toBeGreaterThan(before);
  });
});

describe('스킬 확장 — 레이저 · 장판 · 처형', () => {
  const withSkill = (ids: string[]) => {
    const game = new Game();
    // `skill_<id>`는 이제 증강이 아니라 든 스킬을 뜻한다 (2026-07-20 스킬 독립)
    for (const id of ids) {
      const skill = id.slice(6);
      if (id.startsWith('skill_') && (K.SKILL_IDS as readonly string[]).includes(skill)) {
        game.hero.skillId = skill as K.SkillId;
      } else game.hero.addAugment(card(id));
    }
    return game;
  };

  test('레이저는 앞쪽 직선의 적을 관통해 지속 피해를 준다', () => {
    const game = withSkill(['skill_laser']);
    const hero = game.hero;
    const near = mob(hero.distance + 40, 1e9, 1e9);
    const far = mob(hero.distance + 150, 1e9, 1e9);
    const behind = mob(hero.distance - 300, 1e9, 1e9); // 빔 밖
    game.enemies.push(near, far, behind);

    castNow(game);
    expect(game.beam).not.toBeNull();
    for (let i = 0; i < 20; i++) game.update(0.1);

    expect(near.hp).toBeLessThan(1e9);
    expect(far.hp).toBeLessThan(1e9); // 관통 — 앞의 적이 막지 않는다
    expect(behind.hp).toBe(1e9);
  });

  test('파장은 레이저 길이를 늘린다 (범위 축 통합 — 2026-07-21)', () => {
    const plain = withSkill(['skill_laser']).hero.skill!;
    const wide = withSkill(['skill_laser', 'skill_radius']).hero.skill!;
    expect(wide.beamLength).toBe(plain.beamLength + 60);
  });

  test('불화살은 바닥에 태우는 장판을 남긴다', () => {
    const game = withSkill(['skill_firearrow']);
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9));

    castNow(game);
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

    castNow(game);
    expect(game.zones[0].dps).toBe(0);
    expect(game.zones[0].slow).toBeLessThan(1);

    game.update(0.1);
    expect(target.slowFactor).toBeLessThan(1);
  });

  // 장판 전용 개조(넓은 화선·맹렬한 불길)는 2026-07-21 강화 5축 재정리로 삭제 —
  // 장판 반경은 범용 '파장'이 담당한다.

  test('처형자의 일격은 처치하면 마나를 쓰지 않는다 (연쇄 처형)', () => {
    const game = withSkill(['skill_execution']);
    const hero = game.hero;
    hero.mana = hero.manaMax;
    game.enemies.push(mob(hero.distance, 1, 1000)); // 한 방에 죽는다
    castNow(game);
    expect(hero.mana).toBe(hero.manaMax); // 처치 → 마나가 그대로 남는다
    expect(game.canUseSkill).toBe(true); // 바로 또 쓸 수 있다

    // 못 죽이면 마나를 쓴다
    const game2 = withSkill(['skill_execution']);
    game2.hero.mana = game2.hero.manaMax;
    game2.enemies.push(mob(game2.hero.distance, 1e9, 1e9));
    castNow(game2);
    expect(game2.hero.mana).toBeLessThan(game2.hero.manaMax);
  });

  test('한파는 모든 스킬에 감속을 붙인다', () => {
    const game = withSkill(['skill_whirlwind', 'skill_frostbite']);
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9));
    castNow(game);
    expect(target.slowFactor).toBeLessThan(1);
  });

  test('허수아비·처형은 공속이 오르면 필요 마나가 낮아진다', () => {
    const slow = withSkill(['skill_decoy']).hero.skill!.manaMax;
    const fast = withSkill(['skill_decoy', 'rapid', 'rapid']).hero.skill!.manaMax;
    expect(fast).toBeLessThan(slow);

    // 공속 보정이 없는 스킬은 그대로 (다만 평타 마나 자체가 공속을 따라간다)
    const a = withSkill(['skill_meteor']).hero.skill!.manaMax;
    const b = withSkill(['skill_meteor', 'rapid', 'rapid']).hero.skill!.manaMax;
    expect(b).toBe(a);
  });

  test('맞으면 기본 마나가 찬다 (반격 집중 카드는 2026-07-21 삭제 — 기본 동작만 남는다)', () => {
    const hero = new Hero();
    hero.skillId = 'meteor';
    hero.takeDamage(1);
    expect(hero.mana).toBeGreaterThan(0);
  });

  test('평타가 마나를 채운다 — 공속이 곧 스킬 회전이다', () => {
    const slow = new Game();
    slow.hero.skillId = 'meteor';
    const fast = new Game();
    fast.hero.skillId = 'meteor';
    fast.hero.addAugment(card('rapid'));
    fast.hero.addAugment(card('rapid'));

    for (const game of [slow, fast]) {
      game.enemies.push(mob(game.hero.distance, 1e9, 1e9));
      for (let i = 0; i < 120; i++) game.update(1 / 60); // 2초
    }
    expect(fast.hero.mana).toBeGreaterThan(slow.hero.mana);
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
    hero.skillId = 'decoy';
    hero.addAugment(card('thorns'));

    // 허수아비를 세우고, 그 앞에 몹을 붙인다
    game.enemies.push(mob(hero.distance - 30, 1e9, 1e9), mob(hero.distance - 30, 1e9, 1e9));
    castNow(game);
    expect(game.decoy).not.toBeNull();

    const attacker = mob(game.decoy!.distance, 1e9, 1e9);
    game.enemies.push(attacker);
    const before = attacker.hp;
    for (let i = 0; i < 20; i++) game.update(0.1);

    expect(attacker.hp).toBeLessThan(before);
  });
});

describe('긴급 증원 — 랜덤 타워 일시불 (2026-07-21, 복제 장치 대체)', () => {
  test('복제 장치는 풀에서 사라졌다 — 복제 진입 경로가 없다', () => {
    expect(AUGMENTS.some((a) => a.id === 'replicator')).toBe(false);
    const game = new Game();
    expect(game.canCopyTower).toBe(false);
  });

  test('고르는 즉시 랜덤 타워를 준다 — 생성 비용은 오르지 않는다', () => {
    const game = new Game(() => 0.5);
    const before = game.slots.filter((s) => s.tower).length;
    const spawnedBefore = game.unitsSpawned;

    game.augmentChoices = [card('reinforce')];
    expect(game.chooseAugment(0)).toBe(true);

    // 실버 = 티어1(내부 tier 0) ×1
    const towers = game.slots.filter((s) => s.tower);
    expect(towers.length).toBe(before + 1);
    expect(towers[0].tower!.tier).toBe(H.TOWER_ROLL_BY_RARITY.silver.tier);
    expect(game.unitsSpawned).toBe(spawnedBefore); // 일시불의 값어치 — 생성비 불변
  });

  test('강화하면 등급별 추가 지급분을 그 자리에서 받는다 (골드 +1기, 플래티넘 +티어2 1기)', () => {
    const game = new Game(() => 0.5);
    game.augmentChoices = [card('reinforce')];
    game.chooseAugment(0);
    // 강화 해금 조건(모든 증강 4개)을 강화 불가 카드로 채운다
    for (const id of ['skill_cdr', 'skill_amp', 'skill_barrage']) game.hero.addAugment(card(id));
    const afterSilver = game.slots.filter((s) => s.tower).length;

    // 실버 → 골드: 티어1 한 기 더 (같은 유닛이면 조합될 수 있어 수 또는 티어로 확인)
    game.pendingFreeUpgrades = 1;
    expect(game.offerAugmentUpgrade()).toBe(true);
    expect(game.chooseAugmentUpgrade(0)).toBe(true);
    const towers = game.slots.filter((s) => s.tower);
    const merged = towers.some((s) => s.tower!.tier > 0);
    expect(towers.length > afterSilver || merged).toBe(true);
  });
});

describe('증강 강화 해금 — 모든 증강을 받은 뒤에만 (2026-07-21, 사용자 지시)', () => {
  test('증강이 4개 미만이면 강화를 살 수 없다', () => {
    const game = new Game(() => 0.5);
    game.mineral = 10_000;
    game.augmentChoices = [card('windfall')];
    game.chooseAugment(0); // 1/4
    expect(game.augmentUpgradeUnlocked).toBe(false);
    expect(game.canOfferAugmentUpgrade).toBe(false);
    expect(game.offerAugmentUpgrade()).toBe(false);

    for (const id of ['skill_cdr', 'skill_amp', 'skill_barrage']) game.hero.addAugment(card(id));
    expect(game.augmentUpgradeUnlocked).toBe(true); // 4/4
    expect(game.offerAugmentUpgrade()).toBe(true);
  });
});

describe('일시불 증강 강화 — 명목 비용 연동 일시금 (2026-07-21, 사용자 지시)', () => {
  // 강화도 카드 성격대로 일시금을 주되, 지급액이 강화 구매 비용에 묶인다:
  // 실버→골드 = 비용×1.5, 골드→플래티넘 = 비용×1.0(본전). "일확천금 골드로 강화를 사서
  // 또 일확천금이 강화되는" 연쇄는 그래서 카드당 순이익 최대 +[비용×0.5] 한 번으로 끝난다.
  test('일확천금 강화는 명목 비용×1.5 → ×1.0으로 지급된다', () => {
    const game = new Game(() => 0.5);
    game.augmentChoices = [card('windfall')];
    game.chooseAugment(0); // 실버 250 지급
    // 강화는 모든 증강(4개) 획득 후 해금 — 강화 불가(스킬 개조) 카드로 채워
    // 강화 후보가 일확천금 하나로 고정되게 한다
    for (const id of ['skill_cdr', 'skill_amp', 'skill_barrage']) game.hero.addAugment(card(id));
    const before = game.mineral;

    // 실버 → 골드 (무료 강화여도 명목가 120 기준): +120×1.5 = +180
    game.pendingFreeUpgrades = 1;
    expect(game.offerAugmentUpgrade()).toBe(true);
    expect(game.chooseAugmentUpgrade(0)).toBe(true);
    expect(game.mineral - before).toBe(180);

    // 골드 → 플래티넘 (유료, 비용 = 명목가): 비용만큼 돌려받아 본전이다
    game.mineral = 10_000;
    const mid = game.mineral;
    expect(game.offerAugmentUpgrade()).toBe(true);
    expect(game.chooseAugmentUpgrade(0)).toBe(true);
    expect(game.mineral).toBe(mid); // -비용 +비용 = 0
  });

  test('일시금은 등급 배수를 타지 않는다 — 강화 지급은 비용 기준이지 카드 수치 기준이 아니다', () => {
    expect(H.makeCard(aug('windfall'), 'platinum').effect.instantMineral).toBe(250);
    expect(H.makeCard(aug('gasrush'), 'gold').effect.instantGas).toBe(40);
    expect(H.makeCard(aug('enlighten'), 'platinum').effect.instantXp).toBe(80);
  });

  test('노다지·깨달음 강화도 각자의 재화로 환산해 받는다', () => {
    // 골드 120×1.5 = 180 상당 → 마정석 180×(40/250)≈29, 경험치 180÷3=60
    expect(H.instantUpgradeGrant(aug('gasrush').effect, 'gold', 120)).toEqual({ gas: 29 });
    expect(H.instantUpgradeGrant(aug('enlighten').effect, 'gold', 120)).toEqual({ xp: 60 });
    expect(H.instantUpgradeGrant(aug('windfall').effect, 'platinum', 204)).toEqual({ mineral: 204 });
    expect(H.instantUpgradeGrant(aug('greed').effect, 'gold', 120)).toBeNull(); // 일시불만
  });

  test('마정석 노다지·깨달음은 고르는 즉시 들어온다', () => {
    const game = new Game(() => 0.5);
    const gasBefore = game.gas;
    game.augmentChoices = [card('gasrush')];
    game.chooseAugment(0);
    expect(game.gas - gasBefore).toBe(40);

    const game2 = new Game(() => 0.5);
    const xpBefore = game2.hero.xp + game2.hero.level * 1000;
    game2.augmentChoices = [card('enlighten')];
    game2.chooseAugment(0);
    expect(game2.hero.xp + game2.hero.level * 1000).toBeGreaterThan(xpBefore);
  });
});

describe('화염 계열 — 평타가 아니라 스킬·도트가 불을 붙인다', () => {
  test('평타로는 화상이 안 붙는다', () => {
    const game = new Game();
    game.hero.addAugment(card('burn'));
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target);

    for (let i = 0; i < 40; i++) game.update(0.05); // 평타만 계속 때린다
    expect(target.burnStacks ?? 0).toBe(0);
    expect(target.hp).toBeLessThan(1e9); // 평타 피해는 들어간다
  });

  test('스킬이 화상을 붙이고, 겹이 쌓일수록 초당 피해가 선형으로 커진다', () => {
    const game = new Game();
    game.hero.skillId = 'meteor';
    game.hero.addAugment(card('burn'));
    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9), mob(game.hero.distance, 1e9, 1e9));

    castNow(game);
    expect(target.burnStacks).toBe(1);

    // 겹당 초당 피해 = burnDps × 겹 수 (선형 누적)
    const perStack = target.burnDps!;
    expect(perStack).toBeGreaterThan(0);

    game.hero.mana = game.hero.manaMax; // 마나를 채워 다시 시전
    castNow(game);
    expect(target.burnStacks).toBe(2);
    expect(target.burnDps).toBe(perStack); // 겹당 값은 그대로, 겹 수만 늘어난다
  });

  test('중첩에 상한이 없다 — 도트가 계속 얹으면 계속 두꺼워진다', () => {
    const game = new Game();
    game.hero.skillId = 'laser';
    game.hero.addAugment(card('burn'));
    const target = mob(game.hero.distance + 40, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance + 45, 1e9, 1e9));

    castNow(game); // 레이저 — 틱마다 한 겹
    for (let i = 0; i < 60; i++) game.update(0.05);

    expect(target.burnStacks!).toBeGreaterThan(3); // 옛 상한(3)을 넘는다
  });

  test('화상은 방어력을 무시한다 (트루 피해)', () => {
    const game = new Game();
    game.hero.skillId = 'meteor';
    game.hero.addAugment(card('burn'));
    const armored = { ...mob(game.hero.distance, 1e9, 1e9), armor: 10_000 };
    game.enemies.push(armored, mob(game.hero.distance, 1e9, 1e9), mob(game.hero.distance, 1e9, 1e9));

    castNow(game);
    const afterCast = armored.hp;
    game.update(0.5); // 화상만 타는 구간
    expect(armored.hp).toBeLessThan(afterCast);
  });

  test('점화는 화염 피해 배수다 — 폭발이 아니다', () => {
    const plain = new Hero();
    plain.addAugment(card('burn'));
    const ignited = new Hero();
    ignited.addAugment(card('burn'));
    ignited.addAugment(card('ignite'));

    expect(ignited.stats.fireDamageMult).toBeGreaterThan(plain.stats.fireDamageMult);
    expect(plain.stats.fireDamageMult).toBe(1);
  });

  test('맹독은 방어력을 깎는다 (감속은 서리 일격의 축 — 2026-07-21 디버프 2×2)', () => {
    const game = new Game();
    game.hero.addAugment(card('venom'));
    expect(game.hero.stats.armorShred).toBeGreaterThan(0);

    const target = { ...mob(game.hero.distance, 1e9, 1e9), armor: 50 };
    game.enemies.push(target);
    game.update(0.016);

    expect(target.armorShred).toBeGreaterThan(0);
    expect(target.slowFactor).toBeUndefined(); // 맹독은 더는 감속하지 않는다
  });

  test('불바다 장판도 화상을 쌓는다 — 도트끼리 맞물린다', () => {
    const game = new Game();
    game.hero.skillId = 'firearrow';
    game.hero.addAugment(card('burn'));

    const target = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(target, mob(game.hero.distance, 1e9, 1e9));
    castNow(game);
    expect(game.zones.length).toBe(1);

    for (let i = 0; i < 40; i++) game.update(0.05);
    expect(target.burnStacks ?? 0).toBeGreaterThan(1); // 착탄 1겹 + 장판 틱
  });
});

describe('채널링 vs 단발 — 쿨감의 값어치가 갈린다', () => {
  test('레이저는 채널링 — 빔이 나가는 동안 쿨이 돌지 않는다', () => {
    const game = new Game();
    game.hero.skillId = 'laser';
    game.enemies.push(
      mob(game.hero.distance + 40, 1e9, 1e9),
      mob(game.hero.distance + 60, 1e9, 1e9),
    );

    game.hero.mana = game.hero.manaMax;
    castNow(game);
    expect(game.beam).not.toBeNull();
    expect(game.canUseSkill).toBe(false); // 채널 중엔 다시 못 쓴다

    // 채널링 중에는 평타를 쳐도 마나가 차지 않는다 — 그래서 가동률에 천장이 생긴다
    const manaWhileChanneling = game.hero.mana;
    for (let i = 0; i < 20; i++) game.update(0.05);
    expect(game.hero.mana).toBe(manaWhileChanneling);

    // 빔이 끝나면 그때부터 다시 찬다. 채널 시간을 넘겨 빔이 끝난
    // 뒤 최소 한 프레임은 평타가 마나를 채울 시간을 보장한다.
    for (let i = 0; i < 140; i++) game.update(0.05);
    expect(game.beam).toBeNull();
    expect(game.hero.mana).toBeGreaterThan(manaWhileChanneling);
  });

  test('단발 스킬은 필요 마나가 줄면 그대로 이득이다', () => {
    const plain = new Hero();
    plain.skillId = 'meteor';
    const cheap = new Hero();
    cheap.skillId = 'meteor';
    cheap.addAugment(card('skill_cdr'));

    expect(K.SKILLS.meteor.castType).toBe('burst');
    expect(cheap.skill!.manaMax).toBeLessThan(plain.skill!.manaMax);
  });

  test('레이저·허수아비는 채널링으로 분류된다', () => {
    expect(K.SKILLS.laser.castType).toBe('channel');
    expect(K.SKILLS.decoy.castType).toBe('channel');
    expect(K.SKILLS.meteor.castType).toBe('burst');
    expect(K.SKILLS.chain.castType).toBe('burst');
  });
});

describe('튕기는 사격 — 튕길수록 강해지고, 몹이 적으면 약하다', () => {
  test('여러 적에게 튕겨 나간다', () => {
    const game = new Game();
    game.hero.skillId = 'chain';
    const targets = [0, 30, 60, 90].map((d) => mob(game.hero.distance + d, 1e9, 1e9));
    game.enemies.push(...targets);

    castNow(game);
    // 첫 대상부터 차례로 튕겨 전부 맞는다
    for (const t of targets) expect(t.hp).toBeLessThan(1e9);
  });

  test('튕길수록 세진다 — 나중에 맞은 적이 더 아프다', () => {
    const game = new Game();
    game.hero.skillId = 'chain';
    const first = mob(game.hero.distance, 1e9, 1e9);
    const later = mob(game.hero.distance + 60, 1e9, 1e9);
    game.enemies.push(first, mob(game.hero.distance + 30, 1e9, 1e9), later);

    castNow(game);
    const firstDamage = 1e9 - first.hp;
    const laterDamage = 1e9 - later.hp;
    expect(laterDamage).toBeGreaterThan(firstDamage);
  });

  test('적이 하나뿐이면 튕기지 못해 약하다', () => {
    const game = new Game();
    game.hero.skillId = 'chain';
    const lonely = mob(game.hero.distance, 1e9, 1e9);
    game.enemies.push(lonely);

    castNow(game);
    const solo = 1e9 - lonely.hp;

    // 같은 스킬이 무리에 쏠 때는 총 피해가 훨씬 크다
    const crowd = new Game();
    crowd.hero.skillId = 'chain';
    const mobs = [0, 30, 60, 90, 120].map((d) => mob(crowd.hero.distance + d, 1e9, 1e9));
    crowd.enemies.push(...mobs);
    castNow(crowd);
    const total = mobs.reduce((sum, m) => sum + (1e9 - m.hp), 0);

    expect(total).toBeGreaterThan(solo * 3);
  });
});
