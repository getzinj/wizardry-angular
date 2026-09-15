import { beforeEach, describe, expect, it } from 'vitest';

import { Zone, character, scenarioToc } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { rt } from '../runtime/runtime';
import { MILLISECONDS_PER_BLOCK_PAIR, MOTOR_SPIN_UP_MILLISECONDS, findfile, getrec, putrec, restdrive } from './diskio';
import { boot, clock, rosterOf, somebody } from './port-fixture';
import { Xgoto } from './wiz';
import { getkey, pause1, pause2 } from './wiz2';

/** Two characters whose records share one block pair, and one that does not. */
const FIRST: number = 0;
const NEIGHBOUR: number = 1;
const FAR_AWAY: number = 4;


describe('the time the drive took', (): void => {
  let scenario: ScenarioDisk;

  beforeEach((): void => {
    scenario = rosterOf(somebody('AMBER'), somebody('BAAL'));
    boot(scenario, Xgoto.xcastle);
    scenario.drive.reset();
  });

  // Pinned as durations, as wiz2.spec.ts does, because the length is what the player notices.

  it('spins up and reads one pair for a cold read of a record', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);

    expect(clock().requested).toEqual([ 650 ]);
  });

  it('asks the clock once per access', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);

    expect(clock().requested).toHaveLength(1);
  });

  it('asks nothing for a second record from the same pair', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    await getrec(Zone.character, NEIGHBOUR, character);

    expect(clock().requested).toEqual([ 650 ]);
  });

  it('asks for one pair, without a spin-up, for the next pair while the motor is running', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    await getrec(Zone.character, FAR_AWAY, character);

    expect(clock().requested[1]).toBe(150);
  });

  it('asks nothing for a write, which only dirties the pair', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    await putrec(Zone.character, FIRST, character, somebody('CAIN'));

    expect(clock().requested).toHaveLength(1);
  });

  it('pays for the write when the next read evicts the pair', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    await putrec(Zone.character, FIRST, character, somebody('CAIN'));
    await getrec(Zone.toc, 0, scenarioToc);

    expect(clock().requested[1]).toBe(2 * MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('spins up again after the drive has rested', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    restdrive();
    await getrec(Zone.character, FAR_AWAY, character);

    expect(clock().requested[1]).toBe(MOTOR_SPIN_UP_MILLISECONDS + MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('rests the drive while the game waits for a key', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);

    const waiting: Promise<string> = getkey();

    rt().keyboard.push('A');
    await waiting;
    await getrec(Zone.character, FAR_AWAY, character);

    expect(clock().requested[1]).toBe(MOTOR_SPIN_UP_MILLISECONDS + MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('keeps the motor running for a key that was typed ahead, there having been no wait', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    rt().keyboard.push('A');
    await getkey();
    await getrec(Zone.character, FAR_AWAY, character);

    expect(clock().requested[1]).toBe(MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('rests the drive through a PAUSE2, which outlasts the motor', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    await pause2();
    await getrec(Zone.character, FAR_AWAY, character);

    expect(clock().requested[2]).toBe(MOTOR_SPIN_UP_MILLISECONDS + MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('keeps the motor running through a PAUSE1 at its starting length, which does not', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    await pause1();
    await getrec(Zone.character, FAR_AWAY, character);

    expect(clock().requested[2]).toBe(MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('walks the directory for the messages file, which is a read', async (): Promise<void> => {
    await getrec(Zone.character, FIRST, character);
    await findfile();

    expect(clock().requested[1]).toBe(MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('says whether the messages file is there', async (): Promise<void> => {
    expect(await findfile()).toBe(true);
  });

  it('hands back the record it read', async (): Promise<void> => {
    const who: ICharacter = await getrec(Zone.character, NEIGHBOUR, character);

    expect(who.name).toBe('BAAL');
  });
});
