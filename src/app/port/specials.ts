// Wiz1B.DSK/SPECIALS.TEXT.txt - INITGAME, which is what happens between switching the machine on
// and standing in the castle, and MAZESCRN, which draws the frame everything in the maze is drawn
// inside.
//
// The copy protection is not ported. The original read a block of 6502 code off the disk and ran
// it to time the gaps between sectors, compared the answer against numbers hidden in the disk's
// serial block, and crashed the machine on a mismatch; then it asked for the disk a second time to
// check the duplicate's serial against the master's. None of that has any meaning for a disk image
// the player brought themselves, and MVCURSOR's two copy-protection syscalls throw if anything
// reaches them.

import { MAZE_SIZE, Wall, Zone, character, maze, scenarioToc } from '../data/layout/wiz-types';
import type { ICharacter, IMaze } from '../data/layout/wiz-types';
import { GRAPHICS_FONT_BLOCK, TEXT_FONT_BLOCK } from '../data/scenario-disk';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { disk, rt } from '../runtime/runtime';
import { CRETURN, Direction, Xgoto, blankmap, g } from './wiz';
import { chr, getkey, gotoxy, graphics, ord, printchr, printstr, textmode, write, writeln }
  from './wiz2';

/** TIMEDLAY as INITGAME sets it: how long a fight's messages are held before T) changes it. */
const STARTING_DELAY: number = 2000;

// The frame is drawn with the box font, whose punctuation slots hold line-drawing pieces. These
// are the character codes the original writes, with its own comments about what each one looks
// like; they mean nothing in the text font, which is why the font is swapped around them.
const UPPER_LEFT: number = 33;
const HYPHEN: number = 34;
const UPPER_RIGHT: number = 35;
const VERTICAL_BAR: number = 36;
const LOWER_LEFT: number = 37;
const LOWER_RIGHT: number = 38;
const TEE_LEFT: number = 39;
const TEE_RIGHT: number = 40;
const TEE_TOP: number = 91;
const DIVIDER_BAR: number = 92;
const TEE_DIVIDER_LEFT: number = 93;
const TEE_BOTTOM: number = 94;


/** The font PRGRCHR draws with, which the game swaps for the disk's other one and back again. */
export function loadcharset(block: number): void {
  rt().display.charset.load(disk().readBlock(block));
}


/**
 * MAZESCRN. The border, the divider between the view and the menu, and the rules the party list
 * sits under. It is drawn once, and everything afterwards writes inside it.
 */
export function mazescrn(): void {
  function horzhyph(): void {
    for (g.llbase04 = 1; g.llbase04 <= 38; g.llbase04++) {
      printchr(chr(HYPHEN));
    }
  }

  function horzline(line: number): void {
    rt().display.mvcursor(0, line);
    printchr(chr(TEE_LEFT));
    horzhyph();
    printchr(chr(TEE_RIGHT));
  }

  function scrnoutl(): void {
    rt().display.mvcursor(0, 0);
    printchr(chr(UPPER_LEFT));
    horzhyph();
    printchr(chr(UPPER_RIGHT));

    for (g.llbase04 = 1; g.llbase04 <= 22; g.llbase04++) {
      rt().display.mvcursor(0, g.llbase04);
      printchr(chr(VERTICAL_BAR));
      rt().display.mvcursor(39, g.llbase04);
      printchr(chr(VERTICAL_BAR));
    }

    rt().display.mvcursor(0, 23);
    printchr(chr(LOWER_LEFT));
    horzhyph();
    printchr(chr(LOWER_RIGHT));
  }

  function initscrn(): void {
    rt().display.hires.clrrect(0, 0, 40, 24);
    loadcharset(GRAPHICS_FONT_BLOCK);
    scrnoutl();
    horzline(10);
    horzline(15);
    rt().display.mvcursor(12, 0);
    printchr(chr(TEE_TOP));

    for (g.llbase04 = 1; g.llbase04 <= 9; g.llbase04++) {
      rt().display.mvcursor(12, g.llbase04);
      printchr(chr(DIVIDER_BAR));
    }

    rt().display.mvcursor(12, 5);
    printchr(chr(TEE_DIVIDER_LEFT));

    for (g.llbase04 = 13; g.llbase04 <= 38; g.llbase04++) {
      printchr(chr(HYPHEN));
    }

    printchr(chr(TEE_RIGHT));
    rt().display.mvcursor(12, 10);
    printchr(chr(TEE_BOTTOM));
    loadcharset(TEXT_FONT_BLOCK);
    rt().display.mvcursor(1, 16);
    printstr('# CHARACTER NAME  CLASS AC HITS STATUS');
  }

  rt().display.hires.clrrect(0, 0, 40, 24);  // Repeated in INITSCRN, as it was.
  initscrn();
}


/**
 * INSPECT. Looking round the room the party is standing in. The room is worked out by flooding
 * outwards through open walls - a doorway stops it, so a room is exactly what you can see without
 * opening anything - and then every body lying anywhere in it is listed and can be picked up.
 *
 * This is the only way to recover somebody the party had to leave behind.
 */
export async function inspect(): Promise<void> {
  let pickcnt: number = 0;
  let pickchar: number = 0;
  let pickrec: ICharacter;

  /** PICKLIST is ARRAY[ 1..6], so the slot at each index is the original's own. */
  const picklist: number[] = new Array<number>(7).fill(0);

  // The original calls this MAZE. Here that name is the record layout, so the level is MAZEREC.
  let mazerec: IMaze;
  let inmyroom: boolean[][] = blankmap();
  let checked: boolean[][] = blankmap();

  /**
   * Reads one square of the room flags. A body's recorded position comes off the disk and nothing
   * checks it, so the original could read outside the grid and get whatever lay beside it. Here a
   * row off the end would throw and a column off the end would answer undefined, so anything
   * outside the grid is read as false, which keeps the listing going as the original did.
   */
  function inroom(x: number, y: number): boolean {
    return (inmyroom[x] != null) && (inmyroom[x][y] === true);
  }

  /** LOOKLOST. */
  function looklost(): void {
    withExitSync('LOOKLOST', (): void => {

      /** FOUNDLOS. Five, not six: the sixth of the list can never be shown, let alone picked up. */
      function foundlos(): void {
        if (pickcnt === 5) {
          exit('LOOKLOST');
        }

        pickcnt = pickcnt + 1;
        picklist[pickcnt] = pickchar;
        write([ pickcnt, 1 ]);
        write(') ');
        write(pickrec.name);
        writeln();
      }

      pickcnt = 0;
      write(chr(12));
      writeln('FOUND:');
      writeln();
      writeln();
      writeln();

      for (pickchar = 0;
           pickchar <= (g.scntoc.recordsOnDisk[Zone.character] - 1);
           pickchar++) {
        pickrec = disk().read(Zone.character, pickchar, character);

        if (!pickrec.inMaze) {
          if (pickrec.lostLocation[2] === g.mazelev) {
            if (inroom(pickrec.lostLocation[0], pickrec.lostLocation[1])) {
              foundlos();
            }
          }
        }
      }

      if (pickcnt === 0) {
        writeln('** NO ONE **');
      }
    });
  }

  /** PICKUP. */
  async function pickup(): Promise<void> {
    await withExit('PICKUP', async (): Promise<void> => {
      if (g.partycnt === 6) {
        gotoxy(0, 20);
        write(chr(11));
        writeln('YOU HAVE 6 - PRESS [RET]');
        gotoxy(41, 0);

        do {
          await getkey();
        } while (g.inchar !== chr(CRETURN));

        exit('PICKUP');
      }

      do {
        gotoxy(0, 20);
        write(chr(11));
        write('GET WHO (0=EXIT) >');
        await getkey();
        pickchar = ord(g.inchar) - ord('0');

        if (pickchar === 0) {
          exit('PICKUP');
        }
      } while (!((pickchar > 0) && (pickchar <= pickcnt)));

      // Picked up once already: the line was cleared off the screen but the number still answers.
      if (picklist[pickchar] === -1) {
        exit('PICKUP');
      }

      g.charactr[g.partycnt] = disk().read(Zone.character, picklist[pickchar], character);
      g.chardisk[g.partycnt] = picklist[pickchar];
      g.charactr[g.partycnt].lostLocation[0] = 0;
      g.charactr[g.partycnt].lostLocation[1] = 0;
      g.charactr[g.partycnt].lostLocation[2] = 0;
      g.charactr[g.partycnt].inMaze = true;
      disk().write(Zone.character, picklist[pickchar], character, g.charactr[g.partycnt]);
      picklist[pickchar] = -1;
      g.partycnt = g.partycnt + 1;
      gotoxy(0, 3 + pickchar);
      write(chr(29));
    });
  }

  /**
   * EXPLROOM. The flood. One pass per dot on the screen, and it keeps going until a pass adds
   * nothing, so the number of dots is how far the room reaches rather than how big it is.
   */
  function explroom(): void {
    let donelook: boolean = false;

    /** CHECKLOC. An open wall only: anything you have to open is the edge of the room. */
    function checkloc(x_: number, y_: number, wall: Wall): void {
      if (wall !== Wall.open) {
        return;
      }

      const x: number = (x_ + MAZE_SIZE) % MAZE_SIZE;
      const y: number = (y_ + MAZE_SIZE) % MAZE_SIZE;

      if (inmyroom[x][y]) {
        return;
      }

      donelook = false;
      inmyroom[x][y] = true;
    }

    mazerec = disk().read(Zone.maze, g.mazelev - 1, maze);
    inmyroom = blankmap();
    inmyroom[g.mazex][g.mazey] = true;
    checked = blankmap();

    do {
      write('.');
      donelook = true;

      for (let horz: number = 0; horz <= (MAZE_SIZE - 1); horz++) {
        for (let vert: number = 0; vert <= (MAZE_SIZE - 1); vert++) {
          if (inmyroom[horz][vert]) {
            if (!checked[horz][vert]) {
              checkloc(horz + 1, vert, mazerec.eastWalls[horz][vert]);
              checkloc(horz - 1, vert, mazerec.westWalls[horz][vert]);
              checkloc(horz, vert - 1, mazerec.southWalls[horz][vert]);
              checkloc(horz, vert + 1, mazerec.northWalls[horz][vert]);
              checked[horz][vert] = true;
            }
          }
        }
      }
    } while (!donelook);
  }

  write(chr(12));
  write('LOOKING');
  textmode();
  explroom();
  looklost();

  do {
    gotoxy(0, 20);
    write('OPTIONS: ');

    if (pickcnt > 0) {
      write('P)ICK UP, ');
    }

    write('L)EAVE');

    do {
      gotoxy(41, 0);
      await getkey();
    } while ((g.inchar !== 'P') && (g.inchar !== 'L'));

    if (g.inchar === 'P') {
      if (pickcnt > 0) {
        await pickup();
      }
    }
  } while (g.inchar !== 'L');

  g.xgoto = Xgoto.xrunner;
  graphics();
  exit('SPECIALS');
}


export async function initgame(): Promise<void> {
  if (g.llbase04 === -1) {
    write(chr(12));
    gotoxy(0, 11);
    write(' SCENARIO MASTER IN DRV 1, PRESS [RET]');

    do {
      gotoxy(41, 0);
      await getkey();
    } while (g.inchar !== chr(CRETURN));

    g.timedlay = STARTING_DELAY;
    g.scntoc = disk().read(Zone.toc, 0, scenarioToc);
  }

  g.xgoto = Xgoto.xcastle;
  write(chr(12));
  textmode();
  mazescrn();
  g.mazex = 0;
  g.mazey = 0;
  g.mazelev = 0;
  g.partycnt = 0;
  g.directio = Direction.north;
  g.acmod2 = 0;
}
