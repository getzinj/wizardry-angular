import { beforeEach, describe, expect, it } from 'vitest';

import type { ICharacter } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { rt } from '../runtime/runtime';
import { boot, play, rosterOf, somebody, waitAtPrompt } from './port-fixture';
import { resetrunner } from './runner2';
import { Direction, Xgoto, g } from './wiz';
import { segment } from './wizardry';

// The road into the maze is four segments long and none of them is the one before it: the Edge of
// Town asks for the maze to be made, UTILITIE makes it and works out everyone's numbers, CAMP is
// where the party stands before setting off, and only then does RUNNER take over. This walks it.

function aParty(): ScenarioDisk {
  const frodo: ICharacter = somebody('FRODO');

  frodo.inMaze = true;

  const scenario: ScenarioDisk = rosterOf(frodo);

  boot(scenario, Xgoto.xedgtown);
  g.partycnt = 1;
  g.charactr[0] = frodo;
  g.chardisk[0] = 0;
  resetrunner();

  return scenario;
}


describe('setting off for the maze', (): void => {
  beforeEach(async (): Promise<void> => {
    aParty();
    await play(segment, [ 'M' ]);
  });

  it('asks for the maze to be made', (): void => {
    expect(g.xgoto).toBe(Xgoto.xnewmaze);
  });

  it('makes the first level and goes on to equip the party', async (): Promise<void> => {
    await play(segment, []);

    expect([ g.mazelev, g.xgoto ]).toEqual([ 1, Xgoto.xequip6 ]);
  });

  it('sends the equipped party to the camp', async (): Promise<void> => {
    await play(segment, []);
    await play(segment, []);

    expect(g.xgoto).toBe(Xgoto.xinspct2);
  });
});


describe('leaving the camp for the maze', (): void => {
  let onScreen: string;

  beforeEach(async (): Promise<void> => {
    aParty();
    await play(segment, [ 'M' ]);
    await play(segment, []);
    await play(segment, []);

    const { running }: { running: Promise<void> } = await waitAtPrompt(segment);

    onScreen = rt().display.text.toString();
    rt().keyboard.push('L');
    await running;
  });

  it('shows the camp on the way', (): void => {
    expect(onScreen).toContain('CAMP');
  });

  it('goes back through the equipping on the way out', (): void => {
    expect(g.xgoto).toBe(Xgoto.xcmp2eq6);
  });

  it('hands over to the maze', async (): Promise<void> => {
    await play(segment, []);

    expect(g.xgoto).toBe(Xgoto.xrunner);
  });

  it('switches the monitor to the graphics page', async (): Promise<void> => {
    await play(segment, []);

    expect(rt().display.mode).toBe('graphics');
  });
});


describe('walking the maze', (): void => {
  /** Runs every segment up to RUNNER and leaves the game standing in the maze, waiting for a key. */
  async function intoTheMaze(): Promise<{ running: Promise<void> }> {
    aParty();
    await play(segment, [ 'M' ]);
    await play(segment, []);
    await play(segment, []);
    await play(segment, [ 'L' ]);
    await play(segment, []);

    return waitAtPrompt(segment);
  }

  async function press(keys: readonly string[]): Promise<void> {
    const { running }: { running: Promise<void> } = await intoTheMaze();

    for (const key of keys) {
      rt().keyboard.push(key);
      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, 0);
      });
    }

    rt().keyboard.push('C');
    await running;
  }

  it('starts at the entrance facing north', async (): Promise<void> => {
    const { running }: { running: Promise<void> } = await intoTheMaze();

    expect([ g.mazex, g.mazey, g.directio ]).toEqual([ 0, 0, Direction.north ]);

    rt().keyboard.push('C');
    await running;
  });

  it('walks north through an open wall', async (): Promise<void> => {
    await press([ 'F' ]);

    expect([ g.mazex, g.mazey ]).toEqual([ 0, 1 ]);
  });

  it('turns right', async (): Promise<void> => {
    await press([ 'R' ]);

    expect(g.directio).toBe(Direction.east);
  });

  it('turns left, the long way round', async (): Promise<void> => {
    await press([ 'L' ]);

    expect(g.directio).toBe(Direction.west);
  });

  it('walks the way it is facing', async (): Promise<void> => {
    await press([ 'R', 'F' ]);

    expect([ g.mazex, g.mazey ]).toEqual([ 1, 0 ]);
  });

  it('wraps round the edge of the level, as the original does', async (): Promise<void> => {
    await press([ 'L', 'F' ]);

    expect(g.mazex).toBe(19);
  });

  it('leaves for the camp on C', async (): Promise<void> => {
    const { running }: { running: Promise<void> } = await intoTheMaze();

    rt().keyboard.push('C');
    await running;

    expect(g.xgoto).toBe(Xgoto.xinspct2);
  });
});


describe('looking at a character from the camp', (): void => {
  it('comes back to the camp when the sheet is left, and the camp still leaves for the maze',
     async (): Promise<void> => {
       aParty();
       await play(segment, [ 'M' ]);
       await play(segment, []);
       await play(segment, []);

       // 1) opens the first character's sheet, L) closes it again, and the second L) leaves camp.
       await play(segment, [ '1', 'L', 'L' ]);

       expect(g.xgoto).toBe(Xgoto.xcmp2eq6);
     });
});


describe('E)QUIP at the camp', (): void => {
  /** Walks the party to the camp, which opens on its party list. */
  async function atTheCamp(): Promise<void> {
    aParty();
    await play(segment, [ 'M' ]);
    await play(segment, []);
    await play(segment, []);
  }

  describe('from the party list, which equips everybody', (): void => {
    it('asks for the equip screen without naming anyone', async (): Promise<void> => {
      await atTheCamp();
      await play(segment, [ 'E' ]);

      expect([ g.xgoto, g.llbase04 ]).toEqual([ Xgoto.xeqpdsp, -1 ]);
    });

    it('comes back to the party list when the whole party has been through',
       async (): Promise<void> => {
         await atTheCamp();
         await play(segment, [ 'E' ]);
         await play(segment, []);

         expect(g.xgoto).toBe(Xgoto.xinspct2);
       });
  });

  describe('from one character sheet', (): void => {
    it('names the character it was opened for', async (): Promise<void> => {
      await atTheCamp();

      // 1) opens the first character's sheet, and E) there equips that one alone.
      await play(segment, [ '1', 'E' ]);

      expect([ g.xgoto, g.llbase04 ]).toEqual([ Xgoto.xeqpdsp, 0 ]);
    });

    it('comes back to that sheet when the equipping is done', async (): Promise<void> => {
      await atTheCamp();
      await play(segment, [ '1', 'E' ]);
      await play(segment, []);

      expect(g.xgoto).toBe(Xgoto.xbck2cmp);
    });
  });
});
