// ───────── 전직 — Lv5에 길을 정한다 ─────────
// 게임은 타입 없이 시작하고(견습), 영웅 Lv5에 전직 선택이 뜬다.
// 정보가 0인 시작 선택 대신, 몹과 보스를 본 뒤의 맥락 있는 선택이다.

import { describe, expect, test } from 'vitest';
import { Game } from '../src/game/game';
import { Hero, computeStats } from '../src/game/hero';
import { CLASS_PICK_LEVEL, HERO_CLASSES } from '../src/data/hero-class';
import * as H from '../src/data/hero';

function levelTo(hero: Hero, level: number): void {
  while (hero.level < level) {
    hero.gainXp(hero.xpNeeded);
    hero.pendingAugmentPicks = 0;
  }
}

describe('전직', () => {
  test('게임은 타입 없이 시작한다 — 견습, 배수 전부 1', () => {
    const game = new Game(() => 0.5);
    expect(game.hero.classId).toBeNull();
    expect(game.pendingClassPick).toBe(false);

    const novice = computeStats(1, [], 0, null);
    expect(novice.maxHp).toBe(H.HERO_BASE_HP);
    expect(novice.damage).toBe(H.HERO_BASE_DAMAGE);
  });

  test('Lv5에 도달하면 전직 선택이 뜨고 시간이 멈춘다', () => {
    const game = new Game(() => 0.5);
    levelTo(game.hero, CLASS_PICK_LEVEL);

    expect(game.pendingClassPick).toBe(true);
    expect(game.paused).toBe(true);

    const round = game.round;
    for (let t = 0; t < 60 * 5; t++) game.update(1 / 60);
    expect(game.round).toBe(round); // 멈춰 있다
  });

  test('전직하면 배수가 붙고 선택은 다시 뜨지 않는다', () => {
    const game = new Game(() => 0.5);
    levelTo(game.hero, CLASS_PICK_LEVEL);

    expect(game.chooseClass('warrior')).toBe(true);
    expect(game.hero.classId).toBe('warrior');
    expect(game.paused).toBe(false);
    expect(game.hero.stats.maxHp).toBe(
      Math.round(computeStats(game.hero.level, [], 0, null).maxHp * HERO_CLASSES.warrior.hpMult),
    );

    expect(game.chooseClass('archer')).toBe(false); // 한 번 정하면 끝
    expect(game.hero.classId).toBe('warrior');
  });

  test('전직 시 체력이 최대치 증가분만큼 채워진다', () => {
    const hero = new Hero();
    levelTo(hero, CLASS_PICK_LEVEL);
    const before = hero.hp;
    hero.promote('warrior'); // 체력 ×1.35
    expect(hero.hp).toBeGreaterThan(before);
    expect(hero.hp).toBeLessThanOrEqual(hero.stats.maxHp);
  });

  test('생성자에 타입을 주면 전직을 건너뛴다 — 시뮬레이션·테스트용', () => {
    const game = new Game(() => 0.5, 'archer');
    levelTo(game.hero, CLASS_PICK_LEVEL);
    expect(game.pendingClassPick).toBe(false);
    expect(game.paused).toBe(false);
  });

  test('전직은 첫 증강(Lv9)보다 앞이다 — 증강 풀이 타입을 따르게', () => {
    expect(CLASS_PICK_LEVEL).toBeLessThan(H.AUGMENT_LEVELS[0]);
  });
});
