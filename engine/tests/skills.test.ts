// 액티브 스킬과 스킬 개조 증강.
// 증강이 수치가 아니라 **관계**로 맺어지는 부분이라, 게이팅이 무너지면 조용히 망가진다.

import { describe, expect, test } from 'vitest';
import * as H from '../src/data/hero';
import * as B from '../src/data/balance';
import * as K from '../src/data/skills';
import { AUGMENTS } from '../src/data/hero';
import { Game } from '../src/game/game';
import { Hero, rollAugmentChoices } from '../src/game/hero';
import { PATH_LENGTH } from '../src/core/map';
import type { Enemy } from '../src/game/types';

const augment = (id: string) => AUGMENTS.find((a) => a.id === id)!;

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
const card = (id: string, rarity: H.Rarity = 'silver') => H.makeCard(augment(id), rarity);


/** 영웅 사거리 안에 잡몹 하나 */
/** 마나를 채우고 시전한다 — 마나 전환(TFT식) 후 스킬은 0마나로 시작한다 */
const castNow = (game: Game): boolean => {
  game.hero.mana = game.hero.manaMax;
  return game.useSkill();
};

const mob = (distance: number, hp = 1e9, speed = 40): Enemy => ({
  kind: 'mob', name: 'x', maxHp: hp, hp, armor: 0,
  speed, radius: 9, distance,
});

describe('스킬 독립 — 판이 문제를 낸다 (2026-07-20)', () => {
  // 시작 스킬은 **고정**이다 (2026-07-20, 사용자 지시) — 랜덤 시작을 되돌렸다.
  test("시작 스킬은 '강한 일격' 고정 — 단일 대상이라 일부러 초라하다", () => {
    for (const seed of [1, 7, 99]) {
      expect(new Game(lcg(seed)).hero.skillId).toBe(K.STARTER_SKILL);
    }
    const def = K.SKILLS[K.STARTER_SKILL];
    expect(def.name).toBe('강한 일격');
    expect(def.targets).toBe(1); // 광역도 다중 대상도 아니다
    expect(def.damageMult).toBe(3);
  });

  test("'제대로된 스킬' 풀에 시작 장비는 없다 — 한 번 벗으면 못 돌아간다", () => {
    expect(K.SKILL_IDS).not.toContain(K.STARTER_SKILL);
    expect(K.isStarterSkill(K.STARTER_SKILL)).toBe(true);
    expect(K.SKILL_IDS.every((id) => !K.isStarterSkill(id))).toBe(true);
  });

  test('갓 시작한 영웅은 마나가 0이라 아직 못 쓴다 (TFT식 마나 전환)', () => {
    const hero = new Hero();
    expect(hero.skillReady).toBe(false);
    hero.gainMana(hero.manaMax);
    expect(hero.skillReady).toBe(true);
  });

  test('리롤은 반드시 바뀐다 — 돈을 냈는데 그대로면 선택이 아니라 도박이다', () => {
    const rand = lcg(3);
    for (const id of K.SKILL_IDS) {
      for (let i = 0; i < 40; i++) expect(K.rerollSkillId(id, rand)).not.toBe(id);
    }
  });

  test('리롤 결과는 성향까지 갈린다 — 잡몹 스킬만 나오면 답이 하나뿐이다', () => {
    const rand = lcg(5);
    const roles = new Set<K.SkillRole>();
    for (let i = 0; i < 200; i++) roles.add(K.SKILLS[K.rerollSkillId('smite', rand)].role);
    expect(roles).toEqual(new Set(['boss', 'mob', 'utility']));
  });

  test('모든 스킬에 성향이 있다', () => {
    for (const id of K.SKILL_IDS) {
      expect(['boss', 'mob', 'utility']).toContain(K.SKILLS[id].role);
    }
  });

  test('스킬 획득 증강은 사라졌다 — 드래프트가 스킬을 주지 않는다', () => {
    for (const id of K.SKILL_IDS) {
      expect(AUGMENTS.some((a) => a.id === `skill_${id}`)).toBe(false);
    }
    // 남은 skill_* 증강은 전부 개조다 — 효과나 skillMod를 갖는다
    for (const a of AUGMENTS.filter((x) => x.kind === 'skill')) {
      expect(a.skillMod !== undefined || Object.keys(a.effect).length > 0).toBe(true);
    }
  });
});

describe('스킬 리롤 — 운을 자원으로 교정한다 (2026-07-20)', () => {
  /** 리롤은 제대로된 스킬을 든 뒤에만 열린다 — 시작 장비 상태를 벗겨 둔다 */
  const game = () => {
    const g = new Game(lcg(9));
    g.hero.skillId = 'volley';
    return g;
  };

  // 첫 회 무료 폐지 (2026-07-20, 사용자 지시) — Lv9 스킬 전용 드래프트가 구제책을
  // 이미 하나 주므로, 무료 리롤까지 있으면 R1에 무조건 굴리는 정답 수순이 된다.
  test('시작 장비를 든 동안에는 못 굴린다 — 첫 스킬은 Lv9 드래프트가 준다', () => {
    const g = new Game(lcg(9));
    g.mineral = 1e6;
    expect(K.isStarterSkill(g.hero.skillId)).toBe(true);
    expect(g.canRerollSkill).toBe(false);
    expect(g.rerollSkill()).toBe(false);
    expect(g.hero.skillId).toBe(K.STARTER_SKILL);
  });

  test('첫 회부터 값을 낸다 — 무료 리롤은 없다', () => {
    const g = game();
    expect(B.SKILL_REROLL_FREE_COUNT).toBe(0);
    expect(g.skillRerollCost).toBeGreaterThan(0);

    g.mineral = g.skillRerollCost - 1;
    expect(g.canRerollSkill).toBe(false); // 돈이 없으면 첫 회도 못 굴린다

    const before = g.hero.skillId;
    const cost = g.skillRerollCost;
    g.mineral = cost;
    expect(g.rerollSkill()).toBe(true);
    expect(g.hero.skillId).not.toBe(before);
    expect(g.mineral).toBe(0);
  });

  test('값은 라운드가 정한다 — 사용 횟수가 아니다', () => {
    const g = game();
    g.round = 20;

    const cost = g.skillRerollCost;
    expect(cost).toBe(B.SKILL_REROLL_BASE + B.SKILL_REROLL_PER_ROUND * 20);
    // 사용 횟수가 아니라 라운드에 걸린다 — "운 나쁠수록 비싸진다" 역설을 피한다
    g.round = 40;
    expect(g.skillRerollCost).toBeGreaterThan(cost);

    g.round = 20;
    g.mineral = cost;
    expect(g.rerollSkill()).toBe(true);
    expect(g.mineral).toBe(0);
  });

  test('금화가 모자라면 못 굴린다', () => {
    const g = game();
    g.round = 10;
    g.mineral = g.skillRerollCost - 1;

    const before = g.hero.skillId;
    expect(g.canRerollSkill).toBe(false);
    expect(g.rerollSkill()).toBe(false);
    expect(g.hero.skillId).toBe(before);
  });

  test('라운드당 1회 — 금화만 있으면 연타해서 원하는 스킬을 낚는 걸 막는다', () => {
    const g = game();
    g.mineral = 1e6;
    expect(g.rerollSkill()).toBe(true);
    expect(g.canRerollSkill).toBe(false);
    expect(g.rerollSkill()).toBe(false);

    g.round += 1; // 라운드가 넘어가면 다시 열린다
    expect(g.canRerollSkill).toBe(true);
  });

  test('넘치는 마나는 버린다 — 리롤이 곧 즉시 시전이 되면 안 된다', () => {
    const g = game();
    g.hero.skillId = 'execution'; // 필요 마나 420 — 풀에서 가장 비싸다
    g.hero.mana = g.hero.manaMax;
    g.mineral = 1e6;

    expect(g.rerollSkill()).toBe(true);
    expect(g.hero.mana).toBeLessThanOrEqual(g.hero.manaMax);
  });

  test('빔이 나가는 중에는 못 바꾼다 — 빔은 시전 시점 스킬을 들고 돈다', () => {
    const g = game();
    g.hero.skillId = 'laser';
    g.mineral = 1e6;
    g.enemies.push(mob(g.hero.distance + 40), mob(g.hero.distance + 60));
    castNow(g);
    expect(g.beam).not.toBeNull();

    expect(g.canRerollSkill).toBe(false);
    expect(g.rerollSkill()).toBe(false);
    expect(g.hero.skillId).toBe('laser');
  });
});

describe('스킬 드래프트 — 처음으로 제대로된 스킬을 얻는다 (2026-07-20)', () => {
  /** 드래프트 라운드까지 진행해 스킬 선택을 띄운다 */
  const atLevel9 = () => {
    const g = new Game(lcg(21));
    // 라운드만 밀어 올린다 — 밀린 증강 선택은 즉시 소화한다
    for (let r = 1; r <= H.SKILL_DRAFT_ROUND; r++) {
      g.round = r - 1;
      g.hero.pendingAugmentPicks = 0;
      if (H.grantsSkillDraft(r)) g.hero.pendingSkillDraft++;
      g.round = r;
    }
    g.update(0);
    return g;
  };

  test('후보는 전부 제대로된 스킬이고 서로 겹치지 않는다', () => {
    const g = atLevel9();
    expect(g.skillChoices).toHaveLength(H.SKILL_DRAFT_CHOICES);
    for (const id of g.skillChoices) expect(K.SKILL_IDS).toContain(id);
    expect(new Set(g.skillChoices).size).toBe(g.skillChoices.length);
  });

  test('드래프트 중에는 게임이 멈춘다 — 증강 선택과 같다', () => {
    expect(atLevel9().paused).toBe(true);
  });

  test('고르면 시작 장비를 벗는다', () => {
    const g = atLevel9();
    expect(g.hero.skillId).toBe(K.STARTER_SKILL);

    const picked = g.skillChoices[0];
    expect(g.chooseSkill(0)).toBe(true);
    expect(g.hero.skillId).toBe(picked);
    expect(K.isStarterSkill(g.hero.skillId)).toBe(false);
    expect(g.skillChoices).toHaveLength(0);
    expect(g.hero.pendingSkillDraft).toBe(0);
  });

  test('카드마다 리롤 1회씩 — 고른 한 장은 남고 나머지만 바뀐다', () => {
    const g = atLevel9();
    const before = [...g.skillChoices];

    expect(g.canRerollSkillChoice(0)).toBe(true);
    expect(g.rerollSkillChoice(0)).toBe(true);
    expect(g.skillChoices[0]).not.toBe(before[0]);
    expect(g.skillChoices[1]).toBe(before[1]);
    expect(g.skillChoices[2]).toBe(before[2]);
    expect(new Set(g.skillChoices).size).toBe(3); // 여전히 안 겹친다

    expect(g.canRerollSkillChoice(0)).toBe(false); // 같은 카드는 두 번 못 굴린다
    expect(g.rerollSkillChoice(0)).toBe(false);
    expect(g.canRerollSkillChoice(1)).toBe(true); // 다른 카드 몫은 남아 있다
  });

  test('스킬을 정한 뒤에 증강 선택이 온다 — 무엇에 답할지가 정해진 채로 고른다', () => {
    const g = atLevel9();
    g.hero.pendingAugmentPicks = 1; // 증강이 밀려 있는 상태를 만든다
    expect(g.augmentChoices).toHaveLength(0); // 스킬이 먼저다
    g.chooseSkill(0);
    expect(g.augmentChoices.length).toBeGreaterThan(0); // 그다음 증강
  });
});

describe('스킬 개조 — 전부 범용이다 (2026-07-21 강화 5축 재정리)', () => {
  // 특정 스킬 전용 개조(연사·회오리·대재앙·도발 인형·레이저·장판)는 삭제됐다 —
  // "유저가 스킬과 무관하게 알아서 고르는" 5축(피해/마나/투사체/범위/도트)만 남는다.
  test('스킬 개조 증강은 전부 아무 스킬에나 붙는다', () => {
    for (const a of AUGMENTS) {
      if (!a.skillMod) continue;
      expect(a.requiresSkill ?? 'any', `${a.id}는 특정 스킬 전용이다`).toBe('any');
      expect(a.requiresZone ?? false, `${a.id}는 장판 전용이다`).toBe(false);
    }
  });

  test("'any' 개조는 아무 스킬에나 붙는다 — 영웅은 항상 스킬을 든다", () => {
    const cdr = augment('skill_cdr');
    for (const id of K.SKILL_IDS) expect(H.skillGateAllows(cdr, id)).toBe(true);
  });

  test('실제 뽑기에서도 스킬 전용 카드가 나오지 않는다', () => {
    const hero = new Hero();
    hero.skillId = 'smite';
    const rand = lcg(7);
    for (let i = 0; i < 200; i++) {
      for (const c of rollAugmentChoices(hero, rand)) {
        if (!c.augment.skillMod) continue;
        expect(c.augment.requiresSkill).toBe('any');
        expect(c.augment.requiresZone ?? false).toBe(false);
      }
    }
  });
});

describe('스킬 개조 — 수치가 아니라 관계다', () => {
  test('집중 수련은 필요 마나를 줄이되 바닥이 있다', () => {
    const hero = new Hero();
    hero.skillId = 'volley';
    const base = hero.skill!.manaMax;

    hero.addAugment(card('skill_cdr'));
    expect(hero.skill!.manaMax).toBeCloseTo(base * 0.85, 5);

    // 아무리 쌓아도 바닥 밑으로는 안 내려간다 (스킬이 상시 발동이 되면 안 된다)
    for (let i = 0; i < 10; i++) hero.addAugment(card('skill_cdr'));
    expect(hero.skill!.manaMax).toBeGreaterThanOrEqual(base * K.MANA_MAX_FLOOR - 0.001);
    expect(hero.skill!.manaMax).toBeGreaterThanOrEqual(10);
  });

  test('증폭은 스킬 피해를 곱한다', () => {
    const hero = new Hero();
    hero.skillId = 'meteor';
    const base = hero.skill!.damageMult;

    hero.addAugment(card('skill_amp'));
    expect(hero.skill!.damageMult).toBeCloseTo(base * 1.45, 5);
  });

  test('다중 투사는 대상 수를 늘린다', () => {
    const hero = new Hero();
    hero.skillId = 'volley';
    expect(hero.skill!.targets).toBe(K.SKILLS.volley.targets);

    hero.addAugment(card('skill_barrage'));
    expect(hero.skill!.targets).toBe(K.SKILLS.volley.targets + 2);
  });

  // 폭발 화살 → 폭발 (2026-07-18, 사용자 지시) — 스킬 전용 skillMod가 아니라
  // 스킬 유무와 무관한 HeroStats 필드(explosionRadius)로 옮겨갔다. 평타에도 걸린다.
  test('폭발은 스킬 없이도 붙고, 스킬 피해에 -30% 대가가 있다', () => {
    const hero = new Hero();
    expect(hero.stats.explosionRadius).toBe(0);

    hero.addAugment(card('explosion'));
    expect(hero.stats.explosionRadius).toBeGreaterThan(0);
    expect(hero.stats.skillDamageMult).toBeCloseTo(0.7, 5);
  });

  test('일제 사격은 레벨을 타고 대상이 늘어난다 (Lv1 기준치, targetsLevelStep마다 +1)', () => {
    const hero = new Hero();
    hero.skillId = 'volley';
    expect(hero.skill!.targets).toBe(K.SKILLS.volley.targets);

    hero.level = 1 + K.SKILLS.volley.targetsLevelStep!;
    expect(hero.skill!.targets).toBe(K.SKILLS.volley.targets + 1);
  });

  test('파장은 반경형 스킬의 반경을 늘린다 (범위 축 통합 카드)', () => {
    const hero = new Hero();
    hero.skillId = 'whirlwind';
    const base = hero.skill!.radius;

    hero.addAugment(card('skill_radius'));
    expect(hero.skill!.radius).toBe(base + 25);
  });

  test('파장은 레이저 길이도 늘린다 — 한 카드가 스킬 형태에 맞는 범위로 먹힌다', () => {
    const hero = new Hero();
    hero.skillId = 'laser';
    const base = hero.skill!.beamLength;

    hero.addAugment(card('skill_radius'));
    expect(hero.skill!.beamLength).toBe(base + 60);
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
  test('기본 스킬은 마나가 차기 전엔 못 쓴다 — 차면 적이 없어도 시전은 성립한다', () => {
    const game = new Game();
    expect(game.canUseSkill).toBe(false); // 마나 0
    expect(castNow(game)).toBe(true); // 6차: 기본 스킬 강타 보유 — 마나만 차면 쓸 수 있다
  });

  test('쓰면 마나가 비고, 평타로 다시 찬다 (TFT식)', () => {
    const game = new Game();
    game.hero.skillId = 'whirlwind';
    game.hero.mana = game.hero.manaMax; // 가득 채워 시전 가능 상태로
    game.enemies.push(mob(game.hero.distance));

    expect(castNow(game)).toBe(true);
    expect(game.hero.mana).toBe(0); // 시전하면 마나가 빈다
    expect(game.canUseSkill).toBe(false);

    // 평타를 치면 마나가 다시 찬다 — 공속이 곧 스킬 회전이다.
    // `canUseSkill`로는 못 잰다: 마나가 차는 순간 자동 시전이 먼저 써버려서 항상 false로
    // 읽힌다. 차오르는 것 자체를 본다. (2026-07-20 공속 0.7/초 이후로는 채우는 데
    // 수십 초가 걸려 그 사이 웨이브가 돌면서 자동 시전이 끼어든다.)
    const before = game.hero.mana;
    for (let i = 0; i < 600; i++) game.update(1 / 60);
    expect(game.hero.mana).toBeGreaterThan(before);
  });

  test('죽어 있으면 못 쓴다', () => {
    const game = new Game();
    game.hero.skillId = 'whirlwind';
    game.hero.takeDamage(1e9);

    expect(game.canUseSkill).toBe(false);
    expect(castNow(game)).toBe(false);
  });

  test('소용돌이는 주변 적 전체를 때린다', () => {
    const game = new Game();
    game.hero.skillId = 'whirlwind';
    const d = game.hero.distance;

    game.enemies.push(mob(d - 20), mob(d + 20), mob(d + 500));
    const before = game.enemies.map((e) => e.hp);
    castNow(game);

    expect(game.enemies[0].hp).toBeLessThan(before[0]);
    expect(game.enemies[1].hp).toBeLessThan(before[1]);
    expect(game.enemies[2].hp).toBe(before[2]); // 사거리 밖
  });

  test('한파를 쥐면 소용돌이가 적을 늦춘다', () => {
    const game = new Game();
    game.round = 5; // 완전 템포(초반 슬로우 배제)에서 감속 지속시간 자체를 검증
    game.hero.skillId = 'whirlwind';
    game.hero.addAugment(card('skill_frostbite'));
    const enemy = mob(game.hero.distance - 20);
    game.enemies.push(enemy);

    castNow(game);
    expect(enemy.slowFactor).toBeLessThan(1);
    expect(enemy.slowTimer).toBeGreaterThan(0);

    // 시간이 지나면 풀린다
    game.update(enemy.slowTimer! + 0.1);
    expect(enemy.slowFactor).toBeUndefined();
  });

  test('일제 사격은 지정된 수만큼만 때린다', () => {
    const game = new Game();
    game.hero.skillId = 'volley';
    const d = game.hero.distance;
    for (let i = 0; i < 8; i++) game.enemies.push(mob(d + i * 2));

    castNow(game);
    const hit = game.enemies.filter((e) => e.hp < e.maxHp).length;
    expect(hit).toBe(game.hero.skill!.targets);
  });

  test('폭발은 맞은 적 주변까지 번진다 (스킬 전용이 아니다)', () => {
    const plain = new Game();
    plain.hero.skillId = 'volley';
    const explosive = new Game();
    explosive.hero.skillId = 'volley';
    explosive.hero.addAugment(card('explosion'));

    for (const game of [plain, explosive]) {
      const d = game.hero.distance;
      for (let i = 0; i < 10; i++) game.enemies.push(mob(d + i * 6));
      castNow(game);
    }

    const hitCount = (game: Game) => game.enemies.filter((e) => e.hp < e.maxHp).length;
    expect(hitCount(explosive)).toBeGreaterThan(hitCount(plain));
  });

  test('유성은 적이 가장 많이 몰린 곳에 떨어진다', () => {
    const game = new Game();
    game.hero.skillId = 'meteor';

    // 영웅 근처에 1기, 멀리 뭉친 곳에 5기
    const near = mob(game.hero.distance);
    const far = [0, 5, 10, 15, 20].map((o) => mob(700 + o));
    game.enemies.push(near, ...far);

    castNow(game);
    expect(far.every((e) => e.hp < e.maxHp)).toBe(true);
    expect(near.hp).toBe(near.maxHp);
  });

  test('적이 없으면 유성은 헛돌지 않는다', () => {
    const game = new Game();
    game.hero.skillId = 'meteor';
    expect(() => castNow(game)).not.toThrow();
  });
});

describe('허수아비 — 원거리 영웅의 탱커', () => {
  test('영웅 앞쪽(몹이 오는 쪽)에 선다', () => {
    const game = new Game();
    game.hero.skillId = 'decoy';
    castNow(game);

    expect(game.decoy).not.toBeNull();
    expect(game.decoy!.distance).toBeLessThan(game.hero.distance);
  });

  test('몹이 허수아비에 붙잡힌다', () => {
    const game = new Game();
    game.hero.skillId = 'decoy';
    castNow(game);

    const decoy = game.decoy!;
    const enemy = mob(decoy.distance - 30);
    game.enemies.push(enemy);
    game.update(0.3);

    expect(decoy.distance - enemy.distance).toBeGreaterThanOrEqual(H.ENEMY_TOUCH_RANGE - 1);
  });

  test('허수아비에 붙은 몹은 영웅을 때리지 않는다', () => {
    const game = new Game();
    game.hero.skillId = 'decoy';
    castNow(game);

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
    game.hero.skillId = 'decoy';
    castNow(game);
    game.decoy!.hp = H.enemyDamage(game.round);

    const enemy = mob(game.decoy!.distance, 1e9, 0);
    game.enemies.push(enemy);
    game.update(0.05);

    expect(game.decoy).toBeNull();
  });

  test('수명이 다하면 사라진다', () => {
    const game = new Game();
    game.round = 5;
    game.hero.skillId = 'decoy';
    castNow(game);

    game.update(K.DECOY_LIFETIME + 0.1);
    expect(game.decoy).toBeNull();
  });

  // 도발 인형(허수아비 전용 개조) 테스트는 2026-07-21 강화 5축 재정리로 삭제 —
  // 특정 스킬 전용 개조가 풀에서 사라졌다.

  test('허수아비가 없으면 몹은 그냥 흐른다', () => {
    const game = new Game();
    const enemy = mob(50);
    game.enemies.push(enemy);
    game.update(0.2);
    expect(enemy.distance).toBeGreaterThan(50);
  });
});

describe('자동 시전 — 플레이어는 무엇을 들지만 고른다', () => {
  /** 마나를 가득 채운다 (TFT식 — 스킬은 0마나로 시작한다) */
  const charged = (game: Game): Game => {
    game.hero.mana = game.hero.manaMax;
    return game;
  };

  test('마나가 차도 조건을 못 채우면 안 쏜다', () => {
    const game = new Game();
    game.hero.skillId = 'whirlwind'; // 최소 2기 필요
    charged(game);

    expect(game.canUseSkill).toBe(true);
    expect(game.shouldAutoCastSkill).toBe(false);

    game.enemies.push(mob(game.hero.distance, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(false); // 1기뿐

    game.enemies.push(mob(game.hero.distance + 10, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(true);
  });

  test('조건을 채우면 update가 알아서 쏜다', () => {
    const game = new Game();
    game.hero.skillId = 'whirlwind';
    charged(game);
    const a = mob(game.hero.distance, 1e9, 0);
    const b = mob(game.hero.distance + 10, 1e9, 0);
    game.enemies.push(a, b);

    game.update(0.016);

    expect(game.hero.mana).toBeLessThan(game.hero.manaMax); // 시전에 마나를 썼다
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  test('유성은 뭉쳤을 때만 떨어진다', () => {
    const game = new Game();
    game.hero.skillId = 'meteor'; // 최소 3기
    charged(game);

    game.enemies.push(mob(500, 1e9, 0), mob(900, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(false); // 흩어져 있다

    game.enemies.push(mob(505, 1e9, 0), mob(510, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(true); // 500 언저리에 3기
  });

  test('일제 사격은 한 기만 있어도 쏜다', () => {
    const game = new Game();
    game.hero.skillId = 'volley';
    charged(game);
    expect(game.shouldAutoCastSkill).toBe(false);

    game.enemies.push(mob(game.hero.distance + 20, 1e9, 0));
    expect(game.shouldAutoCastSkill).toBe(true);
  });

  test('허수아비는 이미 서 있으면 다시 안 세운다', () => {
    const game = new Game();
    game.hero.skillId = 'decoy';
    charged(game);
    game.enemies.push(mob(game.hero.distance - 40, 1e9, 0), mob(game.hero.distance - 60, 1e9, 0));

    expect(game.shouldAutoCastSkill).toBe(true);
    castNow(game);
    game.hero.mana = game.hero.manaMax;

    expect(game.decoy).not.toBeNull();
    expect(game.shouldAutoCastSkill).toBe(false);
  });

  test('허수아비는 뒤쪽 몹에는 반응하지 않는다 — 이미 지나간 몹이다', () => {
    const game = new Game();
    game.hero.skillId = 'decoy';
    charged(game);
    game.enemies.push(mob(game.hero.distance + 40, 1e9, 0), mob(game.hero.distance + 60, 1e9, 0));

    expect(game.shouldAutoCastSkill).toBe(false);
  });

  test('죽어 있으면 자동 시전도 없다', () => {
    const game = new Game();
    game.hero.skillId = 'whirlwind';
    charged(game);
    game.enemies.push(mob(game.hero.distance, 1e9, 0), mob(game.hero.distance + 5, 1e9, 0));
    game.hero.takeDamage(1e9);

    expect(game.shouldAutoCastSkill).toBe(false);
  });

  test('증강 선택 중에는 시전하지 않는다', () => {
    const game = new Game();
    game.hero.skillId = 'whirlwind';
    charged(game);
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
    game.hero.skillId = 'whirlwind';
    game.enemies.push({ ...mob(game.hero.distance, 1), hp: 1 });

    castNow(game);
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

describe('보스 조준 — 3기 가중 + 앞선 보스 우선 (2026-07-21, 사용자 지시)', () => {
  const boss = (distance: number): Enemy => ({
    kind: 'boss', name: 'B', maxHp: 1e9, hp: 1e9, armor: 0,
    speed: 0, radius: 14, distance, bossLevel: 1,
  });

  test('혼자 걷는 보스도 불화살 자동 시전 조건(2기)을 채운다 — 보스는 3기 취급', () => {
    const game = new Game();
    game.hero.skillId = 'firearrow';
    game.hero.mana = game.hero.manaMax;
    expect(game.shouldAutoCastSkill).toBe(false); // 적이 없으면 안 쏜다

    game.enemies.push(boss(game.hero.distance));
    expect(game.shouldAutoCastSkill).toBe(true); // 밀집도 1이지만 가중 3 ≥ 2
  });

  test('보스가 잡몹 무리보다 경로에서 앞서면 장판을 보스 위에 깐다', () => {
    const game = new Game();
    game.hero.skillId = 'firearrow';
    // 잡몹 5기 무리 (뒤쪽) + 앞서 걷는 보스
    for (let i = 0; i < 5; i++) game.enemies.push(mob(100));
    const leader = boss(400);
    game.enemies.push(leader);

    castNow(game);
    expect(game.zones).toHaveLength(1);
    expect(game.zones[0].distance).toBe(leader.distance);
  });

  test('보스가 무리 뒤에 있으면 낙점은 여전히 가장 뭉친 잡몹 무리다', () => {
    const game = new Game();
    game.hero.skillId = 'firearrow';
    for (let i = 0; i < 5; i++) game.enemies.push(mob(400));
    game.enemies.push(boss(100)); // 무리보다 뒤

    castNow(game);
    expect(game.zones[0].distance).toBe(400); // 가중 3 < 잡몹 5
  });
});

describe('강화 5축의 새 축 — 여파(도트) · 부식(방깎) (2026-07-21)', () => {
  test('여파는 스킬 명중 후 도트를 남기고, 시간이 지나면 꺼진다', () => {
    const game = new Game();
    game.hero.skillId = 'meteor';
    game.hero.addAugment(card('skill_dot'));
    // 주의: 이 파일의 mob()은 세 번째 인자가 속도다 — 기본 속도로 둔다
    const target = mob(game.hero.distance);
    game.enemies.push(target, mob(game.hero.distance), mob(game.hero.distance));

    castNow(game);
    expect(target.skillDotDps).toBeGreaterThan(0);
    expect(target.skillDotTimer).toBeGreaterThan(0);

    const afterCast = target.hp;
    game.update(0.2); // 도트만 타는 구간
    expect(target.hp).toBeLessThan(afterCast);

    // 만료 확인 — 살아 있는 영웅은 피격 마나로 자동 재시전해 도트를 갱신할 수 있으므로,
    // 영웅을 재우고 남은 시간을 줄여 짧은 프레임 안에서 꺼지는 것을 본다
    game.hero.takeDamage(1e9);
    target.skillDotTimer = 0.05;
    game.update(0.1);
    expect(target.skillDotDps).toBeUndefined();
  });

  test('부식은 스킬 명중마다 방어력을 깎는다 (스킬 쪽 방깎 — 평타 쪽은 맹독)', () => {
    const game = new Game();
    game.hero.skillId = 'meteor';
    game.hero.addAugment(card('skill_shred'));
    const target = { ...mob(game.hero.distance), armor: 50 };
    game.enemies.push(target, mob(game.hero.distance), mob(game.hero.distance));

    castNow(game);
    expect(target.armorShred).toBe(4);
  });

  test('스킬 카드를 쌓으면 특화(3장)·대특화(5장)가 순서대로 켜진다', () => {
    const three = ['skill_amp', 'skill_amp', 'skill_amp'].map((id) => card(id));
    const five = [...three, card('skill_cdr'), card('skill_cdr')];
    expect(H.activeSynergies(three)).toHaveLength(1); // 각성
    expect(H.activeSynergies(five)).toHaveLength(2); // 각성 + 초월 시전
  });
});
