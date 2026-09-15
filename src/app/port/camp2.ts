// Wiz1C.DSK/CAMP2.TEXT.txt - the character sheet itself, the party list the camp opens on, and the
// CAMP segment's own body, which is where the original puts it.
//
// The sheet is one screen, and DISPSTAT says whether to draw it: it is true on entering the segment
// and set true again after every menu, but each of the things the menu leads to clears it, so the
// turn straight after one of them leaves the sheet as it was and its message readable. Which menu
// goes under the sheet depends on how the party got here: from the castle there is no fighting to
// prepare for, from the training grounds the character may not even be in a party, and in the maze
// they can do everything.

import { Zone, character, scenarioToc } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import { exit, withExit } from '../runtime/pascal-exit';
import { getrec, putrec } from './diskio';
import { aastraa, campvar, castspel, clrobjids, dropitem, dspitems, dspspels, useitem } from './camp';
import {
  CRETURN, Tattrib, Tclass, Tstatus, Xgoto, g,
} from './wiz';
import {
  addlongs, chr, getcharx, getkey, getline, gotoxy, ord, prntlong, read, sublongs, testlong,
  textmode, unitclear, write, writeln,
} from './wiz2';
import { multlong, newlong } from './wiz2';
import type { ITwizlong } from './wiz';

/** The sixteen honours a character can be awarded, as the marks the sheet prints them against. */
const AWARD_MARKS: string = '>!$#&*<?BCPKODG@';

/** Weeks in one of the years the sheet shows an age in. */
const WEEKS_PER_YEAR: number = 52;

/** Items a character can carry. */
const POSSESSION_SLOTS: number = 8;

/** Digits of gold a trade will read before it calls the amount nonsense. */
const GOLD_DIGITS: number = 12;


/** IDENTIFY. A bishop can tell what something is, which UTILITIE does and then comes back. */
async function identify(): Promise<void> {
  await withExit('IDENTIFY', async (): Promise<void> => {
    async function exitidnt(exitstr: string): Promise<void> {
      await aastraa(exitstr);
      exit('IDENTIFY');
    }

    campvar.dispstat = false;

    if (g.charactr[campvar.campchar].characterClass !== Tclass.bishop) {
      await exitidnt('NOT BISHOP');
    }

    g.llbase04 = campvar.campchar;
    g.base12 = Xgoto.xtrainin;
    g.xgoto = Xgoto.xcampstf;
    exit('CAMP');
  });
}


/** DOTRADE. Handing gold and then items to somebody else in the party. */
async function dotrade(): Promise<void> {
  await withExit('DOTRADE', async (): Promise<void> => {
    const gold2tra: ITwizlong = newlong();
    let tradeto: number = 0;
    let temp0001: number = 0;
    let itemx: number = 0;

    async function exittrad(exitstr: string): Promise<void> {
      await aastraa(exitstr);
      exit('DOTRADE');
    }

    /**
     * TRADGOLD. The amount is typed rather than picked, and is read a digit at a time into the
     * twelve-digit decimal the game keeps gold in: the running total is multiplied by ten and the
     * digit added. Anything that is not a digit, or a thirteenth of them, makes the whole amount
     * nonsense rather than stopping where it went wrong.
     */
    async function tradgold(): Promise<void> {
      const tempgold: ITwizlong = newlong();

      gotoxy(0, 18);
      write(chr(11));
      write('AMT OF GOLD ? >');

      const goldstr: string = await getline();

      tempgold.low = 0;
      tempgold.mid = 0;
      tempgold.high = 0;
      gold2tra.low = 0;
      gold2tra.mid = 0;
      gold2tra.high = 0;
      temp0001 = 0;

      const mult10: number = 10;

      for (let goldx: number = 1; goldx <= goldstr.length; goldx++) {
        if ((ord(goldstr[goldx - 1]) < ord('0'))
            || (ord(goldstr[goldx - 1]) > ord('9'))
            || (goldx > GOLD_DIGITS)
            || (temp0001 === -1)) {
          temp0001 = -1;
        } else {
          multlong(gold2tra, mult10);
          tempgold.low = ord(goldstr[goldx - 1]) - ord('0');
          addlongs(gold2tra, tempgold);
        }
      }

      if (temp0001 === -1) {
        await exittrad('BAD AMT');
      }

      if (testlong(g.charactr[campvar.campchar].gold, gold2tra) < 0) {
        await exittrad('NOT ENOUGH $');
      }

      addlongs(g.charactr[tradeto].gold, gold2tra);
      sublongs(g.charactr[campvar.campchar].gold, gold2tra);
    }

    /** TRADITEM. Item after item until a bare return, and a full pack ends the whole trade. */
    async function traditem(): Promise<void> {
      for (;;) {
        do {
          gotoxy(0, 18);
          write(chr(11));
          write('WHAT ITEM ([RET] EXITS) ? >');
          await getkey();
          itemx = ord(g.inchar) - ord('0');

          if (g.inchar === chr(CRETURN)) {
            exit('DOTRADE');
          }
        } while (!((itemx > 0)
                   && (itemx <= g.charactr[campvar.campchar].possessions.count)));

        const giving: ICharacter['possessions'] = g.charactr[campvar.campchar].possessions;
        const taking: ICharacter['possessions'] = g.charactr[tradeto].possessions;

        if (taking.count === POSSESSION_SLOTS) {
          await exittrad('FULL');
        }

        if (giving.items[itemx - 1].cursed) {
          await exittrad('CURSED');
        }

        if (giving.items[itemx - 1].equipped) {
          await exittrad('EQUIPPED');
        }

        temp0001 = taking.count + 1;
        Object.assign(taking.items[temp0001 - 1], giving.items[itemx - 1]);
        taking.count = temp0001;

        for (temp0001 = itemx + 1; temp0001 <= giving.count; temp0001++) {
          Object.assign(giving.items[temp0001 - 2], giving.items[temp0001 - 1]);
        }

        giving.count = giving.count - 1;
        await dspitems();
      }
    }

    campvar.dispstat = false;

    do {
      tradeto = await getcharx(true, 'TRADE WITH');

      if (tradeto === -1) {
        exit('DOTRADE');
      }
    } while (tradeto === campvar.campchar);

    await tradgold();
    await traditem();
  });
}


/** CAMPDO. One turn of the character sheet: draw it, take a key, do that thing. */
async function campdo(): Promise<void> {
  await withExit('CAMPDO', async (): Promise<void> => {
    let menutype: number = 0;

    async function campmenu(): Promise<void> {
      const who: ICharacter = g.charactr[campvar.campchar];

      /**
       * DSPSTATS. The sheet. Six attributes down the left, gold, experience, level, age, hit points,
       * armour class and status down the right, then the spell counts and what they are carrying.
       */
      async function dspstats(): Promise<void> {
        /** CHEVRONS. The honours, as marks between quotes: one per bit of the fourth lost word. */
        function chevrons(): void {
          const lostxyl4: number = who.lostLocation[3];

          write('"');

          for (let indx: number = 0; indx <= 15; indx++) {
            if ((lostxyl4 & (1 << indx)) !== 0) {
              write(AWARD_MARKS.substring(indx, indx + 1));
            }
          }

          write('" ');
        }

        write(chr(12));
        write(who.name);
        write(' ');

        if (who.lostLocation[3] > 0) {
          chevrons();
        }

        write(g.scntoc.raceNames[who.race]);
        write(' ');
        write(g.scntoc.alignmentNames[who.alignment].substring(0, 1));
        write('-');
        write(g.scntoc.classNames[who.characterClass]);
        writeln();
        writeln();
        write([ 'STRENGTH', 12 ], [ who.attributes[Tattrib.strength], 3 ], [ 'GOLD ', 9 ]);
        prntlong(who.gold);
        writeln();
        write([ 'I.Q.', 12 ], [ who.attributes[Tattrib.iq], 3 ], [ 'EXP ', 9 ]);
        prntlong(who.experience);
        writeln();
        write([ 'PIETY', 12 ], [ who.attributes[Tattrib.piety], 3 ]);
        writeln();
        write([ 'VITALITY', 12 ], [ who.attributes[Tattrib.vitality], 3 ],
              [ 'LEVEL ', 9 ], [ who.level, 3 ],
              [ 'AGE ', 9 ], [ Math.trunc(who.age / WEEKS_PER_YEAR), 3 ]);
        writeln();
        write([ 'AGILITY', 12 ], [ who.attributes[Tattrib.agility], 3 ],
              [ 'HITS ', 9 ], [ who.hitPoints, 3 ], '/', [ who.maximumHitPoints, 3 ],
              [ 'AC', 4 ], [ who.armourClass - g.acmod2, 4 ]);
        writeln();
        write([ 'LUCK', 12 ], [ who.attributes[Tattrib.luck], 3 ],
              [ 'STATUS ', 9 ], g.scntoc.statusNames[who.status]);

        if (who.lostLocation[0] > 0) {
          write(' & POISONED');
        }

        writeln();
        dspspels();
        await dspitems();
      }

      if (campvar.dispstat) {
        await dspstats();
      }

      gotoxy(0, 18);

      // Which menu: the training grounds get the one that only reads spell books, the castle the one
      // without the fighting, and the maze everything - unless the character is in no state for it.
      if (g.xgoto === Xgoto.xinspct3) {
        menutype = 0;
      } else if (g.xgoto === Xgoto.xinspect) {
        menutype = 1;
      } else if (who.status === Tstatus.ok) {
        menutype = 2;
      } else {
        menutype = 1;
      }

      if (menutype === 2) {
        write(chr(11));
        writeln('YOU MAY E)QUIP, D)ROP AN ITEM, T)RADE,');
        write([ ' ', 8 ]);
        writeln('R)EAD SPELL BOOKS, CAST S)PELLS,');
        write([ ' ', 8 ]);
        writeln('U)SE AN ITEM, I)DENTIFY AN ITEM,');
        write([ ' ', 8 ]);
        writeln('OR L)EAVE.');
      } else if (menutype === 1) {
        write(chr(11));
        writeln('YOU MAY E)QUIP, D)ROP AN ITEM, T)RADE,');
        write([ ' ', 8 ]);
        writeln('R)EAD SPELL BOOKS, OR L)EAVE.');
      } else {
        write(chr(11));
        writeln('YOU MAY R)EAD SPELL BOOKS OR L)EAVE.');
      }
    }

    await campmenu();
    campvar.dispstat = true;

    do {
      gotoxy(41, 0);
      await getkey();
    } while (!((g.inchar === 'R') || (g.inchar === 'L')
               || ((menutype > 0)
                   && ((g.inchar === 'T') || (g.inchar === 'D') || (g.inchar === 'E')))
               || ((menutype > 1)
                   && ((g.inchar === 'I') || (g.inchar === 'S') || (g.inchar === 'U')))));

    const chosen: string = g.inchar;

    switch (chosen) {
      case 'L':
        exit('CAMPDO');
        break;

      case 'E':
        if (menutype > 0) {
          g.xgoto = Xgoto.xeqpdsp;
          g.llbase04 = campvar.campchar;
          exit('CAMP');
        }
        break;

      case 'R':
        g.xgoto = Xgoto.xcampstf;
        g.base12 = Xgoto.xdone;
        g.llbase04 = campvar.campchar;
        exit('CAMP');
        break;

      case 'D':
        if (menutype > 0) {
          await dropitem();
        }
        break;

      case 'I':
        if (menutype === 2) {
          await identify();
        }
        break;

      case 'S':
        if (menutype === 2) {
          await castspel(-1);
        }
        break;

      case 'U':
        if (menutype === 2) {
          await useitem();
        }
        break;

      case 'T':
        await dotrade();
        break;

      default:
        break;
    }
  });
}


/**
 * INSPECT. The character sheet, for whoever LLBASE04 names, until L) leaves it.
 *
 * Where the party came from is remembered in XGOTO2 rather than XGOTO, because anything the sheet
 * does that needs another segment comes back here afterwards and has to know which of the three
 * sheets this was.
 */
async function inspect(): Promise<void> {
  campvar.campchar = g.llbase04;
  g.xgoto2 = g.xgoto;
  write(chr(12));

  do {
    await campdo();
  } while (g.inchar !== 'L');

  write(chr(12));
}


/** CAMPMEN2. The party as it stands, and what may be done with it. */
function campmen2(): void {
  function dsp1line(charx: number): void {
    const who: ICharacter = g.charactr[charx];

    gotoxy(0, 3 + charx);
    write(chr(29), [ charx + 1, 2 ], ' ', who.name);
    gotoxy(19, 3 + charx);
    write(g.scntoc.alignmentNames[who.alignment].substring(0, 1), '-',
          g.scntoc.classNames[who.characterClass].substring(0, 3), ' ');

    if ((who.armourClass - g.acmod2) > -10) {
      write([ who.armourClass - g.acmod2, 2 ]);
    } else {
      write('LO');
    }

    write([ who.hitPoints, 5 ]);
    g.llbase04 = who.healingPerTurn - who.lostLocation[0];

    if (g.llbase04 > 0) {
      write('+');
    } else if (g.llbase04 < 0) {
      write('-');
    } else {
      write(' ');
    }

    if (who.status === Tstatus.ok) {
      if (who.lostLocation[0] !== 0) {
        writeln('POISON');
      } else {
        writeln([ who.maximumHitPoints, 4 ]);
      }
    } else {
      writeln(g.scntoc.statusNames[who.status]);
    }
  }

  write(chr(12));
  writeln([ 'CAMP', 22 ]);
  writeln();
  writeln(' # CHARACTER NAME  CLASS AC HITS STATUS');

  for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
    dsp1line(charx);
  }

  gotoxy(0, 12);
  writeln('YOU MAY R)EORDER, E)QUIP, D)ISBAND,');
  write([ ' ', 8 ]);
  writeln('#) TO INSPECT, OR');
  write([ ' ', 8 ]);
  writeln('L)EAVE THE CAMP.');
}


/**
 * DISBAND. Leaves the whole party where it stands, with their records saying where that was, so
 * they can be found again - and ages every one of them by twenty-five weeks for the trouble.
 */
async function disband(): Promise<void> {
  await withExit('DISBAND', async (): Promise<void> => {
    async function confirm(nullre: string): Promise<void> {
      write(chr(12), nullre, 'CONFIRM (Y/N) ?');

      do {
        gotoxy(41, 0);
        await read();
      } while (!((g.inchar === 'Y') || (g.inchar === 'N')));

      if (g.inchar === 'N') {
        exit('DISBAND');
      }
    }

    await confirm('');
    await confirm('RE-');

    for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
      const who: ICharacter = g.charactr[g.llbase04];

      who.inMaze = false;
      who.lostLocation[0] = g.mazex;
      who.lostLocation[1] = g.mazey;
      who.lostLocation[2] = g.mazelev;
      who.age = who.age + 25;
      await putrec(Zone.character, g.chardisk[g.llbase04], character, who);
    }

    g.scntoc = await getrec(Zone.toc, 0, scenarioToc);
    g.llbase04 = -2;
    g.xgoto = Xgoto.xscnmsg;
    exit('CAMP');
  });
}


/** SEGMENT PROCEDURE CAMP. */
export async function camp(): Promise<void> {
  await withExit('CAMP', async (): Promise<void> => {
    // The sheet is drawn on the first turn of every visit, and nothing carried over from the last
    // one is believed: the two things the segment does before anything else.
    campvar.dispstat = true;
    clrobjids();
    textmode();

    if ((g.xgoto === Xgoto.xbck2cmp) || (g.xgoto === Xgoto.xbk2cmp2)) {
      g.xgoto = g.xgoto2;

      if (g.xgoto === Xgoto.xinspct2) {
        await inspect();
      }
    }

    if (g.xgoto === Xgoto.xinspect) {
      await inspect();
      g.xgoto = Xgoto.xgilgams;
      exit('CAMP');
    }

    if (g.xgoto === Xgoto.xinspct3) {
      // The training grounds send one character, which ROLLER has already put in slot 0 with
      // PARTYCNT := 1, so naming slot 0 here picks out the one that was asked for.
      g.llbase04 = 0;
      await inspect();
      g.xgoto = Xgoto.xbck2rol;
      exit('CAMP');
    }

    for (;;) {
      unitclear();
      campmen2();
      gotoxy(41, 0);
      await getkey();

      if ((g.inchar > '0') && (g.inchar <= chr(ord('0') + g.partycnt))) {
        g.llbase04 = ord(g.inchar) - ord('1');
        clrobjids();
        await inspect();
      } else {
        switch (g.inchar) {
          case 'R':
            g.xgoto = Xgoto.xreorder;
            exit('CAMP');
            break;

          case 'L':
            g.xgoto = Xgoto.xcmp2eq6;
            exit('CAMP');
            break;

          case 'E':
            g.xgoto = Xgoto.xeqpdsp;
            g.llbase04 = -1;
            exit('CAMP');
            break;

          case 'D':
            await disband();
            break;

          default:
            break;
        }
      }
    }
  });
}
