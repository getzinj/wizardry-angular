import { describe, expect, it } from 'vitest';

import type { ICharacter, IMaze } from '../data/layout/wiz-types';
import { SquareKind, Wall, Zone, maze } from '../data/layout/wiz-types';
import { ScenarioDisk } from '../data/scenario-disk';
import { RIDDLE_ANSWER, RIDDLE_ANSWER_MESSAGE, FEE_MESSAGE, FEE_AND_PLACE_MESSAGE }
  from '../data/scenario-fixture';
import { rt } from '../runtime/runtime';
import { RETURN, boot, play, rosterOf, somebody } from './port-fixture';
import { specials } from './specials2';
import { Direction, Talign, Tattrib, Tstatus, Xgoto, g } from './wiz';

// A special square. The level carries a handful of numbered behaviours and each square points at
// one; LLBASE04 is which, AUX2 says what kind of thing it is, AUX1 is the message and AUX0 is
// whatever that kind needs.

/** The behaviour index the tests use. Zero is the arrival from a flee, so anything else will do. */
const BEHAVIOUR: number = 3;


interface ISquare {
  readonly arg0?: number;
  readonly arg1?: number;
  readonly arg2: number;
  readonly kind?: SquareKind;
}


/** Stands the party on a square pointing at one made-up behaviour. */
function atASpecial(square: ISquare, ...party: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...party);

  boot(scenario, Xgoto.xscnmsg);

  const level: IMaze = scenario.read(Zone.maze, 0, maze);

  level.squareKind[BEHAVIOUR] = square.kind ?? SquareKind.message;
  level.argument0[BEHAVIOUR] = square.arg0 ?? 0;
  level.argument1[BEHAVIOUR] = square.arg1 ?? 0;
  level.argument2[BEHAVIOUR] = square.arg2;
  scenario.write(Zone.maze, 0, maze, level);

  g.partycnt = party.length;
  party.forEach((who: ICharacter, index: number): void => {
    g.charactr[index] = who;
    g.chardisk[index] = index;
  });

  g.mazelev = 1;
  g.mazex = 10;
  g.mazey = 10;
  g.directio = Direction.north;
  g.xgoto2 = Xgoto.xrunner;
  g.llbase04 = BEHAVIOUR;

  return scenario;
}


/**
 * Runs the segment, handing each key over once it is being asked for. Keys cannot be queued ahead
 * here: DOMSG calls UNITCLEAR before every prompt it puts up, which throws away anything typed
 * before the message finished printing.
 */
function runs(keys: string): Promise<void> {
  return play(specials, [ ...keys ]);
}


/** How much ink is in the message area, which is the only way to tell a message was printed. */
function inkInMessageArea(): number {
  return rt().display.hires.toAscii().slice(11 * 8, 15 * 8)
    .join('').split('').filter((pixel: string): boolean => pixel === '#').length;
}


describe('a square that does nothing', (): void => {
  it('hands the party straight back to wherever they came from', async (): Promise<void> => {
    atASpecial({ arg2: 0 }, somebody('FRODO'));
    await runs('');

    expect(g.xgoto).toBe(Xgoto.xrunner);
  });

  it('prints nothing on the way, unlike every other kind', async (): Promise<void> => {
    atASpecial({ arg2: 0, arg1: 0 }, somebody('FRODO'));
    await runs('');

    expect(inkInMessageArea()).toBe(0);
  });

  it('where a square with a message to give does print one', async (): Promise<void> => {
    atASpecial({ arg2: 1, arg0: 3, arg1: 0 }, somebody('FRODO'));
    await runs('');

    expect(inkInMessageArea()).toBeGreaterThan(0);
  });
});


describe('a square that gives something away', (): void => {
  /** Behaviour two: print the message, then hand AUX0 to whoever can carry it. */
  function givingItem(item: number, ...party: readonly ICharacter[]): ScenarioDisk {
    return atASpecial({ arg2: 2, arg1: 0, arg0: item }, ...party);
  }

  it('puts the item in the first pair of hands that will take it', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    givingItem(7, who);
    await runs(RETURN);

    expect([ who.possessions.count, who.possessions.items[0].objectIndex ]).toEqual([ 1, 7 ]);
  });

  it('leaves it unequipped and uncursed', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    givingItem(7, who);
    await runs(RETURN);

    expect([ who.possessions.items[0].equipped, who.possessions.items[0].cursed ])
      .toEqual([ false, false ]);
  });

  it('will not give a second one to somebody who has it already, which is what stops farming',
     async (): Promise<void> => {
       const who: ICharacter = somebody('FRODO');

       who.possessions.count = 1;
       who.possessions.items[0].objectIndex = 7;
       givingItem(7, who);
       await runs(RETURN);

       expect(who.possessions.count).toBe(1);
     });

  it('passes it down the party when the first pack is full', async (): Promise<void> => {
    const first: ICharacter = somebody('FRODO');
    const second: ICharacter = somebody('SAM');

    first.possessions.count = 8;
    givingItem(7, first, second);
    await runs(RETURN);

    expect(second.possessions.items[0].objectIndex).toBe(7);
  });
});


describe('a square somebody has to wade into', (): void => {
  /** Behaviour three, with AUX0 naming which of the seven things happens. */
  function wading(outcome: number, who: ICharacter): void {
    atASpecial({ arg2: 3, arg1: 0, arg0: outcome }, who);
  }

  it('lets the party walk away without anyone wading', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    wading(3, who);
    await runs(`${ RETURN }${ RETURN }`);

    expect(who.status).toBe(Tstatus.ok);
  });

  it('takes eight off the most hit points they have ever had', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    who.maximumHitPoints = 20;
    who.hitPoints = 12;
    wading(0, who);
    await runs(`${ RETURN }1`);

    expect([ who.maximumHitPoints, who.hitPoints ]).toEqual([ 12, 12 ]);
  });

  it('kills one whose hit points that takes to nothing', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    who.maximumHitPoints = 8;
    wading(0, who);
    await runs(`${ RETURN }1`);

    expect(who.status).toBe(Tstatus.dead);
  });

  it('makes one a year younger and takes a point of wits and of piety', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    who.age = 1040;
    who.attributes[Tattrib.iq] = 10;
    who.attributes[Tattrib.piety] = 10;
    wading(1, who);
    await runs(`${ RETURN }1`);

    expect([ who.age, who.attributes[Tattrib.iq], who.attributes[Tattrib.piety] ])
      .toEqual([ 988, 9, 9 ]);
  });

  it('kills one who had no wits left to lose', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    who.attributes[Tattrib.iq] = 3;
    wading(1, who);
    await runs(`${ RETURN }1`);

    expect(who.status).toBe(Tstatus.dead);
  });

  it('poisons one', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    wading(2, who);
    await runs(`${ RETURN }1`);

    expect(who.lostLocation[0]).toBe(1);
  });

  it('only ever makes a state worse, never better', async (): Promise<void> => {
    // Asleep is a lesser state than stoned, so a stoned character is left stoned.
    const who: ICharacter = somebody('FRODO');

    who.status = Tstatus.stoned;
    wading(3, who);
    await runs(`${ RETURN }1`);

    expect(who.status).toBe(Tstatus.stoned);
  });
});


describe('a door that wants an item', (): void => {
  it('lets a party carrying it through', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    who.possessions.count = 1;
    who.possessions.items[0].objectIndex = 9;
    atASpecial({ arg2: 5, arg0: 9 }, who);
    await runs('');

    expect([ g.mazex, g.mazey ]).toEqual([ 10, 10 ]);
  });

  it('bounces a party without it back the way they came', async (): Promise<void> => {
    atASpecial({ arg2: 5, arg0: 9, arg1: -1 }, somebody('FRODO'));
    await runs('');

    expect([ g.mazex, g.mazey ]).toEqual([ 10, 9 ]);
  });
});


describe('a door that turns alignments away', (): void => {
  it('lets one it has no quarrel with through', async (): Promise<void> => {
    // AUX0 three turns away evil only.
    atASpecial({ arg2: 6, arg0: 3, arg1: -1 }, somebody('FRODO', Talign.good));
    await runs('');

    expect(g.mazey).toBe(10);
  });

  it('bounces one it does', async (): Promise<void> => {
    atASpecial({ arg2: 6, arg0: 3, arg1: -1 }, somebody('FRODO', Talign.evil));
    await runs('');

    expect(g.mazey).toBe(9);
  });

  it('bounces once for every character it turns away, so a whole party goes further back',
     async (): Promise<void> => {
       atASpecial({ arg2: 6, arg0: 3, arg1: -1 },
                  somebody('FRODO', Talign.evil), somebody('SAM', Talign.evil));
       await runs('');

       expect(g.mazey).toBe(8);
     });
});


describe('a square that changes the light or the armour', (): void => {
  it('adds fifty turns of light', async (): Promise<void> => {
    atASpecial({ arg2: 7, arg0: 99 }, somebody('FRODO'));
    g.light = 10;
    await runs(RETURN);

    expect(g.light).toBe(60);
  });

  it('puts the lights out', async (): Promise<void> => {
    atASpecial({ arg2: 7, arg0: -99 }, somebody('FRODO'));
    g.light = 40;
    await runs(RETURN);

    expect(g.light).toBe(0);
  });

  it('otherwise changes what everybody is wearing', async (): Promise<void> => {
    atASpecial({ arg2: 7, arg0: 3 }, somebody('FRODO'));
    await runs(RETURN);

    expect(g.acmod2).toBe(3);
  });
});


describe('a square that throws the party out of the maze', (): void => {
  it('puts them on level zero and asks for the maze to be made again', async (): Promise<void> => {
    atASpecial({ arg2: 8, arg0: 1 }, somebody('FRODO'));
    await runs(RETURN);

    expect([ g.mazelev, g.xgoto ]).toEqual([ 0, Xgoto.xnewmaze ]);
  });
});


describe('a square that wakes the neighbourhood', (): void => {
  it('marks every square within reach as holding a fight', async (): Promise<void> => {
    atASpecial({ arg2: 9, arg0: 1 }, somebody('FRODO'));
    await runs(RETURN);

    expect([ g.fightmap[9][9], g.fightmap[11][11] ]).toEqual([ true, true ]);
  });

  it('leaves the square the party is standing on clear', async (): Promise<void> => {
    atASpecial({ arg2: 9, arg0: 1 }, somebody('FRODO'));
    await runs(RETURN);

    expect(g.fightmap[10][10]).toBe(false);
  });
});


describe('a riddle', (): void => {
  it('lets a right answer through', async (): Promise<void> => {
    atASpecial({ arg2: 10, arg0: RIDDLE_ANSWER_MESSAGE, arg1: 0 }, somebody('FRODO'));
    await runs(`${ RETURN }${ RIDDLE_ANSWER }${ RETURN }`);

    expect(g.mazey).toBe(10);
  });

  it('bounces a wrong one', async (): Promise<void> => {
    atASpecial({ arg2: 10, arg0: RIDDLE_ANSWER_MESSAGE, arg1: 0 }, somebody('FRODO'));
    await runs(`${ RETURN }NOPE${ RETURN }`);

    expect(g.mazey).toBe(9);
  });
});


describe('a toll', (): void => {
  /** Somebody with `gold` in their purse. */
  function withGold(name: string, gold: number): ICharacter {
    const who: ICharacter = somebody(name);

    who.gold.low = gold;

    return who;
  }

  it('takes the fee out of the first purse that can cover it', async (): Promise<void> => {
    const who: ICharacter = withGold('FRODO', 900);

    atASpecial({ arg2: 11, arg0: FEE_MESSAGE, arg1: 0 }, who);
    await runs(`${ RETURN }Y`);

    expect(who.gold.low).toBe(400);
  });

  it('empties one purse and takes the rest out of the next', async (): Promise<void> => {
    const first: ICharacter = withGold('FRODO', 200);
    const second: ICharacter = withGold('SAM', 400);

    atASpecial({ arg2: 11, arg0: FEE_MESSAGE, arg1: 0 }, first, second);
    await runs(`${ RETURN }Y`);

    expect([ first.gold.low, second.gold.low ]).toEqual([ 0, 100 ]);
  });

  it('bounces a party that cannot pay, and leaves their gold alone', async (): Promise<void> => {
    const who: ICharacter = withGold('FRODO', 100);

    atASpecial({ arg2: 11, arg0: FEE_MESSAGE, arg1: -1 }, who);
    await runs(`${ RETURN }Y`);

    expect([ who.gold.low, g.mazey ]).toEqual([ 100, 9 ]);
  });

  it('bounces one that will not pay', async (): Promise<void> => {
    const who: ICharacter = withGold('FRODO', 900);

    atASpecial({ arg2: 11, arg0: FEE_MESSAGE, arg1: -1 }, who);
    await runs(`${ RETURN }N`);

    expect([ who.gold.low, g.mazey ]).toEqual([ 900, 9 ]);
  });

  it('moves the party where the letter in front of the fee says', async (): Promise<void> => {
    // 'B250' is two hundred and fifty to be taken somewhere, and B names behaviour two.
    const who: ICharacter = withGold('FRODO', 900);
    const scenario: ScenarioDisk =
      atASpecial({ arg2: 11, arg0: FEE_AND_PLACE_MESSAGE, arg1: 0 }, who);
    const level: IMaze = scenario.read(Zone.maze, 0, maze);

    level.argument0[2] = 1;
    level.argument1[2] = 5;
    level.argument2[2] = 6;
    scenario.write(Zone.maze, 0, maze, level);

    await runs(`${ RETURN }Y`);

    expect([ g.mazex, g.mazey, g.mazelev, g.xgoto ]).toEqual([ 6, 5, 1, Xgoto.xnewmaze ]);
  });

  it('leaves a party that will not pay a lettered fee where they stand', async (): Promise<void> => {
    atASpecial({ arg2: 11, arg0: FEE_AND_PLACE_MESSAGE, arg1: -1 }, withGold('FRODO', 900));
    await runs(`${ RETURN }N`);

    expect(g.mazey).toBe(10);
  });
});


describe('a square worth searching', (): void => {
  it('walks away when the party says no', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    atASpecial({ arg2: 4, arg0: -9, arg1: 0 }, who);
    await runs(`${ RETURN }N`);

    expect(who.possessions.count).toBe(0);
  });

  it('hands over what is hidden when AUX0 is negative', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    atASpecial({ arg2: 4, arg0: -9, arg1: 0 }, who);
    await runs(`${ RETURN }Y`);

    expect(who.possessions.items[0].objectIndex).toBe(9);
  });

  it('sets a fight going when AUX0 is positive', async (): Promise<void> => {
    atASpecial({ arg2: 4, arg0: 2, arg1: 0 }, somebody('FRODO'));
    await runs(`${ RETURN }Y`);

    expect([ g.xgoto, g.enemyinx, g.attk012 ]).toEqual([ Xgoto.xcombat, 2, 0 ]);
  });
});


describe('a square that is used up as it is used', (): void => {
  it('counts one off the uses it has left', async (): Promise<void> => {
    const scenario: ScenarioDisk = atASpecial({ arg2: 1, arg0: 3, arg1: 0 }, somebody('FRODO'));

    await runs('');

    expect(scenario.read(Zone.maze, 0, maze).argument0[BEHAVIOUR]).toBe(2);
  });

  it('stops being special at all when the last one goes', async (): Promise<void> => {
    const scenario: ScenarioDisk = atASpecial({ arg2: 1, arg0: 1, arg1: 0 }, somebody('FRODO'));

    await runs('');

    expect(scenario.read(Zone.maze, 0, maze).squareKind[BEHAVIOUR]).toBe(SquareKind.normal);
  });

  it('does nothing at all once it is spent', async (): Promise<void> => {
    const who: ICharacter = somebody('FRODO');

    atASpecial({ arg2: 1, arg0: 0, arg1: 0 }, who);
    await runs('');

    expect(g.xgoto).toBe(Xgoto.xrunner);
  });
});


describe('arriving from a flee', (): void => {
  // A behaviour index of zero is not a square at all: it is REWARDS' XREWARD2 arm, which RUNAWAY
  // sends the party to when they get away from a fight. SWITCHLOC then walks them out through
  // doors. (The spinner is a different thing entirely, and lives in RUNNER.)
  function fleeing(withADoor: boolean): void {
    const scenario: ScenarioDisk = rosterOf(somebody('FRODO'));

    boot(scenario, Xgoto.xscnmsg);

    if (withADoor) {
      const level: IMaze = scenario.read(Zone.maze, 0, maze);

      // Every wall on the test level is open, and an open wall is not a door, so without this the
      // walk finds nothing to go through and the party stays put.
      level.eastWalls[10][10] = Wall.door;
      scenario.write(Zone.maze, 0, maze, level);
    }

    g.partycnt = 1;
    g.charactr[0] = somebody('FRODO');
    g.mazelev = 1;
    g.mazex = 10;
    g.mazey = 10;
    g.xgoto2 = Xgoto.xrunner;
    g.llbase04 = 0;
  }

  it('walks the party out through a door it found', async (): Promise<void> => {
    fleeing(true);
    await runs('');

    expect([ g.mazex, g.mazey ]).toEqual([ 11, 10 ]);
  });

  it('remembers the square they came from', async (): Promise<void> => {
    fleeing(true);
    await runs('');

    expect([ g.savex, g.savey ]).toEqual([ 10, 10 ]);
  });

  it('leaves them where they were when there is no door to take', async (): Promise<void> => {
    fleeing(false);
    await runs('');

    expect([ g.mazex, g.mazey ]).toEqual([ 10, 10 ]);
  });

  it('hands them back to the maze', async (): Promise<void> => {
    fleeing(false);
    await runs('');

    expect(g.xgoto).toBe(Xgoto.xrunner);
  });

  it('arranges for whatever comes next to be another fight', async (): Promise<void> => {
    fleeing(false);
    await runs('');

    expect(g.xgoto2).toBe(Xgoto.xcombat);
  });
});


describe('a disk with no messages file', (): void => {
  /** The same square, on a disk carrying no SCENARIO.MESGS. */
  function withoutMessages(): void {
    const withThem: ScenarioDisk = atASpecial({ arg2: 7, arg0: 3 }, somebody('FRODO'));
    const without: ScenarioDisk = new ScenarioDisk(withThem.contents);

    boot(without, Xgoto.xscnmsg);
    g.partycnt = 1;
    g.charactr[0] = somebody('FRODO');
    g.mazelev = 1;
    g.xgoto2 = Xgoto.xrunner;
    g.llbase04 = BEHAVIOUR;
  }

  it('leaves rather than stopping the game', async (): Promise<void> => {
    withoutMessages();

    await expect(runs('')).resolves.toBeUndefined();
  });

  it('gives up before reading what the square was going to do', async (): Promise<void> => {
    // The same square sets ACMOD2 to three when the messages are there; the exit comes first.
    withoutMessages();
    await runs('');

    expect(g.acmod2).toBe(0);
  });

  it('where the same square does set it when they are', async (): Promise<void> => {
    atASpecial({ arg2: 7, arg0: 3 }, somebody('FRODO'));
    await runs(RETURN);

    expect(g.acmod2).toBe(3);
  });
});
