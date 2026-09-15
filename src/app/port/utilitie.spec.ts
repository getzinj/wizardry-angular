import { beforeEach, describe, expect, it } from 'vitest';

import type { ICharacter } from '../data/layout/wiz-types';
import { Zone, object } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { rt } from '../runtime/runtime';
import { RETURN, boot, press, rosterOf, screenAfter as shownAfter, somebody } from './port-fixture';
import { utilitie } from './utilitie';
import { Direction, Tattrib, Tstatus, Xgoto, g } from './wiz';

// The five things the character sheet sends to UTILITIE. The camp has one XGOTO between them, so
// BASE12 says which, and each of them decides for itself where the party ends up.

const ESC: string = '\x1B';


/** Stands a party in front of the thing BASE12 names, with the first of them asking. */
function asking(which: Xgoto, ...party: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...party);

  boot(scenario, Xgoto.xcampstf);
  g.base12 = which;
  g.partycnt = party.length;
  g.mazelev = 1;

  party.forEach((who: ICharacter, index: number): void => {
    g.charactr[index] = who;
    g.chardisk[index] = index;
  });

  g.llbase04 = 0;

  return scenario;
}


/**
 * Runs the segment with every key queued in advance. Nothing here flushes the type-ahead buffer,
 * and a key already in it does not stir the random number, so the rolls stay where the seed put
 * them.
 */
async function runs(keys: string): Promise<void> {
  press(keys);
  await utilitie();
}


/** Runs the segment, hands over `before`, and reads the screen while the next prompt still waits. */
function screenAfter(before: string, then: string): Promise<string> {
  return shownAfter(utilitie, [ ...before ], [ ...then ]);
}


/** One row of a screen dump, so a test can say where something landed and not only that it did. */
function row(screen: string, index: number): string {
  return screen.split('\n')[index].trimEnd();
}


describe('reading the spell books', (): void => {
  let reader: ICharacter;

  beforeEach((): void => {
    reader = somebody('ELEANOR');
    reader.mageSpellSlots[0] = 3;
    reader.priestSpellSlots[1] = 2;
    reader.spellsKnown[1] = 1;
    reader.spellsKnown[3] = 1;
    reader.spellsKnown[22] = 1;
    asking(Xgoto.xdone, reader);
  });

  it('counts off what is left in each of the seven mage groups', async (): Promise<void> => {
    expect(await screenAfter('', 'L')).toContain('MAGE   SPELLS LEFT = 3/0/0/0/0/0/0');
  });

  it('counts off the priest groups on their own line', async (): Promise<void> => {
    expect(await screenAfter('', 'L')).toContain('PRIEST SPELLS LEFT = 0/2/0/0/0/0/0');
  });

  it('heads the mage book when it is asked for', async (): Promise<void> => {
    expect(await screenAfter('M', 'LL')).toContain('KNOWN MAGE SPELLS');
  });

  it('lists a mage spell the reader knows', async (): Promise<void> => {
    expect(await screenAfter('M', 'LL')).toContain('MSPELL1');
  });

  it('leaves out one they do not', async (): Promise<void> => {
    expect(await screenAfter('M', 'LL')).not.toContain('MSPELL2');
  });

  it('heads the priest book instead when that is the one asked for', async (): Promise<void> => {
    expect(await screenAfter('P', 'LL')).toContain('KNOWN PRIEST SPELLS');
  });

  it('numbers the priest book from the twenty-second spell', async (): Promise<void> => {
    expect(await screenAfter('P', 'LL')).toContain('PSPELL22');
  });

  it('starts the list on the third row, which is where SPLISTX counts from',
     async (): Promise<void> => {
       expect(row(await screenAfter('M', 'LL'), 2)).toBe('MSPELL1');
     });

  it('gives an unknown spell no row of its own, so the next known one takes it',
     async (): Promise<void> => {
       // Spell two is not known, and SPLISTX only moves on for one that is, so spell three lands
       // on the row spell two would have had.
       expect(row(await screenAfter('M', 'LL'), 3)).toBe('MSPELL3');
     });

  it('leaves the row a star calls for empty', async (): Promise<void> => {
    const reader2: ICharacter = somebody('MAUD');

    // Only spells three and four are known, and the fourth name carries the star: three lands on
    // the first row of the list and four on the row after the one the star skips.
    reader2.spellsKnown[3] = 1;
    reader2.spellsKnown[4] = 1;
    asking(Xgoto.xdone, reader2);

    const screen: string = await screenAfter('M', 'LL');

    expect([ row(screen, 2), row(screen, 3), row(screen, 4) ]).toEqual([ 'MSPELL3', '', 'MSPELL4' ]);
  });

  it('goes back to the character sheet when the reader leaves', async (): Promise<void> => {
    await runs('L');

    expect(g.xgoto).toBe(Xgoto.xbk2cmp2);
  });

  it('puts the reader back in LLBASE04, which listing a book used as a counter',
     async (): Promise<void> => {
       await runs('ML L');

       expect(g.llbase04).toBe(0);
     });
});


describe('identifying an item', (): void => {
  /** Somebody with one unidentified thing to look at. */
  function carrying(level: number): ICharacter {
    const bishop: ICharacter = somebody('BRAN');

    bishop.level = level;
    bishop.possessions.count = 1;
    bishop.possessions.items[0].objectIndex = 0;
    bishop.possessions.items[0].identified = false;

    return bishop;
  }

  it('survives an item number the character has not got, as the original did', async (): Promise<void> => {
    // The REPEAT's UNTIL is an OR of two conditions that cannot both be false, so any key at all
    // is taken as an item number and nothing clamps it. POSSESS is ARRAY[1..8]; the original read
    // and wrote past it and carried on, so pressing 9 must not stop the segment here either.
    asking(Xgoto.xtrainin, carrying(1));

    await expect(runs('9')).resolves.toBeUndefined();
  });

  it('leaves the slots it does have alone when that happens', async (): Promise<void> => {
    const bishop: ICharacter = carrying(1);

    asking(Xgoto.xtrainin, bishop);
    await runs('9');

    expect(bishop.possessions.items[0].identified).toBe(false);
  });

  it('leaves without looking at anything when told 0', async (): Promise<void> => {
    const bishop: ICharacter = carrying(1);

    asking(Xgoto.xtrainin, bishop);
    await runs('0');

    expect(bishop.possessions.items[0].identified).toBe(false);
  });

  it('identifies the item when the roll comes in under the threshold', async (): Promise<void> => {
    // Seed one's first draw is 16384, which is 84 in a hundred, and a level of fifteen puts the
    // threshold at 85.
    const bishop: ICharacter = carrying(15);

    asking(Xgoto.xtrainin, bishop);
    await runs('1');

    expect(bishop.possessions.items[0].identified).toBe(true);
  });

  it('says so on the screen', async (): Promise<void> => {
    asking(Xgoto.xtrainin, carrying(15));
    await runs('1');

    expect(rt().display.text.toString()).toContain('SUCCESS!');
  });

  it('fails at a level that cannot reach the roll', async (): Promise<void> => {
    asking(Xgoto.xtrainin, carrying(1));
    await runs('1');

    expect(rt().display.text.toString()).toContain('FAILURE');
  });

  it('ends at the character sheet when nothing is found out the hard way',
     async (): Promise<void> => {
       asking(Xgoto.xtrainin, carrying(15));
       await runs('1');

       expect(g.xgoto).toBe(Xgoto.xbk2cmp2);
     });

  /** Makes the one object on the disk a cursed kind of thing, or leaves it an ordinary one. */
  function theObjectIsCursed(scenario: ScenarioDisk, cursed: boolean): void {
    const objectr: ReturnType<typeof object.read> = scenario.read(Zone.object, 0, object);

    objectr.cursed = cursed;
    scenario.write(Zone.object, 0, object, objectr);
  }

  it('rolls for the curse even when the identification failed', async (): Promise<void> => {
    // Seed eight draws 1024 and then 1026, which are 24 and 26 in a hundred: at level one the
    // first misses the threshold of 15, and the second comes in under the 32 that decides they
    // find out what the thing is.
    const bishop: ICharacter = carrying(1);

    theObjectIsCursed(asking(Xgoto.xtrainin, bishop), true);
    rt().random.seed(8);
    await runs('1');

    expect(bishop.possessions.items[0].cursed).toBe(true);
  });

  it('takes the flag off the object rather than setting one of its own, so an ordinary thing '
     + 'stays ordinary', async (): Promise<void> => {
       const bishop: ICharacter = carrying(1);

       theObjectIsCursed(asking(Xgoto.xtrainin, bishop), false);
       rt().random.seed(8);
       await runs('1');

       expect(bishop.possessions.items[0].cursed).toBe(false);
     });

  it('puts the curse out of reach one level higher, which is where 35 - 3 * CHARLEV crosses 26',
     async (): Promise<void> => {
       // The second draw is 26. At level two the threshold is 29 and the curse is found; at three
       // it is 26, and the test is strictly less than, so it is not.
       const bishop: ICharacter = carrying(3);

       theObjectIsCursed(asking(Xgoto.xtrainin, bishop), true);
       rt().random.seed(8);
       await runs('1');

       expect(bishop.possessions.items[0].cursed).toBe(false);
     });

  it('rolls for the curse one level below that, where the identification also succeeded',
     async (): Promise<void> => {
       // Level three also puts the first threshold at 25, which the draw of 24 comes in under - so
       // this one identifies the item and is still rolled for the curse.
       const bishop: ICharacter = carrying(3);

       theObjectIsCursed(asking(Xgoto.xtrainin, bishop), true);
       rt().random.seed(8);
       await runs('1');

       expect(bishop.possessions.items[0].identified).toBe(true);
     });

  it('sends them to the equip screen whatever the thing turns out to be', async (): Promise<void> => {
    theObjectIsCursed(asking(Xgoto.xtrainin, carrying(1)), false);
    rt().random.seed(8);
    await runs('1');

    expect(g.xgoto).toBe(Xgoto.xeqpdsp);
  });
});


describe('locating a body', (): void => {
  /** Somebody lying where the maze left them. */
  function lostAt(name: string, east: number, north: number, level: number): ICharacter {
    const body: ICharacter = somebody(name);

    body.status = Tstatus.dead;
    body.lostLocation[0] = east;
    body.lostLocation[1] = north;
    body.lostLocation[2] = level;

    return body;
  }

  it('says a living character is still with us', async (): Promise<void> => {
    asking(Xgoto.xcastle, somebody('ASKER'), somebody('EDRIC'));
    await runs(`EDRIC${ RETURN }L`);

    expect(rt().display.text.toString()).toContain('STILL WITH US!');
  });

  it('says a body with nowhere recorded is in the mourge', async (): Promise<void> => {
    asking(Xgoto.xcastle, somebody('ASKER'), lostAt('EDRIC', 0, 0, 0));
    await runs(`EDRIC${ RETURN }L`);

    expect(rt().display.text.toString()).toContain('IN THE MOURGE');
  });

  it('gives the quarter of the level a body is lying in', async (): Promise<void> => {
    asking(Xgoto.xcastle, somebody('ASKER'), lostAt('EDRIC', 12, 15, 3));
    await runs(`EDRIC${ RETURN }L`);

    expect(rt().display.text.toString()).toContain('IN THE NORTH EAST OF LEVEL 3');
  });

  it('reads the other quarter off the low numbers', async (): Promise<void> => {
    asking(Xgoto.xcastle, somebody('ASKER'), lostAt('EDRIC', 2, 4, 1));
    await runs(`EDRIC${ RETURN }L`);

    expect(rt().display.text.toString()).toContain('IN THE SOUTH WEST OF LEVEL 1');
  });

  it('calls a level that is not a level unreachable', async (): Promise<void> => {
    asking(Xgoto.xcastle, somebody('ASKER'), lostAt('EDRIC', 5, 5, -1));
    await runs(`EDRIC${ RETURN }L`);

    expect(rt().display.text.toString()).toContain('UNREACHABLE!');
  });

  it('says a name nobody on the roster has is lost forever', async (): Promise<void> => {
    asking(Xgoto.xcastle, somebody('ASKER'));
    await runs(`NOBODY${ RETURN }L`);

    expect(rt().display.text.toString()).toContain('LOST FOREVER!');
  });

  it('passes over a character who is LOST, so the search runs on and says the same',
     async (): Promise<void> => {
       const gone: ICharacter = lostAt('EDRIC', 5, 5, 2);

       gone.status = Tstatus.lost;
       asking(Xgoto.xcastle, somebody('ASKER'), gone);
       await runs(`EDRIC${ RETURN }L`);

       expect(rt().display.text.toString()).toContain('LOST FOREVER!');
     });

  it('goes back to the character sheet', async (): Promise<void> => {
    asking(Xgoto.xcastle, somebody('ASKER'));
    await runs(`NOBODY${ RETURN }L`);

    expect(g.xgoto).toBe(Xgoto.xbk2cmp2);
  });
});


describe('asking where the party is', (): void => {
  beforeEach((): void => {
    asking(Xgoto.xgilgams, somebody('ASKER'));
    g.mazex = 7;
    g.mazey = 3;
    g.mazelev = 2;
    g.directio = Direction.east;
  });

  it('gives the way they are facing', async (): Promise<void> => {
    await runs('L');

    expect(rt().display.text.toString()).toContain('THE PARTY IS FACING EAST.');
  });

  it('gives how far east of the stairs they are', async (): Promise<void> => {
    await runs('L');

    expect(rt().display.text.toString()).toContain('YOU ARE 7 SQUARES EAST AND');
  });

  it('gives how far below the castle', async (): Promise<void> => {
    await runs('L');

    expect(rt().display.text.toString()).toContain('TO THE CASTLE, AND 2 LEVELS');
  });

  it('goes back to the character sheet', async (): Promise<void> => {
    await runs('L');

    expect(g.xgoto).toBe(Xgoto.xbk2cmp2);
  });

  it('answers nothing on the tenth level', async (): Promise<void> => {
    g.mazelev = 10;
    await runs('');

    expect(rt().display.text.toString()).toContain('ENCHANTMENTS PREVENT SPELL FROM WORKING');
  });

  it('does not wait for a key there either, which is why no key was queued for it',
     async (): Promise<void> => {
       g.mazelev = 10;
       await runs('');

       expect(g.xgoto).toBe(Xgoto.xbk2cmp2);
     });
});


describe('teleporting the party', (): void => {
  /** Somebody who can be drowned, or not, on demand. */
  function swimmer(agility: number): ICharacter {
    const who: ICharacter = somebody('MARLO');

    who.attributes[Tattrib.agility] = agility;

    return who;
  }

  it('shows the displacement as it is built up', async (): Promise<void> => {
    asking(Xgoto.xinspect, somebody('ASKER'));

    expect(await screenAfter('NN', ESC)).toContain('# SQUARES NORTH =    2');
  });

  it('chickening out goes back to the character sheet', async (): Promise<void> => {
    asking(Xgoto.xinspect, somebody('ASKER'));
    await runs(ESC);

    expect(g.xgoto).toBe(Xgoto.xbk2cmp2);
  });

  it('asks for the level to be made again when the party lands inside the maze',
     async (): Promise<void> => {
       asking(Xgoto.xinspect, somebody('ASKER'));
       await runs(`E${ RETURN }`);

       expect([ g.mazex, g.xgoto ]).toEqual([ 1, Xgoto.xnewmaze ]);
     });

  it('loses the party in the rock when they go off the edge of the level',
     async (): Promise<void> => {
       asking(Xgoto.xinspect, somebody('ASKER'));
       await runs(`W${ RETURN }`);

       expect(g.xgoto).toBe(Xgoto.xcemetry);
     });

  it('leaves everybody in the rock LOST, and out of the maze', async (): Promise<void> => {
    const asker: ICharacter = somebody('ASKER');

    asking(Xgoto.xinspect, asker);
    await runs(`W${ RETURN }`);

    expect([ asker.status, asker.inMaze ]).toEqual([ Tstatus.lost, false ]);
  });

  it('drops them out of the sky when they go above the first level', async (): Promise<void> => {
    const asker: ICharacter = somebody('ASKER');

    asking(Xgoto.xinspect, asker);
    await runs(`UU${ RETURN }`);

    expect([ asker.status, g.xgoto ]).toEqual([ Tstatus.dead, Xgoto.xchk4win ]);
  });

  it('puts them back at the stairs when they surface on the square they came in by',
     async (): Promise<void> => {
       const asker: ICharacter = somebody('ASKER');

       asking(Xgoto.xinspect, asker);
       await runs(`U${ RETURN }`);

       expect([ asker.status, g.xgoto ]).toEqual([ Tstatus.ok, Xgoto.xchk4win ]);
     });

  it('drops them in the moat when they surface anywhere else', async (): Promise<void> => {
    asking(Xgoto.xinspect, swimmer(9));
    await runs(`UE${ RETURN }`);

    expect(rt().display.text.toString()).toContain('YOU APPEARED IN THE CASTLE MOAT AND');
  });

  it('lets an agile enough swimmer out of the moat alive', async (): Promise<void> => {
    // Seed one's first draw is 16384, which is 9 in twenty-five, and the test is strictly
    // greater than.
    const swim: ICharacter = swimmer(9);

    asking(Xgoto.xinspect, swim);
    await runs(`UE${ RETURN }`);

    expect(swim.status).toBe(Tstatus.ok);
  });

  it('drowns one who is a point slower', async (): Promise<void> => {
    const sink: ICharacter = swimmer(8);

    asking(Xgoto.xinspect, sink);
    await runs(`UE${ RETURN }`);

    expect(sink.status).toBe(Tstatus.dead);
  });

  it('bounces them back off the level past the last one', async (): Promise<void> => {
    asking(Xgoto.xinspect, somebody('ASKER'));
    await runs(`D${ RETURN }`);

    expect([ g.mazelev, g.xgoto ]).toEqual([ 1, Xgoto.xnewmaze ]);
  });
});
