// Wiz1A.DSK/SHOPS2.TEXT.txt - the Edge of Town, the cemetery, the check for having won, and the
// segment body they hang off.
//
// The Edge of Town is the junction: the maze is through it, and so are the training grounds, which
// cannot be reached from the castle at all. Leaving through it - for the maze, for training, or for
// good - is also the only place the party is put down, and putting the party down means clearing
// INMAZE on every one of them and writing their records back. A party that is never put down stays
// marked as out, and nobody else can take those characters.


import { Zone, character, scenarioToc } from '../data/layout/wiz-types';
import { word } from '../data/layout/ucsd-layout';
import { GRAPHICS_FONT_BLOCK, TEXT_FONT_BLOCK } from '../data/scenario-disk';
import { exit, withExit } from '../runtime/pascal-exit';
import { getrec, putrec } from './diskio';
import { boltac, cant } from './shops';
import { loadcharset } from './specials';
import type { ITwizlong } from './wiz';
import { CRETURN, Direction, Tattrib, Tstatus, Xgoto, g } from './wiz';
import { addlongs, chr, divlong, getkey, gotoxy, graphics, newlong, printchr, printnum,
         printstr, random, read, textmode, write, writeln } from './wiz2';
import { rt } from '../runtime/runtime';


/** EDGETOWN. */
async function edgetown(): Promise<void> {
  function entmaze(): void {
    gotoxy(0, 13);
    writeln(chr(11));
    writeln([ 'ENTERING', 24 ]);
    writeln([ g.scntoc.gameName, 20 + Math.floor(g.scntoc.gameName.length / 2) ]);
    gotoxy(41, 0);
    g.xgoto = Xgoto.xnewmaze;
    g.mazex = 0;
    g.mazey = 0;
    g.mazelev = -1;
    g.directio = Direction.north;
    exit('SHOPS');
  }

  /**
   * UPDCHARS. Everyone in the party is no longer out, so their records go back to the disk saying
   * so. The original followed this with a read of a record it did not want, purely to make its
   * block cache write the dirty pair out, and it had to: L)EAVE restarts the game, and INITGAME
   * clears CACHEWRI without flushing, so a pair still dirty at that point would take the whole
   * party down with it and leave them marked as out for good.
   *
   * The disk image is not the disk either, and ScenarioDisk.onChanged carries the same urgency:
   * the write below sets it going, and the disk is in storage before the player can do anything
   * else. The read is kept for the wait it cost, evicting the dirty pair as it did.
   */
  async function updchars(): Promise<void> {
    for (let x: number = 0; x <= (g.partycnt - 1); x++) {
      g.charactr[x].inMaze = false;
      await putrec(Zone.character, g.chardisk[x], character, g.charactr[x]);
    }

    await getrec(Zone.toc, 0, word());
    g.partycnt = 0;
    exit('SHOPS');
  }

  gotoxy(0, 13);

  if (g.partycnt === 0) {
    write(chr(11));
    writeln('YOU MAY GO TO THE T)RAINING GROUNDS,');
    writeln('RETURN TO THE C)ASTLE, OR L)EAVE THE');
    writeln('GAME.');
  } else {
    write(chr(11));
    writeln('YOU MAY ENTER THE M)AZE, THE T)RAINING');
    writeln('GROUNDS, C)ASTLE,  OR L)EAVE THE GAME.');
  }

  do {
    gotoxy(41, 0);
    await getkey();
  } while (!((g.inchar === 'T') || (g.inchar === 'C') || (g.inchar === 'L')
          || ((g.inchar === 'M') && (g.partycnt > 0))));

  if (g.inchar === 'M') {
    entmaze();
  } else if (g.inchar === 'T') {
    g.xgoto = Xgoto.xtrainin;
    await updchars();
  } else if (g.inchar === 'L') {
    g.xgoto = Xgoto.xdone;
    await updchars();
  } else {
    g.xgoto = Xgoto.xcastle;
    exit('SHOPS');
  }
}


/** The amulet. Carrying it out of the maze is what winning is. */
const AMULET: number = 94;

/** The box font's slots hold the tombstone in six rows of four, the last row jumping to X, Y, Z. */
const TOMBSTONE_ROWS: readonly string[] = [ '+,-.', '/012', '3456', '789:', ';<=>', '?XYZ' ];


/**
 * CEMETARY. Where a party that died together ends up. Anybody not already LOST is marked dead -
 * DEAD is a floor, not an assignment, so ashes stay ashes - loses half their gold and may lose
 * anything they were carrying that was not cursed to them, and is left where they fell, or lost
 * outright, which gets likelier the deeper the maze went. The LOST are skipped whole: no death, no
 * halving, no breakage, not even a write back to the disk. ROCK is why that guard is there: it
 * marks the whole party LOST and sends them straight here, and there is no point leaving a body
 * where it fell for somebody who landed in solid rock outside the dungeon.
 *
 * LLBASE04 is the loop counter throughout, so the global the rest of the game keeps a character
 * index in is walked over here and left at -2 on the way out.
 */
async function cemetary(): Promise<void> {
  let two: number = 0;

  /** TOMBSTON. A stone drawn out of the box font, then the name and age in the text one. */
  async function tombston(chari: number): Promise<void> {
    let tombx: number;
    let tomby: number;

    /** DSPTOMBL. */
    function dsptombl(tombchrs: string): void {
      rt().display.mvcursor(tombx, tomby);
      printstr(tombchrs);
      tomby = tomby + 1;
    }

    tombx = 20 * (chari % 2);
    tomby = 6 * Math.trunc(chari / 2);
    await loadcharset(GRAPHICS_FONT_BLOCK);
    rt().display.mvcursor(tombx, tomby);

    for (const row of TOMBSTONE_ROWS) {
      dsptombl(row);
    }

    // The age and the name go back in the readable font, and above where the drawing finished: the
    // rows the loop has already walked past are what TOMBY counting on leaves behind.
    await loadcharset(TEXT_FONT_BLOCK);
    rt().display.mvcursor(tombx + 1, tomby - 2);
    printnum(Math.trunc(g.charactr[chari].age / 52), 2);
    rt().display.mvcursor(tombx + 4, tomby - 4);
    printstr(g.charactr[chari].name);
  }

  /** BADSTUFF. */
  async function badstuff(): Promise<void> {

    /**
     * BREAKPOS. Luck against a roll for everything not cursed: what loses is set to object zero and
     * then compacted out of the list, so the slots close up and the count comes down.
     */
    function breakpos(): void {
      const who = g.charactr[g.llbase04];

      for (let possx: number = 1; possx <= who.possessions.count; possx++) {
        if (!who.possessions.items[possx - 1].cursed) {
          if ((random() % 21) > who.attributes[Tattrib.luck]) {
            who.possessions.items[possx - 1].objectIndex = 0;
          }
        }
      }

      let x: number = 0;

      for (let possx: number = 1; possx <= who.possessions.count; possx++) {
        if (who.possessions.items[possx - 1].objectIndex !== 0) {
          x = x + 1;
          Object.assign(who.possessions.items[x - 1], who.possessions.items[possx - 1]);
        }
      }

      who.possessions.count = x;
    }

    two = 2;

    for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
      if (g.charactr[g.llbase04].status !== Tstatus.lost) {
        const who = g.charactr[g.llbase04];

        if (who.status < Tstatus.dead) {
          who.status = Tstatus.dead;
        }

        who.inMaze = false;
        divlong(who.gold, two);
        breakpos();

        // The deeper they got, the likelier the body is never found again.
        if ((random() % 50) < g.mazelev) {
          who.lostLocation[0] = -1;
          who.lostLocation[1] = -1;
          who.lostLocation[2] = -1;
        } else {
          who.lostLocation[0] = g.mazex;
          who.lostLocation[1] = g.mazey;
          who.lostLocation[2] = g.mazelev;
        }

        await putrec(Zone.character, g.chardisk[g.llbase04], character, who);
      }
    }

    // The original re-reads the table of contents here to force the last of those writes out to
    // the floppy, and the read still does: it evicts the dirty pair, and the wait for that is paid.
    g.scntoc = await getrec(Zone.toc, 0, scenarioToc);
  }

  await badstuff();
  rt().display.hires.clrrect(0, 0, 40, 24);
  graphics();

  for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
    await tombston(g.llbase04);
  }

  // A box across the bottom three rows, drawn from the same font as the stones.
  await loadcharset(GRAPHICS_FONT_BLOCK);
  rt().display.mvcursor(0, 19);
  printchr(chr(33));

  for (g.llbase04 = 1; g.llbase04 <= 38; g.llbase04++) {
    printchr(chr(34));
  }

  printchr(chr(35));
  rt().display.mvcursor(0, 20);
  printchr(chr(36));
  rt().display.mvcursor(39, 20);
  printchr(chr(36));
  rt().display.mvcursor(0, 21);
  printchr(chr(39));

  for (g.llbase04 = 1; g.llbase04 <= 38; g.llbase04++) {
    printchr(chr(34));
  }

  printchr(chr(40));
  rt().display.mvcursor(0, 22);
  printchr(chr(36));
  rt().display.mvcursor(39, 22);
  printchr(chr(36));
  rt().display.mvcursor(0, 23);
  printchr(chr(37));

  for (g.llbase04 = 1; g.llbase04 <= 38; g.llbase04++) {
    printchr(chr(34));
  }

  printchr(chr(38));
  await loadcharset(TEXT_FONT_BLOCK);
  rt().display.mvcursor(1, 20);
  printstr('YOUR ENTIRE PARTY HAS BEEN SLAUGHTERED');
  rt().display.mvcursor(1, 22);
  printstr('  PRESS RETURN TO LEAVE THE CEMETERY  ');
  g.partycnt = 0;

  do {
    await getkey();
  } while (g.inchar !== chr(CRETURN));

  write(chr(12));
  gotoxy(41, 0);

  // -2 is what SPECIALS reads as "only put the screen back", the same as a disbanded party.
  g.llbase04 = -2;
  g.xgoto = Xgoto.xscnmsg;
  exit('SHOPS');
}


/**
 * CHK4WIN. Reaching level zero is what brings a party here, and the stairs up out of level one are
 * the ordinary way to do it: NEWMAZE sends MAZELEV = 0 straight on to XCHK4WIN. A teleport into
 * mid-air, one into the moat, a chute and TOSHOPS arrive the same way. So this is also where the
 * game is won, because carrying the amulet up those stairs is what winning is: anybody holding it
 * wins for the whole party.
 *
 * Not every way out of the maze comes through here. A party that dies together goes to the
 * cemetery, and one that disbands in camp leaves by the door that only puts the screen back.
 *
 * Whatever happened, everybody's recorded position is cleared, INMAZE is set for the ones still
 * standing, and the party is closed up so only they are still in it.
 */
async function chk4win(): Promise<void> {
  let possi: number = 0;
  let charx: number = 0;
  let wongame: boolean = false;

  /**
   * CONGRATS. The reward for winning: two hundred and fifty thousand experience each, every piece
   * of equipment gone, and all but the last four digits of the gold with it. The chevron that marks
   * the honour guard is bit zero of the fourth awards word, which is what the character sheet reads
   * to draw it, so the boast outlives the party that earned it.
   *
   * The heading goes on before TEXTMODE, but it is not lost by it: TEXTMODE is MVCURSOR(50, 0),
   * the soft switch and nothing else, so it reveals the text page with the heading already at the
   * top of it. What CHR(12) cleared a moment earlier is that same page.
   */
  async function congrats(): Promise<void> {
    const expbonus: ITwizlong = newlong(0, 25, 0);

    for (charx = 0; charx <= (g.partycnt - 1); charx++) {
      const who = g.charactr[charx];

      who.possessions.count = 0;
      who.gold.high = 0;
      who.gold.mid = 0;
      addlongs(who.experience, expbonus);
      who.lostLocation[3] = who.lostLocation[3] | 1;
    }

    write(chr(12));
    writeln([ '*** CONGRATULATIONS ***', 32 ]);
    textmode();
    writeln();
    writeln( 'YOU HAVE COMPLETED YOUR QUEST AND THE');
    writeln( 'AMULET IS NOW BACK IN THE HANDS OF');
    writeln( 'YOUR BENIFICENT RULER, TREBOR.');
    writeln();
    writeln( 'IN RETURN FOR THIS, HE GRANTS YOU A');
    writeln( 'BOON OF 250,000 EXPERIENCE POINTS');
    writeln( 'EACH!');
    writeln();
    writeln( 'ADDITIONALLY, YOU WILL BE INITIATED');
    writeln( `INTO THE OVERLORD'S HONOR GUARD AND`);
    writeln( 'THUS WILL BE ENTITLED TO WEAR THE');
    writeln( 'CHEVRON (>) OF THIS RANK EVERMORE.');
    writeln();
    writeln( 'HOWEVER, YOU MUST GIVE UP ALL YOUR');
    writeln( 'EQUIPMENT AND MOST OF YOUR MONEY TO');
    writeln( 'PAY FOR YOUR INITIATION.');
    writeln();
    writeln('PRESS [RETURN], HONORED ONES');
    gotoxy(41, 0);

    // READLN, which waits for the line to end without the polling loop that stirs the generator.
    do {
      await read();
    } while (g.inchar !== chr(CRETURN));

    write(chr(12));
  }

  wongame = false;

  for (charx = 0; charx <= (g.partycnt - 1); charx++) {
    for (possi = 1; possi <= g.charactr[charx].possessions.count; possi++) {
      if (g.charactr[charx].possessions.items[possi - 1].objectIndex === AMULET) {
        wongame = true;
      }
    }

    g.charactr[charx].lostLocation[0] = 0;
    g.charactr[charx].lostLocation[1] = 0;
    g.charactr[charx].lostLocation[2] = 0;
  }

  if (wongame) {
    await congrats();
  }

  for (charx = 0; charx <= (g.partycnt - 1); charx++) {
    g.charactr[charx].inMaze = g.charactr[charx].status === Tstatus.ok;
    await putrec(Zone.character, g.chardisk[charx], character, g.charactr[charx]);
  }

  // The original reads two bytes of the table of contents over the top of CHARX here, which the
  // next line overwrites anyway: the read is for the flush it forces, not for what it lands on.
  // CEMETARY's version of the same trick reads the whole record into SCNTOC and so is carried
  // across above; this one lands nowhere, so what is kept is the wait: the dirty pair going out and
  // the table of contents coming in.
  await getrec(Zone.toc, 0, word());
  charx = 0;
  possi = 0;

  // Closes the party up over anyone who is not standing, keeping the rest in their marching order.
  // The original's record assignment copies; this moves the reference, as REMOVE in the castle and
  // every party swap already do. The slot left pointing at the same record is always at or past the
  // new PARTYCNT, and the only thing that ever fills a slot again is a fresh read off the disk, so
  // the two never both count as in the party.
  while (charx < g.partycnt) {
    g.charactr[possi] = g.charactr[charx];
    g.chardisk[possi] = g.chardisk[charx];

    if (g.charactr[possi].status === Tstatus.ok) {
      possi = possi + 1;
    }

    charx = charx + 1;
  }

  g.partycnt = possi;
  g.xgoto = Xgoto.xcastle;
  exit('SHOPS');
}


/** SEGMENT PROCEDURE SHOPS. */
export async function shops(): Promise<void> {
  await withExit('SHOPS', async (): Promise<void> => {
    switch (g.xgoto) {
      case Xgoto.xcemetry:
        await cemetary();
        break;

      case Xgoto.xcant:
        await cant();
        break;

      case Xgoto.xboltac:
        await boltac();
        break;

      case Xgoto.xchk4win:
        await chk4win();
        break;

      case Xgoto.xedgtown:
        await edgetown();
        break;

      default:
        break;
    }
  });
}
