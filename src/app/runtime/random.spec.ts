import { describe, expect, it } from 'vitest';

import { RANDOM_MAXIMUM, Random } from './random';


describe('Random', (): void => {
  it('stays within the fifteen bits the original returns', (): void => {
    const random: Random = new Random(12345);
    let highest: number = 0;

    for (let draw: number = 0; draw < 5000; draw++) {
      highest = Math.max(highest, random.next());
    }

    expect(highest).toBeLessThanOrEqual(RANDOM_MAXIMUM);
  });

  it('never returns a negative number', (): void => {
    const random: Random = new Random(7);
    let lowest: number = RANDOM_MAXIMUM;

    for (let draw: number = 0; draw < 5000; draw++) {
      lowest = Math.min(lowest, random.next());
    }

    expect(lowest).toBeGreaterThanOrEqual(0);
  });

  it('produces the sequence the original produces', (): void => {
    // Taken from a transliteration of the assembly, not from this class. The generator's whole
    // sequence turns on which side of the shift its feedback bit is read from, so a pinned
    // sequence is the only thing that catches getting it the wrong way round.
    const random: Random = new Random(1);

    expect(Array.from({ length: 6 }, (): number => random.next()))
      .toEqual([16384, 16384, 16416, 16416, 18464, 16416]);
  });

  it('repeats its sequence for a given seed', (): void => {
    const first: Random = new Random(99);
    const second: Random = new Random(99);

    expect(first.next()).toBe(second.next());
  });

  it('gives different sequences for different seeds', (): void => {
    const first: Random = new Random(1);
    const second: Random = new Random(2);

    expect(first.next()).not.toBe(second.next());
  });

  it('is perturbed by stirring, as waiting for a keypress did', (): void => {
    const unstirred: Random = new Random(5);
    const stirred: Random = new Random(5);

    stirred.stir(3);

    expect(stirred.next()).not.toBe(unstirred.next());
  });

  it('comes full circle after a stir of 256, since only one byte of it moves', (): void => {
    // The routine that stirred the generator meant to carry into its other bytes and missed them,
    // reaching bytes nothing read. Reproducing that means the first byte alone moves, so stirring
    // it right round leaves the sequence exactly where it was.
    const unstirred: Random = new Random(5);
    const stirred: Random = new Random(5);

    stirred.stir(256);

    expect(stirred.next()).toBe(unstirred.next());
  });

  it('spreads draws across the range rather than favouring one end', (): void => {
    const random: Random = new Random(4242);
    const buckets: number[] = [0, 0, 0, 0];

    for (let draw: number = 0; draw < 4000; draw++) {
      buckets[Math.floor(random.next() / 8192)]++;
    }

    expect(Math.min(...buckets)).toBeGreaterThan(500);
  });
});
