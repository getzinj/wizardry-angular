// Wiz1C.DSK/CASTLE.TEXT.txt - the castle, and Gilgamesh's Tavern inside it.
//
// This is where a party is put together. Adding a character marks their roster record as being out
// in the maze and writes it back, which is what stops two parties taking the same character; the
// mark comes off again when they leave the party, and nowhere else. A party that never comes home
// leaves its members marked out, which is exactly what the original did.
//
// The copy-protection checks - CPCALLED and the MVCURSOR( 70, 0) crash it guarded - are not ported.

import { Zone, character, scenarioToc } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { disk } from '../runtime/runtime';
import { CRETURN, PARTY_MAXIMUM, Talign, Tstatus, Xgoto, g } from './wiz';
import { centstr, chr, getcharx, getkey, getline, gotoxy, ord, random, unitclear, write, writeln } from './wiz2';

/** The party's alignment, which decides who may join it. */
let prtyalgn: Talign = Talign.neutral;


/** GETPASS. One or two X's per character, so what is on screen says nothing about the length. */
export async function getpass(): Promise<string> {
  let password: string = '';

  do {
    await getkey();

    if (g.inchar !== chr(CRETURN)) {
      if (password.length < 15) {
        for (let randx: number = 0; randx <= (random() % 2); randx++) {
          write(chr(88));
        }

        password = password + g.inchar;
      } else {
        write(chr(7));
      }
    }
  } while (g.inchar !== chr(CRETURN));

  writeln();

  return password;
}


/** CHARINFO. One party member's line: name, alignment and class, armour class, hits and state. */
export function charinfo(charx: number): void {
  const who: ICharacter = g.charactr[charx];

  gotoxy(0, 5 + charx);
  write(chr(29), [ charx + 1, 2 ], ' ', who.name);
  gotoxy(19, 5 + charx);
  write(g.scntoc.alignmentNames[who.alignment].substring(0, 1), '-',
        g.scntoc.classNames[who.characterClass].substring(0, 3), ' ');

  if (who.armourClass > -10) {
    write([ who.armourClass, 2 ]);
  } else {
    write('LO');
  }

  write([ who.hitPoints, 5 ], ' ');

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


export function dsptitle(titlestr: string): void {
  gotoxy(0, 1);
  write('! CASTLE', [ titlestr, 30 ], ' !');
}


export function dspparty(title: string): void {
  gotoxy(0, 0);
  writeln('+--------------------------------------+');
  dsptitle(title);
  writeln();
  writeln('+----------- CURRENT PARTY: -----------+');
  writeln();
  writeln(' # CHARACTER NAME  CLASS AC HITS STATUS');

  for (let charx: number = 0; charx <= 5; charx++) {
    if (charx < g.partycnt) {
      charinfo(charx);
    } else {
      writeln(chr(29));
    }
  }

  writeln('+--------------------------------------+');
  write(chr(11));
}


/** The original re-reads the table of contents to force its dirty block pair out to the floppy. */
function gtscntoc(): void {
  g.scntoc = disk().read(Zone.toc, 0, scenarioToc);
}


/** SEGMENT-level GILGAMSH. Adding, removing and choosing who the party is. */
export async function gilgamsh(): Promise<void> {
  await withExit('GILGAMSH', async (): Promise<void> => {
    function getalign(): void {
      prtyalgn = Talign.neutral;

      for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
        if (g.charactr[g.llbase04].alignment !== Talign.neutral) {
          prtyalgn = g.charactr[g.llbase04].alignment;
        }
      }
    }

    function gilgmenu(): void {
      gotoxy(0, 13);
      write(chr(11), 'YOU MAY ');

      if (g.partycnt < PARTY_MAXIMUM) {
        write('A)DD A MEMBER');

        if (g.partycnt === 0) {
          writeln();
        } else {
          writeln(',');
        }

        write([ ' ', 8 ]);
      }

      if (g.partycnt > 0) {
        writeln('R)EMOVE A MEMBER,');
        write([ ' ', 8 ]);
        writeln('#) SEE A MEMBER,');
      } else {
        writeln(chr(29));
        writeln(chr(29));
      }

      writeln();
      writeln('OR PRESS [RETURN] TO LEAVE');
      write(chr(11));
    }

    async function addparty(): Promise<void> {
      await withExit('ADDPARTY', async (): Promise<void> => {
        async function exitaddp(exitstr: string): Promise<void> {
          await centstr(exitstr);
          exit('ADDPARTY');
        }

        gotoxy(0, 19);
        write('WHO WILL JOIN ? >');

        let charname: string = await getline();

        if ((charname === '') || (charname.length > 15)) {
          exit('ADDPARTY');
        }

        let chari: number = 0;

        g.charactr[g.partycnt] = disk().read(Zone.character, chari, character);

        while ((chari < g.scntoc.recordsOnDisk[Zone.character])
            && ((charname !== g.charactr[g.partycnt].name)
                || (g.charactr[g.partycnt].status === Tstatus.lost))) {
          chari = chari + 1;
          g.charactr[g.partycnt] = disk().read(Zone.character, chari, character);
        }

        if (chari === g.scntoc.recordsOnDisk[Zone.character]) {
          await exitaddp('** WHO? **');
        } else if (g.charactr[g.partycnt].inMaze || (g.charactr[g.partycnt].lostLocation[2] !== 0)) {
          await exitaddp('** OUT **');
        } else if (prtyalgn !== Talign.neutral) {
          if (g.charactr[g.partycnt].alignment !== Talign.neutral) {
            if (prtyalgn !== g.charactr[g.partycnt].alignment) {
              await exitaddp('** BAD ALIGNMENT **');
            }
          }
        }

        gotoxy(0, 20);
        write('ENTER PASSWORD  >');
        charname = await getpass();
        gotoxy(0, 21);

        if (charname !== g.charactr[g.partycnt].password) {
          await exitaddp('** THATS NOT IT **');
        }

        // The original also checked IORESULT here and cried '** WRITE-PROTECT CHEAT! **' at a
        // player who had taped over the notch to stop the disk recording that a character was
        // out. There is no notch to tape over now.
        g.chardisk[g.partycnt] = chari;
        g.charactr[g.partycnt].inMaze = true;
        disk().write(Zone.character, chari, character, g.charactr[g.partycnt]);

        g.partycnt = g.partycnt + 1;
        getalign();
        gtscntoc();
        charinfo(g.partycnt - 1);
      });
    }

    async function remove(): Promise<void> {
      await withExit('REMOVE', async (): Promise<void> => {
        const chari: number = await getcharx(false, 'WHO WILL LEAVE');

        if ((chari < 0) || (chari === g.partycnt)) {
          exit('REMOVE');
        }

        g.charactr[chari].inMaze = false;
        disk().write(Zone.character, g.chardisk[chari], character, g.charactr[chari]);

        if (chari !== (g.partycnt - 1)) {
          for (let charx: number = chari + 1; charx <= (g.partycnt - 1); charx++) {
            g.charactr[charx - 1] = g.charactr[charx];
            g.chardisk[charx - 1] = g.chardisk[charx];
          }
        }

        g.partycnt = g.partycnt - 1;
        getalign();
        dspparty('TAVERN');
      });
    }

    function exitcasl(): void {
      withExitSync('EXITCASL', (): void => {
        g.llbase04 = ord(g.inchar) - ord('1');

        if ((g.llbase04 < 0) || (g.llbase04 >= g.partycnt)) {
          exit('EXITCASL');
        }

        g.mazelev = -1;
        g.xgoto = Xgoto.xinspect;
        exit('CASTLE');
      });
    }

    getalign();
    dsptitle('TAVERN');

    for (;;) {
      unitclear();
      gilgmenu();
      gotoxy(41, 0);
      await getkey();

      if (g.inchar === chr(CRETURN)) {
        exit('GILGAMSH');
      }

      switch (g.inchar) {
        case 'A':
          if (g.partycnt < PARTY_MAXIMUM) {
            await addparty();
          }

          break;

        case 'R':
          if (g.partycnt > 0) {
            await remove();
          }

          break;

        case '1': case '2': case '3': case '4': case '5': case '6':
          if (g.partycnt > 0) {
            exitcasl();
          }

          break;

        default:
          break;
      }
    }
  });
}


export function goboltac(): void {
  dsptitle('SHOP');
  g.xgoto = Xgoto.xboltac;
  g.xgoto2 = Xgoto.xboltac;
  exit('CASTLE');
}


export function gotemple(): void {
  dsptitle('TEMPLE');
  g.xgoto = Xgoto.xcant;
  g.xgoto2 = Xgoto.xboltac;
  exit('CASTLE');
}
