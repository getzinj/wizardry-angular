// Wiz1C.DSK/UTILITIE.TEXT.txt - the five things the camp sends here for, and NEWMAZE.
//
// RDSPELLS, IDITEM, KANDIFND, DUMAPIC and MALOR are what the character sheet's R)EAD and
// I)DENTIFY and its three out-of-segment camp spells reach. BASE12 says which, because the camp
// has only one XGOTO to say it with.
//
// NEWMAZE is what stands between the Edge of Town and the maze. It reads the level off the disk
// and decides where the wandering monsters will be: nine rooms chosen at random, plus every room
// holding a fixed encounter, flooded outwards through open walls. Walking into a room clears it
// again, so a party that keeps moving meets fewer monsters than one that paces about.

import { MAZE_SIZE, SquareKind, Wall, Zone, character, maze, object, possession, scenarioToc }
  from '../data/layout/wiz-types';
import type { ICharacter, IMaze, IObject } from '../data/layout/wiz-types';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { disk, rt } from '../runtime/runtime';
import { equip1, equip6, reorder } from './utilitie2';
import { CRETURN, Tattrib, Tstatus, Xgoto, blankmap, g, spelgrp } from './wiz';
import { centstr, chr, getkey, getline, gotoxy, ord, random, textmode, write, writeln } from './wiz2';


/** UTILITIE's own variables. CHARX is reused by every one of the five for the same thing. */
let charx: number = 0;
let chari: number = 0;

/** Rooms the wandering monsters start in, before the flood spreads them. */
const SEEDED_ROOMS: number = 9;

/** NEWMAZE's own copy of the level, which FIGHTS reads and nothing outside it sees. */
let mazemap: IMaze;


/** NEWMAZE. */
function newmaze(): void {

  function fights(): void {
    let fightx: number = 0;
    let fighty: number = 0;

    /**
     * FINDSPOT. Walks on from a random square until it finds one holding a fixed encounter that
     * has not been flooded yet. Coming all the way round to where it started means there are none
     * left, and it gives up on the whole of FIGHTS rather than just on itself.
     */
    function findspot(): void {
      withExitSync('FINDSPOT', (): void => {
        const x1: number = rt().random.modulo(MAZE_SIZE);
        const y1: number = rt().random.modulo(MAZE_SIZE);

        fightx = x1;
        fighty = y1;

        do {
          if (mazemap.fights[fightx][fighty] === 1) {
            if (!g.fightmap[fightx][fighty]) {
              exit('FINDSPOT');
            }
          }

          fightx = fightx + 1;

          if (fightx > (MAZE_SIZE - 1)) {
            fightx = 0;
            fighty = fighty + 1;

            if (fighty > (MAZE_SIZE - 1)) {
              fighty = 0;
            }
          }
        } while (!((fightx === x1) && (fighty === y1)));

        exit('FIGHTS');
      });
    }

    /** FILLROOM. Floods outwards through open walls, marking every square it can reach. */
    function fillroom(x: number, y: number): void {
      const atx: number = ((x + MAZE_SIZE) % MAZE_SIZE);
      const aty: number = ((y + MAZE_SIZE) % MAZE_SIZE);

      if ((mazemap.fights[atx][aty] === 0) || g.fightmap[atx][aty]) {
        return;
      } else {
        g.fightmap[atx][aty] = true;

        if (mazemap.northWalls[atx][aty] === Wall.open) { fillroom(atx, aty + 1); }
        if (mazemap.eastWalls[atx][aty] === Wall.open) { fillroom(atx + 1, aty); }
        if (mazemap.southWalls[atx][aty] === Wall.open) { fillroom(atx, aty - 1); }
        if (mazemap.westWalls[atx][aty] === Wall.open) { fillroom(atx - 1, aty); }
      }
    }

    withExitSync('FIGHTS', (): void => {
      g.fightmap = blankmap();

      for (let x: number = 1; x <= SEEDED_ROOMS; x++) {
        findspot();
        fillroom(fightx, fighty);
      }

      for (let x: number = 0; x <= (MAZE_SIZE - 1); x++) {
        for (let y: number = 0; y <= (MAZE_SIZE - 1); y++) {
          if (mazemap.squareKind[mazemap.squareTag[x][y]] === SquareKind.encounter) {
            fillroom(x, y);
          }
        }
      }
    });
  }

  if (g.mazelev === 0) {
    write(chr(12));
    g.xgoto = Xgoto.xchk4win;
    exit('UTILITIE');
  }

  if (g.mazelev < 0) {
    g.mazelev = 1;
    g.xgoto = Xgoto.xequip6;
  } else {
    g.xgoto = Xgoto.xrunner;
  }

  mazemap = disk().read(Zone.maze, g.mazelev - 1, maze);
  fights();
  rt().display.hires.clrrect(1, 11, 38, 4);
  exit('UTILITIE');
}



/**
 * RDSPELLS. What the character has left to cast out of each of the fourteen groups, and either
 * spell book on request. The books are plain text on the disk rather than anything in the code:
 * one name per line, and the list stops at an empty one.
 */
async function rdspells(): Promise<void> {
  const scnmage: number = 4;
  const scnprst: number = 5;

  let spellgrp: number = 0;
  let splistx: number = 0;
  let dsksplnm: number = 0;
  let spellx: number = 0;

  /** LISTSPLS. Reads a book off the disk a character at a time and prints the ones that are known. */
  async function listspls(): Promise<void> {

    /**
     * PRSPELL. A star in front of a name is not part of it: it means leave a gap first, which is
     * how the groups line up down each column. The cursor moves whether or not the spell is known,
     * so an unknown one leaves the space it would have taken.
     */
    function prspell(spellnm_: string): void {
      let spellnm: string = spellnm_;

      if (spellnm.substring(0, 1) === '*') {
        spellnm = spellnm.substring(1);
        splistx = splistx + 1;
      }

      gotoxy(10 * Math.trunc(splistx / 20), 2 + (splistx % 20));

      // SPELLSKN is PACKED ARRAY[ 0..49] in the original, but SPELLX runs to 50 for the last of
      // the priest book, so that one reads the padding after the array - which is clear, so it
      // never lists. The port's array is one longer, which reads a stored zero instead of running
      // off the end; the record is the same size either way, since fifty-one bits still fit in
      // the same four words.
      if (g.charactr[charx].spellsKnown[spellx] !== 0) {
        write(spellnm);
        splistx = splistx + 1;
      }

      spellx = spellx + 1;
    }

    /** SPRETURN. */
    async function spreturn(): Promise<void> {
      gotoxy(0, 23);
      write('L)EAVE WHEN READY');

      do {
        gotoxy(41, 0);
        await getkey();
      } while (g.inchar !== 'L');

      g.inchar = chr(0);
    }

    // The original re-reads the table of contents over the top of itself first. It changes nothing
    // it reads; what it is for is the flush GETREC does on its way past, if a dirty pair is
    // sitting in the cache. The UNITREAD below reads the book straight INTO that same buffer
    // without touching the bookkeeping that says which blocks are in it, which is why the flush
    // has to happen first and why the second UNITREAD has to put the buffer back.
    g.scntoc = disk().read(Zone.toc, 0, scenarioToc);

    const book: Uint8Array = disk().readBlock(dsksplnm);
    let chptr: number = 0;

    splistx = 0;

    // Both loops test the same byte, so an empty line - two carriage returns running - ends the
    // book. LLBASE04 is the length counter, which is the global the camp keeps the character in:
    // RDSPELLS puts it back from CHARX on the way out, and nothing reads it in between.
    //
    // Running out of block is the port's own stop. The original scanned a 1024-byte buffer with
    // only its first 512 replaced, so a book with no terminator ran into the stale half and hit a
    // carriage return there; here there is no second half to run into, and without this the loops
    // would never end.
    while ((chptr < book.length) && (book[chptr] !== CRETURN)) {
      let spellnm: string = '';

      g.llbase04 = 0;

      while ((chptr < book.length) && (book[chptr] !== CRETURN)) {
        g.llbase04 = g.llbase04 + 1;
        spellnm = spellnm + chr(book[chptr]);
        chptr = chptr + 1;
      }

      prspell(spellnm);
      chptr = chptr + 1;
    }

    // The original refills the cache with the table of contents pair it displaced. There is no
    // cache here, so there is nothing to put back.
    await spreturn();
  }

  /** PRPRIEST. */
  async function prpriest(): Promise<void> {
    write(chr(12));
    write('KNOWN PRIEST SPELLS');
    dsksplnm = scnprst;
    spellx = 22;
    await listspls();
  }

  /** PRMAGE. */
  async function prmage(): Promise<void> {
    dsksplnm = scnmage;
    spellx = 1;
    write(chr(12));
    write('KNOWN MAGE SPELLS');
    await listspls();
  }

  charx = g.llbase04;

  do {
    const who: ICharacter = g.charactr[charx];

    write(chr(12));
    write('MAGE   SPELLS LEFT = ');
    write(spelgrp(who.mageSpellSlots, 1));
    spellgrp = 1 + 1;

    while (spellgrp <= 7) {
      write('/');
      write(spelgrp(who.mageSpellSlots, spellgrp));
      spellgrp = spellgrp + 1;
    }

    writeln();
    write('PRIEST SPELLS LEFT = ');
    write(spelgrp(who.priestSpellSlots, 1));
    spellgrp = 1 + 1;

    while (spellgrp <= 7) {
      write('/');
      write(spelgrp(who.priestSpellSlots, spellgrp));
      spellgrp = spellgrp + 1;
    }

    writeln();
    writeln();
    writeln('YOU MAY SEE M)AGE OR P)RIEST SPELL BOOKS');
    writeln([ 'OR L)EAVE.', 22 ]);
    gotoxy(41, 15);
    await getkey();

    if (g.inchar === 'M') {
      await prmage();
    } else if (g.inchar === 'P') {
      await prpriest();
    }
  } while (g.inchar !== 'L');

  g.inchar = chr(0);
  g.xgoto = Xgoto.xbk2cmp2;
  g.llbase04 = charx;
  exit('UTILITIE');
}


/**
 * IDITEM. A bishop looking at what he is carrying. Succeeding at it is one roll and finding out
 * the hard way that the thing is cursed is another, and the second is rolled whether or not the
 * first one worked - so a failed identification can still stick the item to his hand.
 */
async function iditem(): Promise<void> {
  let itemx: number = 0;

  /** EXITIDIT. */
  function exitidit(): void {
    g.llbase04 = charx;
    exit('UTILITIE');
  }

  /**
   * POSS.POSSESS is ARRAY[ 1..8] and nothing clamps ITEMX, because the REPEAT below ends on the
   * first key whatever it was: 9, or ESC, or anything under '0', reaches past the array. Range
   * checking was off, so the original read and wrote whatever lay beside it and carried on. Which
   * bytes those were is not something a decoded record can reproduce, and indexing past a decoded
   * array throws - which would take the segment down, a stop the original never had. A slot of its
   * own, written and then thrown away, keeps the game going the way the original kept going.
   */
  function possess(who_: ICharacter, index: number): ReturnType<typeof possession.read> {
    const slot: ReturnType<typeof possession.read> | undefined = who_.possessions.items[index - 1];

    if (slot != null) {
      return slot;
    } else {
      return possession.read(new Uint8Array(possession.size), 0);
    }
  }

  charx = g.llbase04;
  g.xgoto = Xgoto.xbk2cmp2;

  const who: ICharacter = g.charactr[charx];

  // The test is an OR of two things that cannot both be false, so the loop always ends on the
  // first key: anything but 0 is taken as an item number, in range or not.
  do {
    gotoxy(0, 18);
    write(chr(11));
    write('IDENTIFY WHAT ITEM (0=EXIT) ? >');
    await getkey();
    itemx = ord(g.inchar) - ord('0');

    if (itemx === 0) {
      exitidit();
    }
  } while (!((itemx > 0) || (itemx <= who.possessions.count)));

  const slot: ReturnType<typeof possession.read> = possess(who, itemx);

  if (slot.identified) {
    exitidit();
  }

  slot.identified = (random() % 100) < (10 + (5 * who.level));

  if (slot.identified) {
    await centstr('SUCCESS!');
  } else {
    await centstr('FAILURE');
  }

  if ((random() % 100) < (35 - (3 * who.level))) {
    const objectr: IObject = disk().read(Zone.object, slot.objectIndex, object);

    slot.cursed = objectr.cursed;
    g.xgoto = Xgoto.xeqpdsp;
  }

  exitidit();
}


/**
 * KANDIFND. Where a body was left. It reads every roster record looking for the name, and a
 * character who is LOST is passed over rather than answered about, so the search runs on: a later
 * record of the same name still answers, and only when none does is the party told they are gone
 * for good.
 */
async function kandifnd(): Promise<void> {
  let locstring: string = '';
  let lostchar: ICharacter;

  /** EXITKAND. */
  async function exitkand(): Promise<void> {
    writeln();
    writeln('L)EAVE WHEN READY');
    gotoxy(41, 0);

    do {
      await getkey();
    } while (g.inchar !== 'L');

    g.inchar = 'A';
    g.llbase04 = charx;
    g.xgoto = Xgoto.xbk2cmp2;
    exit('UTILITIE');
  }

  /** KANDILOC. */
  async function kandiloc(): Promise<void> {
    if (lostchar.status === Tstatus.lost) {
      return;
    }

    if (lostchar.status < Tstatus.dead) {
      writeln('STILL WITH US!');
    } else if ((lostchar.lostLocation[0] === 0) &&
               (lostchar.lostLocation[1] === 0) &&
               (lostchar.lostLocation[2] === 0)) {
      writeln('IN THE MOURGE');
    } else if (lostchar.lostLocation[2] <= 0) {
      writeln('UNREACHABLE!');
    } else {
      write('IN THE ');

      if (lostchar.lostLocation[1] > 9) {
        write('NORTH ');
      } else {
        write('SOUTH ');
      }

      if (lostchar.lostLocation[0] > 9) {
        write('EAST');
      } else {
        write('WEST');
      }

      write(' OF LEVEL ');
      writeln(lostchar.lostLocation[2]);
    }

    await exitkand();
  }

  charx = g.llbase04;
  write(chr(12));
  writeln('LOCATE BODIES');
  writeln();
  write('FIND WHO ? >');
  locstring = await getline();
  write(chr(12));
  write('THE SOUL OF ');
  write(locstring);
  writeln(' IS..');
  writeln();

  for (let charxdsk: number = 0;
       charxdsk <= (g.scntoc.recordsOnDisk[Zone.character] - 1);
       charxdsk++) {
    lostchar = disk().read(Zone.character, charxdsk, character);

    if (lostchar.name === locstring) {
      await kandiloc();
    }
  }

  writeln('LOST FOREVER!');
  await exitkand();
}


/**
 * DUMAPIC. Where the party is standing. The tenth level answers nothing, and that arm does not
 * wait for a key either: it prints its one line and leaves.
 */
async function dumapic(): Promise<void> {
  g.xgoto = Xgoto.xbk2cmp2;

  if (g.mazelev === 10) {
    write(chr(12));
    writeln('ENCHANTMENTS PREVENT SPELL FROM WORKING');
    exit('UTILITIE');
  }

  charx = g.llbase04;
  write(chr(12));
  writeln('PARTY LOCATION:');
  writeln();
  write('THE PARTY IS FACING ');

  if (g.directio === 0) {
    writeln('NORTH.');
  } else if (g.directio === 1) {
    writeln('EAST.');
  } else if (g.directio === 2) {
    writeln('SOUTH.');
  } else if (g.directio === 3) {
    writeln('WEST.');
  }

  writeln();
  write('YOU ARE ');
  write(g.mazex);
  writeln(' SQUARES EAST AND');
  write(g.mazey);
  writeln(' SQUARES NORTH OF THE STAIRS');
  write('TO THE CASTLE, AND ');
  write(g.mazelev);
  writeln(' LEVELS');
  writeln('BELOW IT.');
  writeln();
  writeln('L)EAVE WHEN READY');

  do {
    gotoxy(41, 0);
    await getkey();
  } while (g.inchar !== 'L');

  g.inchar = 'A';
  g.llbase04 = charx;
  exit('UTILITIE');
}


/**
 * MALOR. Moving the party by however many squares they name. Nothing checks the numbers until
 * RETURN is pressed, and most of what can go wrong past the edge of the maze kills everybody.
 */
async function malor(): Promise<void> {
  let deltaud: number = 0;
  let deltans: number = 0;
  let deltaew: number = 0;

  /** TELEPORT. Every way out of this leaves the segment; none of them comes back to MALOR. */
  function teleport(): void {

    /** ROCK. */
    function rock(): void {
      writeln('YOU LANDED IN SOLID ROCK OUTSIDE THE');
      writeln('DUNGEON - YOU ARE LOST FOREVER!');

      for (let x: number = 0; x <= (g.partycnt - 1); x++) {
        g.charactr[x].inMaze = false;
        g.charactr[x].status = Tstatus.lost;
      }

      g.xgoto = Xgoto.xcemetry;
      exit('UTILITIE');
    }

    /** VOLCANO. */
    function volcano(): void {
      writeln('YOU MATERIALIZED IN MID-AIR AND FELL');
      writeln('TO A PAINFUL DEATH!');

      for (let x: number = 0; x <= (g.partycnt - 1); x++) {
        if (g.charactr[x].status < Tstatus.dead) {
          g.charactr[x].status = Tstatus.dead;
        }
      }

      g.mazelev = 0;
      g.xgoto = Xgoto.xchk4win;
      exit('UTILITIE');
    }

    /** MOAT. Agility against a roll, so the odd one of the party comes out of the water alive. */
    function moat(): void {
      writeln('YOU APPEARED IN THE CASTLE MOAT AND');
      writeln('PROBABLY DROWNED!');

      for (let x: number = 0; x <= (g.partycnt - 1); x++) {
        if (g.charactr[x].status < Tstatus.dead) {
          if ((random() % 25) > g.charactr[x].attributes[Tattrib.agility]) {
            g.charactr[x].status = Tstatus.dead;
          }
        }
      }

      g.mazelev = 0;
      g.xgoto = Xgoto.xchk4win;
      exit('UTILITIE');
    }

    /** TOSHOPS. */
    function toshops(): void {
      g.xgoto = Xgoto.xchk4win;
      exit('UTILITIE');
    }

    /** BOUNCE. */
    function bounce(): void {
      writeln('YOU BOUNCED BACK TO WHERE YOU WERE!');
      exit('UTILITIE');
    }

    write(chr(12));
    g.xgoto = Xgoto.xnewmaze;

    if ((g.mazelev + deltaud) === g.scntoc.recordsOnDisk[Zone.maze]) {
      bounce();
    }

    g.mazex = g.mazex + deltaew;
    g.mazey = g.mazey + deltans;
    g.mazelev = g.mazelev + deltaud;

    if (((g.mazex < 0) || (g.mazex > 19) ||
         (g.mazey < 0) || (g.mazey > 19) ||
         (g.mazelev > g.scntoc.recordsOnDisk[Zone.maze])) &&
        (g.mazelev > 0)) {
      rock();
    } else if (g.mazelev < 0) {
      volcano();
    } else if (g.mazelev === 0) {
      if ((g.mazex === 0) && (g.mazey === 0)) {
        toshops();
      } else {
        moat();
      }
    }

    exit('UTILITIE');
  }

  charx = g.llbase04;
  write(chr(12));
  writeln('PARTY TELEPORT:');
  writeln();
  writeln('ENTER NSEWU OR D TO  SET DISPLACEMENT,');
  writeln('THEN [RETURN] TO TELEPORT, OR [ESC] TO');
  writeln('CHICKEN OUT!');
  writeln();
  writeln('# SQUARES EAST  =');
  writeln('# SQUARES NORTH =');
  writeln('# SQUARES DOWN  =');

  do {
    gotoxy(18, 6);
    write([ deltaew, 4 ]);
    gotoxy(18, 7);
    write([ deltans, 4 ]);
    gotoxy(18, 8);
    write([ deltaud, 4 ]);
    gotoxy(41, 0);
    await getkey();

    if (g.inchar === chr(CRETURN)) {
      teleport();
    } else if (g.inchar === 'N') {
      deltans = deltans + 1;
    } else if (g.inchar === 'S') {
      deltans = deltans - 1;
    } else if (g.inchar === 'E') {
      deltaew = deltaew + 1;
    } else if (g.inchar === 'W') {
      deltaew = deltaew - 1;
    } else if (g.inchar === 'D') {
      deltaud = deltaud + 1;
    } else if (g.inchar === 'U') {
      deltaud = deltaud - 1;
    }
  } while (g.inchar !== chr(27));

  g.xgoto = Xgoto.xbk2cmp2;
  g.llbase04 = charx;
  exit('UTILITIE');
}


/** SEGMENT PROCEDURE UTILITIE. */
export async function utilitie(): Promise<void> {
  await withExit('UTILITIE', async (): Promise<void> => {
    if (g.xgoto !== Xgoto.xnewmaze) {
      textmode();
    }

    switch (g.xgoto) {
      case Xgoto.xcampstf:
        // The camp has one XGOTO for five different things, so BASE12 carries which. Each of them
        // sets XGOTO itself on the way out, and only three always make it XBK2CMP2: IDITEM can end
        // XEQPDSP and MALOR can end XCEMETRY, XCHK4WIN or XNEWMAZE.
        if (g.base12 === Xgoto.xdone) {
          await rdspells();
        } else if (g.base12 === Xgoto.xtrainin) {
          await iditem();
        } else if (g.base12 === Xgoto.xcastle) {
          await kandifnd();
        } else if (g.base12 === Xgoto.xgilgams) {
          await dumapic();
        } else if (g.base12 === Xgoto.xinspect) {
          await malor();
        }

        break;

      case Xgoto.xnewmaze:
        newmaze();
        break;

      case Xgoto.xequip6:
      case Xgoto.xcmp2eq6:
        await equip6();
        break;

      case Xgoto.xreorder:
        await reorder();
        break;

      case Xgoto.xeqpdsp:
        // LLBASE04 >= 0 equips the one character it names, and EQUIP1 leaves XBCK2CMP, which is
        // back to their sheet; LLBASE04 = -1 equips the whole party and this arm sets XINSPCT2
        // itself, which is the camp's party list. Only E) on that party list sets -1. E) on the
        // sheet and IDITEM's curse both name a character, so both take the first branch. (The
        // party-wide arm is not the way into the maze - that is EQUIP6, three cases above.)
        if (g.llbase04 >= 0) {
          await equip1(g.llbase04);
        } else {
          for (chari = 0; chari <= (g.partycnt - 1); chari++) {
            await equip1(chari);
          }

          g.xgoto = Xgoto.xinspct2;
        }

        break;

      default:
        break;
    }
  });
}
