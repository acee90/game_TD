import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import {
  MemoryGameEventSink,
  type BuildInfo,
  type GameLoggingSession,
} from '../src/game/logging';
import { createSeededRand, RNG_ALGORITHM } from '../src/game/random';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const schema = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'schemas/game-run-log/v1.schema.json'), 'utf8'),
) as object;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const BUILD: BuildInfo = {
  gitSha: 'test',
  branch: 'test',
  builtAt: '2026-07-18T00:00:00.000Z',
  target: 'web',
  appVersion: 'test',
  engineVersion: 'vitest',
  dirty: false,
};

function loggedGame(seed = 123): { game: Game; sink: MemoryGameEventSink } {
  const sink = new MemoryGameEventSink();
  const logging: GameLoggingSession = {
    sink,
    context: {
      runId: `test-${seed}`,
      startedAt: '2026-07-18T00:00:00.000Z',
      build: BUILD,
      seed,
      rngAlgorithm: RNG_ALGORITHM,
    },
  };
  return { game: new Game(createSeededRand(seed), logging), sink };
}

describe('Web game run logging', () => {
  it('성공 이벤트만 순서대로 기록하고 schema를 만족한다', () => {
    const { game, sink } = loggedGame();

    expect(game.spawnUnit(game.altarSlot)).toBe(false);
    const empty = game.slots.find((slot) => slot !== game.altarSlot && !slot.tower)!;
    expect(game.spawnUnit(empty)).toBe(true);
    expect(game.summonBoss(1)).toBe(true);
    const summary = game.finishRun('test');

    expect(summary).not.toBeNull();
    expect(sink.events.map((event) => event.type)).toEqual([
      'run_started',
      'tower_spawned',
      'boss_summoned',
      'run_finished',
    ]);
    expect(sink.events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(sink.summary?.lastSeq).toBe(4);
    for (const event of sink.events) {
      expect(validate(event), JSON.stringify(validate.errors, null, 2)).toBe(true);
    }
  });

  it('finishRun은 멱등이고 pause 동안 게임 시간이 흐르지 않는다', () => {
    const { game, sink } = loggedGame();
    game.update(1);
    expect(game.elapsedSeconds).toBe(1);

    game.hero.pendingAugmentPicks = 1;
    game.update(0);
    expect(game.paused).toBe(true);
    const pausedAt = game.elapsedSeconds;
    game.update(5);
    expect(game.elapsedSeconds).toBe(pausedAt);

    expect(game.finishRun('test')).not.toBeNull();
    expect(game.finishRun('test')).toBeNull();
    expect(sink.events.filter((event) => event.type === 'run_finished')).toHaveLength(1);
  });

  it('같은 seed는 같은 타워 추첨 결과를 만든다', () => {
    const first = loggedGame(777);
    const second = loggedGame(777);
    const firstSlot = first.game.slots.find((slot) => slot !== first.game.altarSlot)!;
    const secondSlot = second.game.slots.find((slot) => slot !== second.game.altarSlot)!;

    first.game.spawnUnit(firstSlot);
    second.game.spawnUnit(secondSlot);

    expect(firstSlot.tower?.def.name).toBe(secondSlot.tower?.def.name);
    expect(first.sink.events[1]).toEqual(second.sink.events[1]);
  });
});
