import type { BuildInfo, RunContext } from '../game/logging';
import { RNG_ALGORITHM } from '../game/random';

export const BUILD_INFO: BuildInfo = __GAME_BUILD_INFO__;

export function createBrowserSeed(): number {
  const words = new Uint32Array(1);
  crypto.getRandomValues(words);
  return words[0];
}

export function createBrowserRunContext(seed: number): RunContext {
  return {
    runId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    build: BUILD_INFO,
    seed: seed >>> 0,
    rngAlgorithm: RNG_ALGORITHM,
  };
}
