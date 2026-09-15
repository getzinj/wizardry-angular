import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Clock, InstantClock } from './clock';


describe('waiting on the wall clock', (): void => {
  let settled: boolean;

  beforeEach((): void => {
    vi.useFakeTimers();
    settled = false;
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('has not returned before the time is up', async (): Promise<void> => {
    void new Clock().sleep(10).then((): void => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9);

    expect(settled).toBe(false);
  });

  it('returns once the time is up', async (): Promise<void> => {
    const done: Promise<void> = new Clock().sleep(10).then((): void => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    await done;

    expect(settled).toBe(true);
  });
});


describe('waiting on the instant clock', (): void => {
  it('returns on the next turn rather than waiting on a timer', async (): Promise<void> => {
    let settled: boolean = false;

    void new InstantClock().sleep(1000).then((): void => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(true);
  });

  it('remembers how long it was asked to wait', async (): Promise<void> => {
    const clock: InstantClock = new InstantClock();

    await clock.sleep(1000);

    expect(clock.requested).toEqual([ 1000 ]);
  });

  it('remembers every wait, in order', async (): Promise<void> => {
    const clock: InstantClock = new InstantClock();

    await clock.sleep(1);
    await clock.sleep(2);

    expect(clock.requested).toEqual([ 1, 2 ]);
  });
});
