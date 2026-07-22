// ───────── 가스 경제 개편 — 싱크가 경쟁해야 선택이 된다 ─────────
// 가스: 종족 업그레이드 / 스킬 개조가 한 지갑을 두고 싸운다.
// 프로브: 지수 비용 — "몇 기까지 사는가"가 상황 의존적 결정이 되도록.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import { Game } from '../src/game/game';

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

// 무료 · 카드마다 1회 (2026-07-20, 사용자 지시) — 예전엔 3장을 통째로 다시 굴렸다.
describe('증강 리롤 — 무료, 카드마다 최대 1회', () => {
  function gameWithChoices(): Game {
    const game = new Game(() => 0.5);
    game.gas = 0; // 가스가 없어도 리롤은 된다 — 더 이상 가스를 안 쓴다
    game.hero.pendingAugmentPicks = 1;
    game.update(1 / 60); // offerAugmentIfPending
    expect(game.augmentChoices.length).toBeGreaterThan(0);
    return game;
  }

  test('리롤은 가스를 쓰지 않고 해당 카드만 다시 뽑는다', () => {
    const game = gameWithChoices();
    const before = [...game.augmentChoices];
    expect(game.rerollAugmentChoice(0)).toBe(true);
    expect(game.gas).toBe(0);
    expect(game.augmentChoices.length).toBeGreaterThan(0);
    expect(game.augmentChoices[0]).not.toBe(before[0]);
    expect(game.augmentChoices[1]).toBe(before[1]);
    expect(game.augmentChoices[2]).toBe(before[2]);
  });

  test('각 카드는 1회뿐이고 다른 카드는 별개로 다시 뽑을 수 있다', () => {
    const game = gameWithChoices();
    expect(game.canRerollAugmentChoice(0)).toBe(true);
    game.rerollAugmentChoice(0);
    expect(game.canRerollAugmentChoice(0)).toBe(false);
    expect(game.rerollAugmentChoice(0)).toBe(false); // 카드별 상한 1회
    expect(game.canRerollAugmentChoice(1)).toBe(true);
  });

  test('카드를 고르고 다음 선택지가 뜨면 리롤 횟수가 돌아온다', () => {
    const game = gameWithChoices();
    game.rerollAugmentChoice(0);
    game.hero.pendingAugmentPicks = 2; // 고르면 1이 소비되고 다음 선택이 이어진다
    game.chooseAugment(0);
    expect(game.rerollsUsed).toBe(0);
    expect(game.augmentChoiceRerolls).toEqual([0, 0, 0]);
    expect(game.canRerollAugmentChoice(0)).toBe(true);
  });
});

