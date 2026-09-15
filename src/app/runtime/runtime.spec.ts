import { beforeEach, describe, expect, it } from 'vitest';

import { Clock, InstantClock } from './clock';
import { createRuntime, disk, rt, setRuntime } from './runtime';


describe('reaching the running machine', (): void => {
  beforeEach((): void => {
    setRuntime(null);
  });

  it('refuses to hand out a machine that has not been started', (): void => {
    expect((): unknown => rt()).toThrow(/no runtime/);
  });

  it('hands out the machine that was started', (): void => {
    const runtime: ReturnType<typeof createRuntime> = createRuntime();

    setRuntime(runtime);

    expect(rt()).toBe(runtime);
  });

  it('starts on the text screen', (): void => {
    setRuntime(createRuntime());

    expect(rt().display.mode).toBe('text');
  });

  it('gives the same numbers again for the same seed', (): void => {
    setRuntime(createRuntime(null, 7));

    const first: number = rt().random.next();

    setRuntime(createRuntime(null, 7));

    expect(rt().random.next()).toBe(first);
  });

  it('refuses to read a disk when none is mounted', (): void => {
    setRuntime(createRuntime());

    expect((): unknown => disk()).toThrow(/no scenario disk/);
  });

  it('waits on the wall clock unless told otherwise', (): void => {
    setRuntime(createRuntime());

    expect(rt().clock).toBeInstanceOf(Clock);
  });

  it('waits on the clock it was given', (): void => {
    const clock: InstantClock = new InstantClock();

    setRuntime(createRuntime(null, 1, undefined, clock));

    expect(rt().clock).toBe(clock);
  });
});
