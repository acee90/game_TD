import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import type { BuildInfo } from '../src/game/logging';
import { createSeededRand, RNG_ALGORITHM } from '../src/game/random';
import {
  IndexedDbRunStore,
  listRunSummaries,
  loadRunEvents,
  loadRunSummary,
} from '../src/logging/indexed-db-run-store';

const BUILD: BuildInfo = {
  gitSha: 'indexed-db-test',
  branch: 'test',
  builtAt: '2026-07-18T00:00:00.000Z',
  target: 'web',
  appVersion: 'test',
  engineVersion: 'vitest',
  dirty: false,
};

describe('IndexedDbRunStore', () => {
  it('이벤트 순서와 summary를 reload 가능한 형태로 저장한다', async () => {
    const runId = `idb-${crypto.randomUUID()}`;
    const store = new IndexedDbRunStore();
    const game = new Game(createSeededRand(42), {
      sink: store,
      context: {
        runId,
        startedAt: '2026-07-18T00:00:00.000Z',
        build: BUILD,
        seed: 42,
        rngAlgorithm: RNG_ALGORITHM,
      },
    });
    const empty = game.slots.find((slot) => slot !== game.altarSlot)!;
    game.spawnUnit(empty);
    game.finishRun('test');
    await store.flush();

    const events = await loadRunEvents(runId);
    expect(events.map((event) => event.type)).toEqual([
      'run_started',
      'tower_spawned',
      'run_finished',
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect((await loadRunSummary(runId))?.lastSeq).toBe(3);
    expect((await listRunSummaries()).some((summary) => summary.runId === runId)).toBe(true);
  });
});
