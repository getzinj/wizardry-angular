import { beforeEach, describe, expect, it } from 'vitest';

import { Zone, character } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { MILLISECONDS_PER_BLOCK_PAIR } from './diskio';
import { RETURN, boot, clock, press, rosterOf, screenAfter, somebody, waitAtPrompt } from './port-fixture';
import { rt } from '../runtime/runtime';
import { shops } from './shops2';
import { random } from './wiz2';
import { Direction, Tattrib, Tstatus, Xgoto, g } from './wiz';

// The Edge of Town is the junction. The training grounds are through it and nowhere else, which is
// why the castle alone is a dead end; and leaving through it for anywhere but the maze is what puts
// the party down and takes the "out in the maze" mark off their records.

function atTheEdge(scenario: ScenarioDisk): void {
  boot(scenario, Xgoto.xedgtown);
}


function withAParty(scenario: ScenarioDisk, who: ICharacter): void {
  atTheEdge(scenario);
  g.partycnt = 1;
  g.charactr[0] = who;
  g.chardisk[0] = 0;
}


describe('leaving the Edge of Town with nobody in the party', (): void => {
  beforeEach((): void => {
    atTheEdge(rosterOf());
  });

  it('goes to the training grounds on T', async (): Promise<void> => {
    press('T');

    await shops();

    expect(g.xgoto).toBe(Xgoto.xtrainin);
  });

  it('goes back to the castle on C', async (): Promise<void> => {
    press('C');

    await shops();

    expect(g.xgoto).toBe(Xgoto.xcastle);
  });

  it('ends the game on L', async (): Promise<void> => {
    press('L');

    await shops();

    expect(g.xgoto).toBe(Xgoto.xdone);
  });

  it('will not enter the maze, there being nobody to send', async (): Promise<void> => {
    press('MC');

    await shops();

    expect(g.xgoto).toBe(Xgoto.xcastle);
  });
});


describe('taking a party into the maze', (): void => {
  let scenario: ScenarioDisk;
  let frodo: ICharacter;

  beforeEach(async (): Promise<void> => {
    frodo = somebody('FRODO');
    frodo.inMaze = true;
    scenario = rosterOf(frodo);
    withAParty(scenario, frodo);

    // Somewhere other than the entrance, so the assertions below have something to prove.
    g.mazex = 7;
    g.mazey = 11;
    g.mazelev = 3;
    g.directio = Direction.south;

    press('M');
    await shops();
  });

  it('asks for the maze to be made', (): void => {
    expect(g.xgoto).toBe(Xgoto.xnewmaze);
  });

  it('starts them outside the first level', (): void => {
    expect(g.mazelev).toBe(-1);
  });

  it('faces them north at the entrance', (): void => {
    expect([ g.mazex, g.mazey, g.directio ]).toEqual([ 0, 0, Direction.north ]);
  });

  it('keeps the party together', (): void => {
    expect(g.partycnt).toBe(1);
  });

  it('leaves them marked as out, because they are', (): void => {
    expect(scenario.read(Zone.character, 0, character).inMaze).toBe(true);
  });
});


describe('putting the party down on the way to the training grounds', (): void => {
  let scenario: ScenarioDisk;

  beforeEach(async (): Promise<void> => {
    const frodo: ICharacter = somebody('FRODO');

    frodo.inMaze = true;
    scenario = rosterOf(frodo);
    withAParty(scenario, frodo);
    press('T');
    await shops();
  });

  it('empties the party', (): void => {
    expect(g.partycnt).toBe(0);
  });

  it('takes the out mark off their record, so somebody else may take them', (): void => {
    expect(scenario.read(Zone.character, 0, character).inMaze).toBe(false);
  });

  it('marks the disk as needing to be saved', (): void => {
    expect(scenario.changed).toBe(true);
  });

  it('waits for the disk to take the write, since L)EAVE would otherwise lose it', (): void => {
    expect(clock().requested.at(-1)).toBe(2 * MILLISECONDS_PER_BLOCK_PAIR);
  });
});


describe('leaving the game for good', (): void => {
  it('puts the party down first', async (): Promise<void> => {
    const frodo: ICharacter = somebody('FRODO');

    frodo.inMaze = true;

    const scenario: ScenarioDisk = rosterOf(frodo);

    withAParty(scenario, frodo);
    press('L');
    await shops();

    expect(scenario.read(Zone.character, 0, character).inMaze).toBe(false);
  });
});


// The cemetery is where a party that died together ends up. CHK4WIN is the other door: a party that
// reaches level zero comes through it, which is what the stairs up out of level one do - so it is
// also where the game is won, the amulet being carried up them.

/** Stands a party in the maze, about to arrive at `where`. */
function inTheMaze(where: Xgoto, ...party: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...party);

  boot(scenario, where);
  g.partycnt = party.length;
  party.forEach((who: ICharacter, index: number): void => {
    g.charactr[index] = who;
    g.chardisk[index] = index;
  });

  g.mazelev = 1;
  g.mazex = 5;
  g.mazey = 7;

  return scenario;
}


/** Somebody who walked in and did not walk out, with `gold` on them. */
function casualty(name: string, gold: number = 0): ICharacter {
  const who: ICharacter = somebody(name);

  who.inMaze = true;
  who.gold.low = gold;

  return who;
}


describe('the cemetery', (): void => {
  it('marks everybody dead', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO');

    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect(who.status).toBe(Tstatus.dead);
  });

  it('takes half of what they were carrying', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO', 900);

    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect(who.gold.low).toBe(450);
  });

  it('takes them out of the maze, so somebody else can take them on', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO');

    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect(who.inMaze).toBe(false);
  });

  it('leaves the body where it fell', async (): Promise<void> => {
    // Seed one's draw against the depth is 34 in fifty, which the first level is nowhere near.
    const who: ICharacter = casualty('FRODO');

    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect([ who.lostLocation[0], who.lostLocation[1], who.lostLocation[2] ]).toEqual([ 5, 7, 1 ]);
  });

  it('loses it outright when they died deep enough', async (): Promise<void> => {
    // Seed seven draws 2 in fifty, which any level past the second beats.
    const who: ICharacter = casualty('FRODO');

    inTheMaze(Xgoto.xcemetry, who);
    g.mazelev = 5;
    rt().random.seed(7);
    press(RETURN);
    await shops();

    expect([ who.lostLocation[0], who.lostLocation[1], who.lostLocation[2] ])
      .toEqual([ -1, -1, -1 ]);
  });

  it('breaks what an unlucky one was carrying', async (): Promise<void> => {
    // Seed one draws 4 in twenty-one, and anything the luck does not beat is lost.
    const who: ICharacter = casualty('FRODO');

    who.attributes[Tattrib.luck] = 3;
    who.possessions.count = 1;
    who.possessions.items[0].objectIndex = 7;
    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect(who.possessions.count).toBe(0);
  });

  it('leaves a one-luckier one theirs, the roll having to beat the luck and not merely match it',
     async (): Promise<void> => {
    // Four is the boundary: the test is RANDOM MOD 21 > LUCK, so a four against a four survives.
    const who: ICharacter = casualty('FRODO');

    who.attributes[Tattrib.luck] = 4;
    who.possessions.count = 1;
    who.possessions.items[0].objectIndex = 7;
    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect(who.possessions.count).toBe(1);
  });

  it('never breaks one that is cursed to them, whatever their luck', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO');

    who.attributes[Tattrib.luck] = 3;
    who.possessions.count = 1;
    who.possessions.items[0].objectIndex = 7;
    who.possessions.items[0].cursed = true;
    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect(who.possessions.count).toBe(1);
  });

  it('closes the list up over what broke', async (): Promise<void> => {
    // The first is cursed and stays; the second is not and goes; the third is cursed and moves up.
    const who: ICharacter = casualty('FRODO');

    who.attributes[Tattrib.luck] = 3;
    who.possessions.count = 3;
    who.possessions.items[0].objectIndex = 7;
    who.possessions.items[0].cursed = true;
    who.possessions.items[1].objectIndex = 8;
    who.possessions.items[2].objectIndex = 9;
    who.possessions.items[2].cursed = true;
    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect([ who.possessions.count, who.possessions.items[1].objectIndex ]).toEqual([ 2, 9 ]);
  });

  it('writes all of that to the disk', async (): Promise<void> => {
    const scenario: ScenarioDisk = inTheMaze(Xgoto.xcemetry, casualty('FRODO'));

    press(RETURN);
    await shops();

    expect(scenario.read(Zone.character, 0, character).status).toBe(Tstatus.dead);
  });

  it('leaves somebody already lost alone', async (): Promise<void> => {
    const gone: ICharacter = casualty('FRODO', 900);

    gone.status = Tstatus.lost;
    inTheMaze(Xgoto.xcemetry, gone);
    press(RETURN);
    await shops();

    expect(gone.gold.low).toBe(900);
  });

  it('never writes the already lost back, so the disk still says they are out there',
     async (): Promise<void> => {
    const gone: ICharacter = casualty('FRODO', 900);

    gone.status = Tstatus.lost;

    const scenario: ScenarioDisk = inTheMaze(Xgoto.xcemetry, gone);

    press(RETURN);
    await shops();

    expect(scenario.read(Zone.character, 0, character).inMaze).toBe(true);
  });

  it('draws nothing at all for a cursed slot, so the roll for the body is still the first',
     async (): Promise<void> => {
    // Seed one draws 16384 twice over. Rolling for the cursed slot as well would leave the next
    // draw at 16416, and the outcomes either side of it are the same, so only this notices.
    const who: ICharacter = casualty('FRODO');

    who.possessions.count = 1;
    who.possessions.items[0].objectIndex = 7;
    who.possessions.items[0].cursed = true;
    inTheMaze(Xgoto.xcemetry, who);
    press(RETURN);
    await shops();

    expect(random()).toBe(16384);
  });

  it('leaves nobody in the party', async (): Promise<void> => {
    inTheMaze(Xgoto.xcemetry, casualty('FRODO'));
    press(RETURN);
    await shops();

    expect(g.partycnt).toBe(0);
  });

  it('leaves by the door that only puts the screen back', async (): Promise<void> => {
    inTheMaze(Xgoto.xcemetry, casualty('FRODO'));
    press(RETURN);
    await shops();

    expect([ g.xgoto, g.llbase04 ]).toEqual([ Xgoto.xscnmsg, -2 ]);
  });
});


describe('what the cemetery draws', (): void => {
  /** Every glyph of the fixture's fonts is solid ink, so a drawn cell is 7x8 pixels of it. */
  function ink(column: number, row: number, columns: number, rows: number): number {
    return rt().display.hires.toAscii(column * 7, row * 8, columns * 7, rows * 8)
      .join('')
      .split('')
      .filter((pixel: string): boolean => pixel === '#')
      .length;
  }

  /** Runs the cemetery up to the prompt, so the screen can be read while it is still on. */
  async function drawn(...party: readonly ICharacter[]): Promise<void> {
    inTheMaze(Xgoto.xcemetry, ...party);

    const waiting: { running: Promise<void> } = await waitAtPrompt((): Promise<void> => shops());

    rt().keyboard.push(RETURN);
    await waiting.running;
  }

  it('fills the bottom five rows with the box and the two messages inside it',
     async (): Promise<void> => {
    await drawn(casualty('FRODO'));

    expect(ink(0, 19, 40, 5)).toBe(40 * 7 * 5 * 8);
  });

  it('stands the second stone twenty columns along from the first', async (): Promise<void> => {
    await drawn(casualty('FRODO'), casualty('SAM'));

    expect(ink(20, 0, 4, 6)).toBe(4 * 7 * 6 * 8);
  });

  it('leaves that half of the row bare when there is only one of them', async (): Promise<void> => {
    await drawn(casualty('FRODO'));

    expect(ink(20, 0, 4, 6)).toBe(0);
  });

  it('starts the third stone six rows down', async (): Promise<void> => {
    await drawn(casualty('FRODO'), casualty('SAM'), casualty('PIPPIN'));

    expect(ink(0, 6, 4, 6)).toBe(4 * 7 * 6 * 8);
  });

  it('writes the name beside the stone rather than on it, and stops at its end',
     async (): Promise<void> => {
    await drawn(casualty('FRODO'));

    expect([ ink(4, 2, 5, 1), ink(9, 2, 1, 1) ]).toEqual([ 5 * 7 * 8, 0 ]);
  });
});

describe('coming up out of the maze', (): void => {
  it('forgets where everybody was', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO');

    who.lostLocation[0] = 3;
    inTheMaze(Xgoto.xchk4win, who);
    await shops();

    expect(who.lostLocation[0]).toBe(0);
  });

  it('marks the ones still standing as out in the maze', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO');

    who.inMaze = false;
    inTheMaze(Xgoto.xchk4win, who);
    await shops();

    expect(who.inMaze).toBe(true);
  });

  it('leaves the dead unmarked, so the temple can have them', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO');

    who.status = Tstatus.dead;
    inTheMaze(Xgoto.xchk4win, who);
    await shops();

    expect(who.inMaze).toBe(false);
  });

  it('closes the party up over anyone who is not standing', async (): Promise<void> => {
    const dead: ICharacter = casualty('BOROMIR');
    const alive: ICharacter = casualty('FRODO');

    dead.status = Tstatus.dead;
    inTheMaze(Xgoto.xchk4win, dead, alive);
    await shops();

    expect([ g.partycnt, g.charactr[0].name ]).toEqual([ 1, 'FRODO' ]);
  });

  it('writes everybody back to the disk on the way', async (): Promise<void> => {
    const who: ICharacter = casualty('FRODO');

    who.inMaze = false;
    const scenario: ScenarioDisk = inTheMaze(Xgoto.xchk4win, who);

    await shops();

    expect(scenario.read(Zone.character, 0, character).inMaze).toBe(true);
  });

  it('then waits for the disk to take those writes, as the original forced it to', async (): Promise<void> => {
    inTheMaze(Xgoto.xchk4win, casualty('FRODO'));
    await shops();

    expect(clock().requested.at(-1)).toBe(2 * MILLISECONDS_PER_BLOCK_PAIR);
  });

  it('hands the party to the castle', async (): Promise<void> => {
    inTheMaze(Xgoto.xchk4win, casualty('FRODO'));
    await shops();

    expect(g.xgoto).toBe(Xgoto.xcastle);
  });
});


describe('carrying the amulet out', (): void => {
  /** Somebody holding object ninety-four, which is the amulet and the end of the game. */
  function winner(): ICharacter {
    const who: ICharacter = casualty('FRODO', 7777);

    who.possessions.count = 2;
    who.possessions.items[0].objectIndex = 94;
    who.possessions.items[1].objectIndex = 8;
    who.gold.mid = 3;
    who.experience.low = 1000;

    return who;
  }

  it('pays two hundred and fifty thousand experience', async (): Promise<void> => {
    const who: ICharacter = winner();

    inTheMaze(Xgoto.xchk4win, who);
    press(RETURN);
    await shops();

    expect([ who.experience.low, who.experience.mid ]).toEqual([ 1000, 25 ]);
  });

  it('costs them every piece of equipment', async (): Promise<void> => {
    const who: ICharacter = winner();

    inTheMaze(Xgoto.xchk4win, who);
    press(RETURN);
    await shops();

    expect(who.possessions.count).toBe(0);
  });

  it('costs all but the last four digits of the gold', async (): Promise<void> => {
    const who: ICharacter = winner();

    inTheMaze(Xgoto.xchk4win, who);
    press(RETURN);
    await shops();

    expect([ who.gold.low, who.gold.mid, who.gold.high ]).toEqual([ 7777, 0, 0 ]);
  });

  it('earns the chevron the character sheet draws ever after', async (): Promise<void> => {
    const who: ICharacter = winner();

    inTheMaze(Xgoto.xchk4win, who);
    press(RETURN);
    await shops();

    expect(who.lostLocation[3] & 1).toBe(1);
  });

  it('pays nothing to a party that came out without it', async (): Promise<void> => {
    const who: ICharacter = winner();

    who.possessions.items[0].objectIndex = 93;
    inTheMaze(Xgoto.xchk4win, who);
    await shops();

    expect([ who.experience.low, who.experience.mid ]).toEqual([ 1000, 0 ]);
  });
});


describe('the speech the Overlord makes to the winners', (): void => {
  /** Somebody holding the amulet, so CONGRATS runs at all. */
  function winner(): ICharacter {
    const who: ICharacter = somebody('FRODO');

    who.possessions.count = 1;
    who.possessions.items[0].objectIndex = 94;

    return who;
  }

  async function theSpeech(): Promise<string> {
    inTheMaze(Xgoto.xchk4win, winner());

    return screenAfter((): Promise<void> => shops(), [], [ RETURN ]);
  }

  it('heads the page, the heading being written before the switch to text that reveals it',
     async (): Promise<void> => {
    expect((await theSpeech()).split('\n')[0].trimEnd()).toBe('         *** CONGRATULATIONS ***');
  });

  it('speaks of Trebor, into whose hands the amulet has come back', async (): Promise<void> => {
    expect(await theSpeech()).toContain('YOUR BENIFICENT RULER, TREBOR.');
  });

  it('offers the honour guard, apostrophe and all', async (): Promise<void> => {
    expect(await theSpeech()).toContain(`INTO THE OVERLORD'S HONOR GUARD AND`);
  });

  it('asks for a return from the honoured ones', async (): Promise<void> => {
    expect(await theSpeech()).toContain('PRESS [RETURN], HONORED ONES');
  });
});
