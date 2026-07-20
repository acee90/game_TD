// 증강 강화 (2026-07-20) — 영웅 투자에 랜덤성을 얹는 축.
//
// 그전에는 영웅 투자가 XP 구매(예측 가능한 +1레벨)뿐이라 타워 뽑기와 나란히 놓으면
// 도파민에서 졌다. 강화는 **보유 증강의 등급을 올리되 후보 2장 중 하나를 고르게** 해서
// 운과 선택을 섞는다. 비용이 지수로 올라 풀강화는 사실상 불가능하다.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import { Game } from '../src/game/game';

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

const card = (id: string, rarity: H.Rarity = 'silver') =>
  H.makeCard(H.AUGMENTS.find((a) => a.id === id)!, rarity);

/** 강화 가능한 증강 넷을 든 게임 */
const withAugments = (seed = 5) => {
  const g = new Game(lcg(seed));
  for (const id of ['bulwark', 'plating', 'swift', 'greed']) g.hero.addAugment(card(id));
  g.mineral = 1e6;
  return g;
};

describe('증강 강화 — 등급을 한 칸 올린다', () => {
  test('후보는 보유 증강 중에서만, 서로 겹치지 않게 뜬다', () => {
    const g = withAugments();
    expect(g.offerAugmentUpgrade()).toBe(true);
    expect(g.upgradeChoices).toHaveLength(B.AUGMENT_UPGRADE_CHOICES);
    expect(new Set(g.upgradeChoices).size).toBe(g.upgradeChoices.length);
    for (const i of g.upgradeChoices) expect(g.hero.augments[i]).toBeDefined();
  });

  test('고르면 등급이 한 칸 오르고 효과가 커진다', () => {
    const g = withAugments();
    g.offerAugmentUpgrade();
    const target = g.upgradeChoices[0];
    const before = g.hero.augments[target];
    const beforeEffect = { ...before.effect };

    expect(g.chooseAugmentUpgrade(0)).toBe(true);
    const after = g.hero.augments[target];
    expect(after.rarity).toBe('gold');
    expect(after.augment.id).toBe(before.augment.id); // 같은 증강이 세진다
    // 효과 값이 실제로 커진다 (실버 ×1 → 골드 ×2)
    const key = Object.keys(beforeEffect)[0] as keyof typeof beforeEffect;
    expect(after.effect[key]).not.toBe(beforeEffect[key]);
  });

  test('후보를 띄우는 것만으로는 골드가 안 빠진다 — 취소할 수 있다', () => {
    const g = withAugments();
    const gold = g.mineral;
    g.offerAugmentUpgrade();
    expect(g.mineral).toBe(gold);

    g.cancelAugmentUpgrade();
    expect(g.upgradeChoices).toHaveLength(0);
    expect(g.mineral).toBe(gold);
    expect(g.augmentUpgrades).toBe(0);
  });

  test('비용은 지수로 오른다 — 전부 풀강화는 사실상 불가능하다', () => {
    const g = withAugments();
    const costs: number[] = [];
    for (let i = 0; i < 8; i++) {
      costs.push(g.augmentUpgradeCost);
      if (!g.offerAugmentUpgrade()) break;
      g.chooseAugmentUpgrade(0);
    }
    // 계속 비싸진다
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    // 증강 4장 × 2단계 = 8회가 구조적 상한 — "영웅 만능"의 안전판
    expect(g.hero.upgradableAugments).toHaveLength(0);
    expect(g.augmentUpgrades).toBe(8);
    // 8회 총액이 R45 수입 저점(5,458골드)을 크게 넘어야 '거의 불가능'이 성립한다
    expect(costs.reduce((a, b) => a + b, 0)).toBeGreaterThan(5458);
  });

  test('플래티넘은 천장이라 후보에 안 뜬다', () => {
    const g = new Game(lcg(3));
    g.hero.addAugment(card('bulwark', 'platinum'));
    g.mineral = 1e6;
    expect(g.hero.upgradableAugments).toHaveLength(0);
    expect(g.canOfferAugmentUpgrade).toBe(false);
    expect(g.offerAugmentUpgrade()).toBe(false);
  });

  test('등급이 효과를 안 키우는 증강은 후보에서 뺀다 — 헛돈을 막는다', () => {
    const g = new Game(lcg(3));
    g.hero.addAugment(card('skill_cdr')); // effect가 비어 있고 skillMod만 있다
    g.mineral = 1e6;
    expect(H.rarityScales(g.hero.augments[0].augment)).toBe(false);
    expect(g.hero.upgradableAugments).toHaveLength(0);
  });

  test('금화가 모자라면 후보가 안 뜬다', () => {
    const g = withAugments();
    g.mineral = g.augmentUpgradeCost - 1;
    expect(g.canOfferAugmentUpgrade).toBe(false);
    expect(g.offerAugmentUpgrade()).toBe(false);
  });

  test('강화 중에는 게임이 멈춘다 — 증강 선택과 같다', () => {
    const g = withAugments();
    g.offerAugmentUpgrade();
    expect(g.paused).toBe(true);
    g.cancelAugmentUpgrade();
    expect(g.paused).toBe(false);
  });
});

describe('무료 강화 — R45에 1회 (사용자 지시)', () => {
  test('R45에 도달하면 무료 강화가 선다', () => {
    const g = withAugments();
    expect(g.pendingFreeUpgrades).toBe(0);
    // beginRound는 private이라 테스트에서만 대괄호로 들어간다 (라운드 진입 트리거 확인)
    g.round = B.FREE_AUGMENT_UPGRADE_ROUND - 1;
    (g as unknown as { beginRound(): void })['beginRound']();
    expect(g.round).toBe(B.FREE_AUGMENT_UPGRADE_ROUND);
    expect(g.pendingFreeUpgrades).toBe(1);

    // 다른 라운드에서는 안 선다
    const other = withAugments();
    other.round = 20;
    (other as unknown as { beginRound(): void })['beginRound']();
    expect(other.pendingFreeUpgrades).toBe(0);
  });

  test('무료 강화는 골드를 안 쓰고 비용 카운터도 안 올린다', () => {
    const g = withAugments();
    g.pendingFreeUpgrades = 1;
    g.mineral = 0; // 돈이 없어도 쓸 수 있다

    expect(g.canOfferAugmentUpgrade).toBe(true);
    expect(g.offerAugmentUpgrade()).toBe(true);
    expect(g.upgradeIsFree).toBe(true);

    const costBefore = g.augmentUpgradeCost;
    expect(g.chooseAugmentUpgrade(0)).toBe(true);
    expect(g.mineral).toBe(0);
    expect(g.pendingFreeUpgrades).toBe(0);
    // 유료 강화 비용은 그대로 — 무료가 다음 값을 밀어올리지 않는다
    expect(g.augmentUpgradeCost).toBe(costBefore);
  });
});
