import { beforeEach, describe, expect, it } from 'vitest';

import { Zone, character } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { RETURN, boot, clock, play, rosterOf, somebody } from './port-fixture';
import { castle } from './castle2';
import { Xgoto, g } from './wiz';
import { MILLISECONDS_PER_LOOP, newlong } from './wiz2';

// Adding somebody to the party writes their roster record back with INMAZE set, which is what stops
// a second party taking the same character.


function addFrodo(): readonly string[] {
  return [
    'A',                                      // A)DD A MEMBER
    'F', 'R', 'O', 'D', 'O', RETURN,          // WHO WILL JOIN ?
    RETURN,                                   // ENTER PASSWORD, which is empty
    RETURN,                                   // leave the tavern
    'E',                                      // E)DGE OF TOWN, which leaves the castle
  ];
}


describe("adding somebody to the party at Gilgamesh's", (): void => {
  let scenario: ScenarioDisk;

  beforeEach(async (): Promise<void> => {
    scenario = rosterOf(somebody('FRODO'));
    boot(scenario, Xgoto.xgilgams);
    await play(castle, addFrodo());
  });

  it('puts them in the party', (): void => {
    expect(g.partycnt).toBe(1);
  });

  it('is the character who was asked for', (): void => {
    expect(g.charactr[0].name).toBe('FRODO');
  });

  it('remembers which roster slot they came from', (): void => {
    expect(g.chardisk[0]).toBe(0);
  });

  it('marks them as being out, on the disk', (): void => {
    expect(scenario.read(Zone.character, 0, character).inMaze).toBe(true);
  });

  it('leaves the castle for the edge of town', (): void => {
    expect(g.xgoto).toBe(Xgoto.xedgtown);
  });
});


describe('a character who is already out with another party', (): void => {
  beforeEach(async (): Promise<void> => {
    const frodo: ICharacter = somebody('FRODO');

    frodo.inMaze = true;
    boot(rosterOf(frodo), Xgoto.xgilgams);
    await play(castle, addFrodo());
  });

  it('does not join', (): void => {
    expect(g.partycnt).toBe(0);
  });
});


describe('a character nobody has heard of', (): void => {
  beforeEach(async (): Promise<void> => {
    boot(rosterOf(somebody('SAM')), Xgoto.xgilgams);
    await play(castle, addFrodo());
  });

  it('does not join', (): void => {
    expect(g.partycnt).toBe(0);
  });
});


describe("resting on a cot at the Adventurer's Inn", (): void => {
  const HURT: number = 3;
  const WELL: number = 8;

  /** The empty loop CASTLE2 puts between one hit point and the next. */
  const HEAL_PASSES: number = 500;

  beforeEach(async (): Promise<void> => {
    const frodo: ICharacter = somebody('FRODO');

    frodo.hitPoints = HURT;
    frodo.maximumHitPoints = WELL;
    frodo.gold = newlong(100, 0, 0);
    boot(rosterOf(frodo), Xgoto.xcastle);
    g.partycnt = 1;
    g.charactr[0] = frodo;
    g.chardisk[0] = 0;

    await play(castle, [
      'A',                                      // A)DVENTURER'S INN
      '1',                                      // WHO WILL STAY
      'B',                                      // [B] COTS
      RETURN,                                   // PRESS [RETURN] TO LEAVE, the nap over
      RETURN,                                   // leave the inn's menu
      RETURN,                                   // nobody else will stay
      'E',                                      // E)DGE OF TOWN
    ]);
  });

  it('pauses between one hit point healing and the next, so the player can watch', (): void => {
    const ticks: readonly number[] = clock().requested
        .filter((milliseconds: number): boolean => milliseconds === HEAL_PASSES * MILLISECONDS_PER_LOOP);

    expect(ticks).toHaveLength(WELL - HURT);
  });
});
