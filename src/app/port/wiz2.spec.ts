import { beforeEach, describe, expect, it } from 'vitest';

import { InstantClock } from '../runtime/clock';
import { createRuntime, rt, setRuntime } from '../runtime/runtime';
import { g, resetglobals } from './wiz';
import { MILLISECONDS_PER_LOOP, centstr, pause1, pause2 } from './wiz2';

/** TIMEDLAY as INITGAME sets it. */
const STARTING_DELAY: number = 2000;


describe('pausing as the original did, by running an empty loop', (): void => {
  let clock: InstantClock;

  beforeEach((): void => {
    clock = new InstantClock();
    setRuntime(createRuntime(null, 1, undefined, clock));
    resetglobals();
    g.timedlay = STARTING_DELAY;
  });

  // These are pinned as durations rather than as multiples of MILLISECONDS_PER_LOOP on purpose: a
  // test that recomputes the constant it is checking passes whatever the constant becomes, and the
  // length of a pause is the thing the player actually notices.

  it('holds a combat message for about eight tenths of a second', async (): Promise<void> => {
    await pause1();

    expect(clock.requested[0]).toBeCloseTo(800.4, 3);
  });

  it('waits once for one PAUSE1', async (): Promise<void> => {
    await pause1();

    expect(clock.requested).toHaveLength(1);
  });

  it('holds it for two seconds when T)ime has set TIMEDLAY to its longest', async (): Promise<void> => {
    g.timedlay = 5000;

    await pause1();

    expect(clock.requested[0]).toBeCloseTo(2000.4, 3);
  });

  it('holds a PAUSE2 message for about one and a fifth seconds', async (): Promise<void> => {
    await pause2();

    expect(clock.requested[0]).toBeCloseTo(1200.4, 3);
  });

  it('holds a PAUSE2 for that long whatever TIMEDLAY is', async (): Promise<void> => {
    g.timedlay = 1;

    await pause2();

    expect(clock.requested[0]).toBeCloseTo(1200.4, 3);
  });

  it('CENTSTR centres the text on the bottom row', async (): Promise<void> => {
    await centstr('HELLO');

    expect(rt().display.text.line(23).indexOf('HELLO')).toBe(18);
  });

  it('CENTSTR holds the text there for a PAUSE2', async (): Promise<void> => {
    await centstr('HELLO');

    expect(clock.requested).toEqual([ 3001 * MILLISECONDS_PER_LOOP ]);
  });

  it('paces itself off one calibrated constant', (): void => {
    expect(MILLISECONDS_PER_LOOP).toBe(0.4);
  });
});
