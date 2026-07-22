import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import type { Race, Tag } from '../src/data/units';
import { range, splashRadius } from '../src/game/combat';
import type { Tower } from '../src/game/types';

const tower = (race: Race, tags: readonly Tag[] = ['splash']): Tower => ({
  def: { id: 'test-tower', name: '테스트 타워', race, tags },
  tier: 2,
  cooldown: 0,
});

describe('2026-07-22 국소 밸런스 조정', () => {
  test('보스 체력 -5%는 Lv3~8에만 적용된다', () => {
    const full = (level: number): number => {
      const capped = Math.min(level, B.BOSS_HP_TOP_FROM);
      const base = B.BOSS_HP_BASE * Math.pow(B.BOSS_HP_GROWTH, capped - 1);
      const hp = level <= B.BOSS_HP_TOP_FROM
        ? base
        : base * Math.pow(B.BOSS_HP_TOP_GROWTH, level - B.BOSS_HP_TOP_FROM);
      return hp * (level <= B.BOSS_LOW_LEVEL_UNTIL ? B.BOSS_LOW_LEVEL_HP_CUT : 1);
    };

    expect(B.bossHP(2)).toBeCloseTo(full(2));
    expect(B.bossHP(3)).toBeCloseTo(full(3) * 0.95);
    expect(B.bossHP(8)).toBeCloseTo(full(8) * 0.95);
    expect(B.bossHP(9)).toBeCloseTo(full(9));
  });

  test('정규군 타워는 같은 티어·태그의 다른 병과보다 사거리가 15% 길다', () => {
    expect(range(tower(0))).toBeCloseTo(range(tower(1)) * 1.15);
  });

  test('마법대 스플래시 반경은 같은 사거리의 다른 병과보다 50% 작다', () => {
    const reach = 100;
    expect(splashRadius(tower(2), reach)).toBeCloseTo(splashRadius(tower(1), reach) * 0.5);
  });
});
