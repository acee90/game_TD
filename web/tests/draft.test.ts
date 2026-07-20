// ───────── 적응형 드래프트 — 특화는 강제가 아니라 관성 ─────────
// 영웅 타입(전직)은 없다. 이미 든 계열일수록 다음 선택지에 더 잘 뜬다.
// 첫 증강에 특화를 시작해도 되고, 범용을 집은 뒤 2번째부터 몰아도 된다.

import { describe, expect, test } from 'vitest';
import { Hero, augmentAllowed, rollAugmentChoices } from '../src/game/hero';
import * as H from '../src/data/hero';

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

const card = (id: string, rarity: H.Rarity = 'silver') =>
  H.makeCard(H.AUGMENTS.find((a) => a.id === id)!, rarity);

/** 계열별 출현 횟수를 센다 */
function offerCounts(hero: Hero, rolls: number, seed = 42): Map<H.AugmentKind, number> {
  const rand = lcg(seed);
  const counts = new Map<H.AugmentKind, number>();
  for (let i = 0; i < rolls; i++) {
    for (const c of rollAugmentChoices(hero, rand)) {
      counts.set(c.augment.kind, (counts.get(c.augment.kind) ?? 0) + 1);
    }
  }
  return counts;
}

describe('영웅 캐리 빌드 임시 차단 (2026-07-19, 사용자 지시)', () => {
  test('차단 명단의 증강은 어떤 드래프트에도 뜨지 않는다', () => {
    const rand = lcg(7);
    // 빈 손 영웅 + 여러 계열을 든 영웅 모두에서 확인
    const heroes = [new Hero(), new Hero()];
    heroes[1].addAugment(card('bulwark'));
    heroes[1].addAugment(card('provoke'));
    heroes[1].addAugment(card('burn'));
    for (const hero of heroes) {
      for (let i = 0; i < 200; i++) {
        for (const c of rollAugmentChoices(hero, rand)) {
          expect(H.HERO_CARRY_BLOCKLIST.has(c.augment.id)).toBe(false);
        }
      }
    }
  });

  test('차단은 드래프트만 막는다 — 데이터·효과는 그대로 산다 (임시 조치)', () => {
    for (const id of H.HERO_CARRY_BLOCKLIST) {
      expect(H.AUGMENTS.some((a) => a.id === id)).toBe(true);
    }
  });
});

describe('적응형 드래프트', () => {
  test('타입 제한이 없다 — 빈 손이면 모든 계열·모든 스킬이 뜰 수 있다', () => {
    const hero = new Hero();
    hero.skillId = 'smite'; // 장판도 전용 개조도 없는 스킬
    for (const augment of H.AUGMENTS) {
      if (augment.requiresSkill) continue; // 스킬 개조는 스킬을 들어야 뜬다
      if (augment.requiresZone) continue; // 장판 개조는 장판 스킬을 들어야 뜬다
      if (H.requiresSplash(augment)) continue; // 대폭발은 충격파(광역)를 들어야 뜬다
      expect(augmentAllowed(hero, augment)).toBe(true);
    }
  });

  test('한 계열을 들수록 그 계열이 더 자주 뜬다', () => {
    const empty = offerCounts(new Hero(), 400);

    const committed = new Hero();
    committed.addAugment(card('greed'));
    committed.addAugment(card('harvest'));
    const biased = offerCounts(committed, 400);

    const ratio = (m: Map<H.AugmentKind, number>) =>
      (m.get('econ') ?? 0) / [...m.values()].reduce((a, b) => a + b, 0);

    // 빈 손 대비 경제 비중이 뚜렷이 커야 한다 (가중치 1 → 1+0.9×2)
    expect(ratio(biased)).toBeGreaterThan(ratio(empty) * 1.5);
  });

  test('관성이지 강제가 아니다 — 몰아도 다른 계열이 계속 나온다', () => {
    const committed = new Hero();
    committed.addAugment(card('greed'));
    committed.addAugment(card('greed'));
    committed.addAugment(card('harvest'));
    const counts = offerCounts(committed, 400);

    const others = [...counts.entries()].filter(([k]) => k !== 'econ');
    expect(others.length).toBeGreaterThan(2); // 다른 계열도 실제로 뜬다
  });

  test('스킬 개조는 그 스킬을 든 영웅에게만 뜬다 (획득 카드는 2026-07-20에 사라졌다)', () => {
    const hero = new Hero();
    hero.skillId = 'volley';
    expect(augmentAllowed(hero, H.AUGMENTS.find((a) => a.id === 'multishot')!)).toBe(true);
    hero.skillId = 'meteor';
    expect(augmentAllowed(hero, H.AUGMENTS.find((a) => a.id === 'multishot')!)).toBe(false);
  });
});
