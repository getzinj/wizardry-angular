import { describe, expect, it } from 'vitest';

import type { IDriveActivity } from './block-cache-model';
import { BlockCacheModel, NO_ACTIVITY } from './block-cache-model';

const TOC_PAIR: number = 0;
const CHARACTER_PAIR: number = 30;
const NEXT_CHARACTER_PAIR: number = 32;


describe('reading with the motor off', (): void => {
  it('spins the drive up', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    expect(cache.access(TOC_PAIR, false).spinUp).toBe(true);
  });

  it('reads the pair in', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    expect(cache.access(TOC_PAIR, false).read).toBe(true);
  });

  it('has nothing to write out', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    expect(cache.access(TOC_PAIR, false).wrote).toBe(false);
  });
});


describe('reading a record from the pair already in the buffer', (): void => {
  function warm(): BlockCacheModel {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(CHARACTER_PAIR, false);

    return cache;
  }

  it('moves nothing', (): void => {
    expect(warm().access(CHARACTER_PAIR, false)).toEqual(NO_ACTIVITY);
  });

  it('moves nothing when writing to it either', (): void => {
    expect(warm().access(CHARACTER_PAIR, true)).toEqual(NO_ACTIVITY);
  });
});


describe('reading another pair once the motor is running', (): void => {
  it('does not spin up again', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(TOC_PAIR, false);

    expect(cache.access(CHARACTER_PAIR, false).spinUp).toBe(false);
  });

  it('reads the new pair in', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(TOC_PAIR, false);

    expect(cache.access(CHARACTER_PAIR, false).read).toBe(true);
  });
});


describe('leaving a written pair for another', (): void => {
  function dirtied(): BlockCacheModel {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(CHARACTER_PAIR, true);

    return cache;
  }

  it('writes the dirty pair out first', (): void => {
    expect(dirtied().access(NEXT_CHARACTER_PAIR, false).wrote).toBe(true);
  });

  it('reads the new pair in as well', (): void => {
    expect(dirtied().access(NEXT_CHARACTER_PAIR, false).read).toBe(true);
  });

  it('writes it out only once', (): void => {
    const cache: BlockCacheModel = dirtied();

    cache.access(NEXT_CHARACTER_PAIR, false);

    expect(cache.access(TOC_PAIR, false).wrote).toBe(false);
  });
});


describe('resting the drive', (): void => {
  it('makes the next transfer spin up again', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(TOC_PAIR, false);
    cache.rest();

    expect(cache.access(CHARACTER_PAIR, false).spinUp).toBe(true);
  });

  it('costs nothing when the next read is from the pair still in the buffer', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(TOC_PAIR, false);
    cache.rest();

    expect(cache.access(TOC_PAIR, false)).toEqual(NO_ACTIVITY);
  });
});


describe('a raw read into the buffer', (): void => {
  it('reads a block', (): void => {
    expect(new BlockCacheModel().rawRead().read).toBe(true);
  });

  it('loses a dirty pair rather than writing it, having gone past the bookkeeping', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(CHARACTER_PAIR, true);

    expect(cache.rawRead().wrote).toBe(false);
  });

  it('leaves nothing dirty behind it', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(CHARACTER_PAIR, true);
    cache.rawRead();

    expect(cache.access(TOC_PAIR, false).wrote).toBe(false);
  });

  it('leaves the buffer holding no pair, so the next record read comes off the disk', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(CHARACTER_PAIR, false);
    cache.rawRead();

    expect(cache.access(CHARACTER_PAIR, false).read).toBe(true);
  });
});


describe('INITGAME resetting the cache', (): void => {
  it('loses a dirty pair without writing it', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(CHARACTER_PAIR, true);
    cache.reset();

    const activity: IDriveActivity = cache.access(TOC_PAIR, false);

    expect(activity.wrote).toBe(false);
  });

  it('forgets which pair was in the buffer', (): void => {
    const cache: BlockCacheModel = new BlockCacheModel();

    cache.access(CHARACTER_PAIR, false);
    cache.reset();

    expect(cache.access(CHARACTER_PAIR, false).read).toBe(true);
  });
});
