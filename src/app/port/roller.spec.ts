import { beforeEach, describe, expect, it } from 'vitest';

import { Zone, character } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { ESCAPE, RETURN, boot, press, rosterOf } from './port-fixture';
import { resetroller, roller } from './roller';
import { Tclass, Tstatus, Xgoto, g } from './wiz';

// Making a character is a disk write and nothing else: the roster is the scenario disk's character
// zone, and a free slot is a record whose status is LOST. These drive the real training grounds
// with the keys a player would press and then look at what landed on the disk.


/**
 * The keys that roll a fighter called FRODO. The bonus points are between seven and twenty and
 * there is no telling which from outside, so three scores are pushed as far as they will go: that
 * absorbs any amount the roll can produce, and the extra presses do nothing.
 */
function rollAFighter(name: string): string {
  const spendAll: string = [ '+'.repeat(10), RETURN, '+'.repeat(10), RETURN, '+'.repeat(10), RETURN ].join('');

  return [
    name, RETURN,        // NAME >
    'Y',                 // WANT TO CREATE IT (Y/N) ?
    RETURN, RETURN,      // password, twice, empty
    'A',                 // race: human
    'A',                 // alignment: good
    spendAll, ESCAPE,    // bonus points
    'A',                 // class: fighter
    'Y',                 // KEEP THIS CHARACTER (Y/N)?
    RETURN,              // NAME > nothing, which leaves for the castle
  ].join('');
}


describe('leaving the training grounds', (): void => {
  beforeEach((): void => {
    boot(rosterOf(), Xgoto.xtrainin);
    resetroller();
  });

  it('goes to the castle when the name is left blank', async (): Promise<void> => {
    press(RETURN);

    await roller();

    expect(g.xgoto).toBe(Xgoto.xcastle);
  });
});


describe('rolling a character', (): void => {
  let scenario: ScenarioDisk;

  beforeEach(async (): Promise<void> => {
    scenario = rosterOf();
    boot(scenario, Xgoto.xtrainin);
    resetroller();
    press(rollAFighter('FRODO'));
    await roller();
  });

  function rolled(): ICharacter {
    return scenario.read(Zone.character, 0, character);
  }

  it('writes them into the first free slot', (): void => {
    expect(rolled().name).toBe('FRODO');
  });

  it('gives them the class that was chosen', (): void => {
    expect(rolled().characterClass).toBe(Tclass.fighter);
  });

  it('leaves them alive', (): void => {
    expect(rolled().status).toBe(Tstatus.ok);
  });

  it('starts them at the first level', (): void => {
    expect(rolled().level).toBe(1);
  });

  it('never gives them fewer than two hit points', (): void => {
    expect(rolled().maximumHitPoints).toBeGreaterThanOrEqual(2);
  });

  it('starts them undamaged', (): void => {
    expect(rolled().hitPoints).toBe(rolled().maximumHitPoints);
  });

  it('spends every one of the bonus points', (): void => {
    const total: number = rolled().attributes.reduce((sum: number, score: number): number => sum + score, 0);

    // Human base scores are 8 8 5 8 8 9, and the roll hands out between seven and twenty more.
    expect(total).toBeGreaterThanOrEqual(46 + 7);
  });

  it('gives them some gold to start with', (): void => {
    expect(rolled().gold.low).toBeGreaterThanOrEqual(90);
  });

  it('makes them at least eighteen years old', (): void => {
    expect(rolled().age).toBeGreaterThanOrEqual(18 * 52);
  });

  it('marks the disk as needing to be saved', (): void => {
    expect(scenario.changed).toBe(true);
  });

  it('leaves for the castle afterwards', (): void => {
    expect(g.xgoto).toBe(Xgoto.xcastle);
  });
});


describe('a slot that held somebody before', (): void => {
  // A record is written whole, over a slot that was zeroed first, so nothing of the last occupant
  // survives - not even the bits no field claims.
  it('keeps none of the old occupant\'s spells', async (): Promise<void> => {
    const scenario: ScenarioDisk = rosterOf();
    const previous: ICharacter = scenario.read(Zone.character, 0, character);

    previous.spellsKnown = previous.spellsKnown.map((): number => 1);
    scenario.write(Zone.character, 0, character, previous);

    boot(scenario, Xgoto.xtrainin);
    resetroller();
    press(rollAFighter('FRODO'));
    await roller();

    expect(scenario.read(Zone.character, 0, character).spellsKnown).not.toContain(1);
  });
});
