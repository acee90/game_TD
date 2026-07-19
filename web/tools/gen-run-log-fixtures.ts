// Web 대표 런 fixture를 실제 Game으로 생성한다. 이벤트 의미가 바뀌면 이 스크립트와 테스트가 함께 실패한다.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/game/game';
import { MemoryGameEventSink, type GameLoggingSession } from '../src/game/logging';
import { createSeededRand, RNG_ALGORITHM } from '../src/game/random';

const seed = 12345;
const sink = new MemoryGameEventSink();
const logging: GameLoggingSession = {
  sink,
  context: {
    runId: 'fixture-web-v1',
    startedAt: '2026-07-18T00:00:00.000Z',
    build: {
      gitSha: 'web-fixture',
      branch: 'fixture',
      builtAt: '2026-07-18T00:00:00.000Z',
      target: 'web',
      appVersion: '0.1.0',
      engineVersion: 'vite-6',
      dirty: false,
    },
    seed,
    rngAlgorithm: RNG_ALGORITHM,
  },
};
const game = new Game(createSeededRand(seed), logging);
const slot = game.slots.find((candidate) => candidate !== game.altarSlot);
if (!slot || !game.spawnUnit(slot) || !game.summonBoss(1) || !game.buyXp() || !game.upgrade(0)) {
  throw new Error('대표 런 시나리오를 생성하지 못했습니다. 초기 경제 또는 액션 전제의 변경을 확인하세요.');
}
game.finishRun('test');

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../tests/fixtures/game-logs/web-v1.jsonl');
writeFileSync(output, sink.toJsonl());
console.log(output);
