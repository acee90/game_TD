// ───────── 가스 경제 개편 — 싱크가 경쟁해야 선택이 된다 ─────────
// 가스: 종족 업그레이드 / 스킬 개조가 한 지갑을 두고 싸운다.
// 프로브: 지수 비용 — "몇 기까지 사는가"가 상황 의존적 결정이 되도록.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as H from '../src/data/hero';
import * as K from '../src/data/skills';
import { Game } from '../src/game/game';

const card = (id: string, r: H.Rarity = 'silver') =>
  H.makeCard(H.AUGMENTS.find((a) => a.id === id)!, r);

describe('프로브 — 선형 비용 (2026-07-19, 지수 → 선형)', () => {
  test('살수록 등차로 비싸진다 — 지수가 아니다', () => {
    expect(B.probeCost(0)).toBe(B.PROBE_MINERAL);
    expect(B.probeCost(1)).toBe(B.PROBE_MINERAL + B.PROBE_COST_STEP);
    // 선형: 간격이 일정하다
    expect(B.probeCost(8) - B.probeCost(7)).toBe(B.probeCost(2) - B.probeCost(1));
    // 마지막 광부(16기째)도 후반 수입으로 살 수 있는 값이어야 한다 — 지수 시절 봉인 방지
    expect(B.probeCost(B.PROBE_MAX - 1)).toBeLessThan(1000);
  });

  test('게임이 실제 비용을 차감한다', () => {
    const game = new Game(() => 0.5);
    game.mineral = 1000;
    game.buyProbe();
    expect(game.mineral).toBe(1000 - B.probeCost(0));
    game.buyProbe();
    expect(game.mineral).toBe(1000 - B.probeCost(0) - B.probeCost(1));
  });
});

// 무료 · 선택당 1회 (2026-07-18, 사용자 지시) — 예전엔 가스 소비 · 선택당 최대 2회였다.
describe('증강 리롤 — 무료, 선택당 최대 1회', () => {
  function gameWithChoices(): Game {
    const game = new Game(() => 0.5);
    game.gas = 0; // 가스가 없어도 리롤은 된다 — 더 이상 가스를 안 쓴다
    game.hero.pendingAugmentPicks = 1;
    game.update(1 / 60); // offerAugmentIfPending
    expect(game.augmentChoices.length).toBeGreaterThan(0);
    return game;
  }

  test('리롤은 가스를 쓰지 않고 선택지를 다시 뽑는다', () => {
    const game = gameWithChoices();
    expect(game.rerollAugments()).toBe(true);
    expect(game.gas).toBe(0);
    expect(game.augmentChoices.length).toBeGreaterThan(0);
  });

  test('한 선택당 1회뿐이다', () => {
    const game = gameWithChoices();
    expect(game.canReroll).toBe(true);
    game.rerollAugments();
    expect(game.canReroll).toBe(false);
    expect(game.rerollAugments()).toBe(false); // 상한 1회
  });

  test('카드를 고르고 다음 선택지가 뜨면 리롤 횟수가 돌아온다', () => {
    const game = gameWithChoices();
    game.rerollAugments();
    game.hero.pendingAugmentPicks = 2; // 고르면 1이 소비되고 다음 선택이 이어진다
    game.chooseAugment(0);
    expect(game.rerollsUsed).toBe(0);
    expect(game.canReroll).toBe(true);
  });
});

describe('가스 스킬 개조 — 업그레이드와 같은 지갑', () => {
  test('기본 스킬 덕에 시작부터 살 수 있다 (6차 — 죽은 버튼 해소)', () => {
    const game = new Game(() => 0.5);
    game.gas = 100;
    expect(game.canBuyGasSkill('damage')).toBe(true);
    expect(game.buyGasSkill('damage')).toBe(true);
  });

  test('피해 개조는 스킬 피해를 곱으로 키운다', () => {
    const game = new Game(() => 0.5);
    game.gas = 1000;
    game.hero.addAugment(card('skill_volley'));
    const before = game.hero.skill!.damageMult;
    game.buyGasSkill('damage');
    expect(game.hero.skill!.damageMult).toBeCloseTo(before * K.GAS_SKILL_DAMAGE_MULT, 5);
  });

  test('가스 개조는 필요 마나를 줄이되 바닥 밑으로는 못 간다', () => {
    const game = new Game(() => 0.5);
    game.gas = 100000;
    game.hero.addAugment(card('skill_volley'));
    const before = game.hero.skill!.manaMax;
    game.buyGasSkill('cdr');
    expect(game.hero.skill!.manaMax).toBeCloseTo(before * K.GAS_SKILL_CDR_MULT, 5);
    for (let i = 0; i < 60; i++) game.buyGasSkill('cdr');
    expect(game.hero.skill!.manaMax).toBeGreaterThanOrEqual(10);
  });

  test('비용은 지수로 오른다 — 무한 스케일링 방지', () => {
    expect(K.gasSkillCost(10)).toBeGreaterThan(K.gasSkillCost(0) * 15);
  });

  test('개조 가스는 업그레이드 가스와 같은 지갑에서 나간다', () => {
    const game = new Game(() => 0.5);
    game.gas = K.gasSkillCost(0); // 딱 개조 1회분
    game.hero.addAugment(card('skill_volley'));
    game.buyGasSkill('damage');
    expect(game.gas).toBe(0);
    expect(game.upgrade(0)).toBe(false); // 이제 업그레이드는 못 산다
  });
});
