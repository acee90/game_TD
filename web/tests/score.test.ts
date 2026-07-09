// 점수 규칙의 기준선.
// 원본에는 승리 조건도 라운드 상한도 없다(§9.6). 점수가 유일한 성적표다.

import { describe, expect, test } from 'vitest';
import * as B from '../src/data/balance';
import * as S from '../src/data/score';
import { PATH_LENGTH } from '../src/core/map';
import { Game } from '../src/game/game';

describe('무한 라운드 — 승리 조건이 없다', () => {
  test('라운드에 상한이 없다', () => {
    const game = new Game();
    game.round = 500;
    game.roundTimer = 0.001;
    game.update(0.002);

    expect(game.round).toBe(501);
    expect(game.over).toBe(false);
  });

  test('게임이 끝나는 유일한 조건은 라이프 0', () => {
    const game = new Game();
    expect(game.over).toBe(false);

    game.lives = 1;
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 10, hp: 10, armor: 0,
      speed: 0, radius: 8, distance: PATH_LENGTH,
    });
    game.update(0.016);

    expect(game.lives).toBe(0);
    expect(game.over).toBe(true);
  });
});

describe('점수 배점 — 후반이 압도적으로 크다', () => {
  test('라운드 점수는 지수로 자란다', () => {
    expect(S.roundScore(20) / S.roundScore(10)).toBeCloseTo(
      Math.pow(S.ROUND_SCORE_GROWTH, 10), 1);
    expect(S.roundScore(40)).toBeGreaterThan(S.roundScore(20) * 10);
  });

  test('R40 한 라운드가 R1~R10 전부보다 값지다', () => {
    let early = 0;
    for (let r = 1; r <= 10; r++) early += S.roundScore(r);
    expect(S.roundScore(40)).toBeGreaterThan(early);
  });

  test('보스는 레벨의 제곱으로 점수를 준다', () => {
    expect(S.bossScore(6) / S.bossScore(1)).toBe(36);
  });

  test('누출 감점은 라운드에 비례한다', () => {
    expect(S.leakPenalty(40)).toBeGreaterThan(S.leakPenalty(10) * 10);
  });
});

describe('점수 적립', () => {
  test('시작 점수는 0', () => {
    expect(new Game().score).toBe(0);
  });

  test('라운드를 넘기면 그 라운드 점수가 들어온다', () => {
    const game = new Game();
    game.update(B.OPENING_SECONDS + 0.01); // 라운드 1 시작 — 아직 클리어 아님
    expect(game.score).toBe(0);

    game.update(B.ROUND_SECONDS + 0.01); // 라운드 1 클리어
    expect(game.score).toBeGreaterThanOrEqual(S.roundScore(1));
  });

  test('잡몹 처치마다 점수가 붙는다', () => {
    const game = new Game();
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    game.update(0.016);

    expect(game.kills).toBe(1);
    expect(game.score).toBe(S.KILL_SCORE);
  });

  test('보스 처치는 레벨에 맞는 점수를 준다', () => {
    const game = new Game();
    game.summonBoss();
    game.enemies.find((e) => e.kind === 'boss')!.hp = 0;
    game.update(0.016);

    expect(game.bossCleared).toBe(1);
    expect(game.score).toBe(S.bossScore(1));
  });

  test('영웅 레벨업마다 점수가 붙는다', () => {
    const game = new Game();
    game.buildAltar();
    const before = game.score;

    // 잡몹 하나를 잡아 경험치를 준 뒤, 레벨업을 강제한다
    game.hero!.xp = game.hero!.xpNeeded;
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 1, hp: 0, armor: 0,
      speed: 0, radius: 8, distance: 10,
    });
    game.update(0.016);

    expect(game.hero!.level).toBeGreaterThan(1);
    expect(game.score).toBeGreaterThanOrEqual(before + S.HERO_LEVEL_SCORE);
  });

  test('몹을 놓치면 감점되고, 점수는 음수로 내려가지 않는다', () => {
    const game = new Game();
    game.round = 30;
    game.score = 10;
    game.enemies.push({
      kind: 'mob', name: 'x', maxHp: 10, hp: 10, armor: 0,
      speed: 0, radius: 8, distance: PATH_LENGTH,
    });
    game.update(0.016);

    expect(S.leakPenalty(30)).toBeGreaterThan(10);
    expect(game.score).toBe(0);
  });

  test('같은 GOD 유닛을 두 번 띄워도 보너스는 한 번뿐이다', () => {
    const game = new Game(() => 0); // 항상 풀의 첫 유닛
    game.mineral = 9999;

    // Lv1 16기 → 연쇄 조합 → GOD 1기
    for (let i = 0; i < 16; i++) game.spawnUnitAnywhere();
    const first = game.score;
    expect(first).toBeGreaterThanOrEqual(S.GOD_TOWER_SCORE);

    for (let i = 0; i < 16; i++) game.spawnUnitAnywhere();
    const second = game.score;

    // 두 번째 GOD은 같은 이름이라 보너스가 없다
    expect(second - first).toBeLessThan(S.GOD_TOWER_SCORE);
  });
});
