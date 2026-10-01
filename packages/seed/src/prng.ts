// Seeded pseudo-random numbers for the seed world. No Math.random, no clock: the same label
// always yields the same sequence, so the world is identical on every run and in every browser.

import { hash32 } from '@regatta-ops/domain';

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: a tiny, well-distributed 32-bit generator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A generator seeded from a label. Separate labels give independent streams, so changing how
 * one part of the world draws numbers does not reshuffle every other part.
 * The `srt-seed:` prefix is from the app's first name; it stays so the seed world stays the same.
 */
export function rng(label: string): Rng {
  const next = mulberry32(parseInt(hash32(`srt-seed:${label}`), 16));
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from an empty list');
      return items[int(0, items.length - 1)]!;
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
