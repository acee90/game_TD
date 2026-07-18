import type { Rand } from './merge';

export const RNG_ALGORITHM = 'mulberry32-v1' as const;

/** Web/Unity가 같은 명세로 구현하는 32-bit 결정적 PRNG. */
export function createSeededRand(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
