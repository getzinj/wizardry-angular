import { beforeEach, describe, expect, it } from 'vitest';

import { rt } from '../runtime/runtime';
import { RETURN, boot, play, rosterOf, somebody } from './port-fixture';
import type { ICharacter } from '../data/layout/wiz-types';
import { Zone, character } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { mazescrn } from './specials';
import { specials } from './specials2';
import { Tstatus, Xgoto, g } from './wiz';

// MAZESCRN draws the frame everything in the maze is drawn inside: the border, the divider between
// the view and the menu beside it, and the rules the party list sits under. The test disk's fonts
// are solid blocks, so wherever a glyph is drawn there is ink and nowhere else.

function litPixelCount(rows: readonly string[]): number {
  return rows.join('').split('').filter((pixel: string): boolean => pixel === '#').length;
}


function drawnFrame(): void {
  boot(rosterOf(), Xgoto.xrunner);
  mazescrn();
}


describe('the maze screen frame', (): void => {
  it('rules off the maze view from the panel beside it at column 12', (): void => {
    drawnFrame();

    // Character rows 1 to 9 are pixel rows 8 to 79, and the divider fills every one of them.
    expect(litPixelCount(rt().display.hires.toAscii(12 * 7, 8, 7, 72))).toBe(7 * 72);
  });

  it('leaves the maze view itself empty for DRAWMAZE to fill', (): void => {
    drawnFrame();

    // Character columns 1 to 11 of rows 1 to 9: the view, without the border down one side of it
    // and the divider down the other, both of which the picture window overlaps by a few pixels.
    expect(litPixelCount(rt().display.hires.toAscii(7, 8, 11 * 7, 9 * 8))).toBe(0);
  });

  it('draws a border down the left edge of every row between the corners', (): void => {
    drawnFrame();

    expect(litPixelCount(rt().display.hires.toAscii(0, 8, 7, 8))).toBe(7 * 8);
  });

  it('draws a border down the right edge too', (): void => {
    drawnFrame();

    expect(litPixelCount(rt().display.hires.toAscii(39 * 7, 8, 7, 8))).toBe(7 * 8);
  });

  it('rules off the party list from the message area at row 15', (): void => {
    drawnFrame();

    expect(litPixelCount(rt().display.hires.toAscii(7, 15 * 8, 7, 8))).toBe(7 * 8);
  });

  it('leaves the row below the bottom border alone', (): void => {
    drawnFrame();

    expect(litPixelCount(rt().display.hires.toAscii(0, 24 * 8, 280, 192 - (24 * 8)))).toBe(0);
  });
});


describe('looking round the room in the maze', (): void => {
  // XINSAREA leaves SPECIALS by INSPECT's own door - back to the maze, on the graphics page - and
  // never reaches the test that decides between booting the game and showing a message. It matters
  // that it cannot: the maze leaves a character's armour class in LLBASE04, which is negative for
  // anybody decently armoured, and that is the same thing a cold boot is told by.
  beforeEach(async (): Promise<void> => {
    boot(rosterOf(somebody('FRODO')), Xgoto.xinsarea);
    g.partycnt = 1;
    g.charactr[0] = somebody('FRODO');
    g.charactr[0].armourClass = -2;
    g.xgoto2 = Xgoto.xrunner;
    g.mazelev = 1;

    // What PRSTATS leaves there after printing a well-armoured party's numbers.
    g.llbase04 = g.charactr[0].armourClass - g.acmod2;

    // L) is the only way out of the options line when there is nobody to pick up.
    await play(specials, [ 'L' ]);
  });

  it('comes back to the maze', (): void => {
    expect(g.xgoto).toBe(Xgoto.xrunner);
  });

  it('keeps the party, rather than booting the game out from under them', (): void => {
    expect(g.partycnt).toBe(1);
  });

  it('keeps them on the level they were on', (): void => {
    expect(g.mazelev).toBe(1);
  });

  it('puts the monitor back on the graphics page', (): void => {
    expect(rt().display.mode).toBe('graphics');
  });
});


// INSPECT is what the party does when they look round the room they are standing in. The room is
// worked out by flooding outwards through open walls, so it is exactly what can be seen without
// opening anything, and every body lying in it can be picked up again. On the test disk every wall
// is open, which makes the whole level one room.

/** Somebody who died on `level` and is lying there waiting to be found. */
function aBody(name: string, level: number, x: number = 4, y: number = 6): ICharacter {
  const who: ICharacter = somebody(name);

  who.status = Tstatus.dead;
  who.inMaze = false;
  who.lostLocation[0] = x;
  who.lostLocation[1] = y;
  who.lostLocation[2] = level;

  return who;
}


/** Stands a one-person party in the maze looking round, with `roster` written to the disk. */
function looking(...roster: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...roster);

  boot(scenario, Xgoto.xinsarea);
  g.partycnt = 1;
  g.charactr[0] = roster[0];
  g.chardisk[0] = 0;
  g.mazelev = 1;
  g.mazex = 0;
  g.mazey = 0;
  g.xgoto2 = Xgoto.xrunner;
  g.llbase04 = 0;

  return scenario;
}


function onScreen(): string {
  return rt().display.text.toString();
}


describe('looking for what the maze left behind', (): void => {
  it('says there is nobody when the room is empty', async (): Promise<void> => {
    looking(somebody('FRODO'));
    await play(specials, [ 'L' ]);

    expect(onScreen()).toContain('** NO ONE **');
  });

  it('lists a body lying in the room', async (): Promise<void> => {
    looking(somebody('FRODO'), aBody('BOROMIR', 1));
    await play(specials, [ 'L' ]);

    expect(onScreen()).toContain('1) BOROMIR');
  });

  it('leaves out one lying on another level', async (): Promise<void> => {
    looking(somebody('FRODO'), aBody('BOROMIR', 2));
    await play(specials, [ 'L' ]);

    expect(onScreen()).toContain('** NO ONE **');
  });

  it('leaves out one who is still walking about', async (): Promise<void> => {
    const walking: ICharacter = aBody('BOROMIR', 1);

    walking.inMaze = true;
    looking(somebody('FRODO'), walking);
    await play(specials, [ 'L' ]);

    expect(onScreen()).toContain('** NO ONE **');
  });

  it('offers to pick somebody up only when there is somebody to pick up',
     async (): Promise<void> => {
       looking(somebody('FRODO'), aBody('BOROMIR', 1));
       await play(specials, [ 'L' ]);

       expect(onScreen()).toContain('P)ICK UP');
     });

  it('does not offer it when the room is empty', async (): Promise<void> => {
    looking(somebody('FRODO'));
    await play(specials, [ 'L' ]);

    expect(onScreen()).not.toContain('P)ICK UP');
  });

  // PICKLIST is ARRAY[ 1..6] but FOUNDLOS stops at five, so the sixth slot can never be filled and
  // a sixth body is invisible - there is no way to pick it up at all.
  it('lists five at most, however many are lying there', async (): Promise<void> => {
    looking(somebody('FRODO'),
            aBody('ONE', 1), aBody('TWO', 1), aBody('THREE', 1),
            aBody('FOUR', 1), aBody('FIVE', 1), aBody('SIX', 1));
    await play(specials, [ 'L' ]);

    expect([ onScreen().includes('5) FIVE'), onScreen().includes('6) SIX') ])
      .toEqual([ true, false ]);
  });

  it('adds the one picked up to the party', async (): Promise<void> => {
    looking(somebody('FRODO'), aBody('BOROMIR', 1));
    await play(specials, [ 'P', '1', 'L' ]);

    expect([ g.partycnt, g.charactr[1].name ]).toEqual([ 2, 'BOROMIR' ]);
  });

  it('puts them back in the maze and forgets where they were lying', async (): Promise<void> => {
    looking(somebody('FRODO'), aBody('BOROMIR', 1));
    await play(specials, [ 'P', '1', 'L' ]);

    expect([ g.charactr[1].inMaze, g.charactr[1].lostLocation[2] ]).toEqual([ true, 0 ]);
  });

  it('writes that to the disk, so the body is not found twice', async (): Promise<void> => {
    const scenario: ScenarioDisk = looking(somebody('FRODO'), aBody('BOROMIR', 1));

    await play(specials, [ 'P', '1', 'L' ]);

    expect(scenario.read(Zone.character, 1, character).inMaze).toBe(true);
  });

  it('remembers which roster slot they came from', async (): Promise<void> => {
    looking(somebody('FRODO'), aBody('BOROMIR', 1));
    await play(specials, [ 'P', '1', 'L' ]);

    expect(g.chardisk[1]).toBe(1);
  });

  it('refuses a second go at the same one', async (): Promise<void> => {
    looking(somebody('FRODO'), aBody('BOROMIR', 1));
    await play(specials, [ 'P', '1', 'P', '1', 'L' ]);

    expect(g.partycnt).toBe(2);
  });

  it('turns a full party away', async (): Promise<void> => {
    looking(somebody('FRODO'), aBody('BOROMIR', 1));
    g.partycnt = 6;
    await play(specials, [ 'P', RETURN, 'L' ]);

    expect(g.partycnt).toBe(6);
  });
});
