// Wiz1C.DSK/ROLLER.TEXT.txt - the training grounds, where characters are made.
//
// Everything here is the text screen: roll a character, name them, spend the bonus points, pick a
// class the scores allow, and write the record onto the scenario disk. The roster is that disk's
// character zone, so making a character is a disk write and nothing else - there is no save file
// and never was.

import { Zone, character, scenarioToc } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import { exit, withExit } from '../runtime/pascal-exit';
import { fillrec, getrec, putrec } from './diskio';
import { CRETURN, Talign, Tattrib, Tclass, Trace, Tstatus, Xgoto, blankchar, g, setspelgrp } from './wiz';
import { chr, getkey, getline, gotoxy, ord, random, write, writeln } from './wiz2';

const ATTRIBUTE_COUNT: number = 6;
const CLASS_COUNT: number = 8;

// Segment-level VARs. The original declares them once for the whole segment and its procedures
// read and write them directly, which is why they are module state here rather than parameters.

let charrec: ICharacter = blankchar();
let tempx: number = 0;
let characx: number = 0;
let ptsleft: number = 0;
let charname: string = '';
let chg2lst: boolean[] = new Array<boolean>(CLASS_COUNT).fill(false);
let baseattr: number[] = new Array<number>(ATTRIBUTE_COUNT).fill(0);
let sixattr2: number[] = new Array<number>(ATTRIBUTE_COUNT).fill(0);


/**
 * GETPASS. Echoes one or two X's per character so the length on screen says nothing about the
 * length of the password - and draws a random number for each, which is why it is here and not
 * in WIZ2 with the other input.
 */
async function getpass(): Promise<string> {
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


/** GTCHGLST. Which classes the six scores and the alignment allow, and whether any of them do. */
function gtchglst(): boolean {
  chg2lst[Tclass.fighter] = sixattr2[Tattrib.strength] >= 11;

  chg2lst[Tclass.mage] = sixattr2[Tattrib.iq] >= 11;

  chg2lst[Tclass.priest] = (sixattr2[Tattrib.piety] >= 11)
      && (charrec.alignment !== Talign.neutral);

  chg2lst[Tclass.thief] = (sixattr2[Tattrib.agility] >= 11)
      && (charrec.alignment !== Talign.good);

  chg2lst[Tclass.bishop] = (sixattr2[Tattrib.iq] >= 12)
      && (sixattr2[Tattrib.piety] >= 12)
      && (charrec.alignment !== Talign.neutral);

  chg2lst[Tclass.samurai] = (sixattr2[Tattrib.strength] >= 15)
      && (sixattr2[Tattrib.iq] >= 11)
      && (sixattr2[Tattrib.piety] >= 10)
      && (sixattr2[Tattrib.vitality] >= 14)
      && (sixattr2[Tattrib.agility] >= 10)
      && (charrec.alignment !== Talign.evil);

  chg2lst[Tclass.lord] = (sixattr2[Tattrib.strength] >= 15)
      && (sixattr2[Tattrib.iq] >= 12)
      && (sixattr2[Tattrib.piety] >= 12)
      && (sixattr2[Tattrib.vitality] >= 15)
      && (sixattr2[Tattrib.agility] >= 14)
      && (sixattr2[Tattrib.luck] >= 15)
      && (charrec.alignment === Talign.good);

  chg2lst[Tclass.ninja] = (sixattr2[Tattrib.strength] >= 17)
      && (sixattr2[Tattrib.iq] >= 17)
      && (sixattr2[Tattrib.piety] >= 17)
      && (sixattr2[Tattrib.vitality] >= 17)
      && (sixattr2[Tattrib.agility] >= 17)
      && (sixattr2[Tattrib.luck] >= 17)
      && (charrec.alignment === Talign.evil);

  return chg2lst.some((allowed: boolean): boolean => allowed);
}


/** SETBASE. The scores a race starts with, written as digits so ':' is ten and '?' is fifteen. */
function setbase(): void {
  function setxbase(basestr: string): void {
    for (let attri: number = 0; attri < ATTRIBUTE_COUNT; attri++) {
      baseattr[attri] = ord(basestr[attri]) - ord('0');
    }
  }

  switch (charrec.race) {                       //  S, I, P, V, A, L
    case Trace.human:  setxbase('885889'); break;  //  8  8  5  8  8  9
    case Trace.elf:    setxbase('7::696'); break;  //  7 10 10  6  9  6
    case Trace.dwarf:  setxbase(':7::56'); break;  // 10  7 10 10  5  6
    case Trace.gnome:  setxbase('77:8:7'); break;  //  7  7 10  8 10  7
    case Trace.hobbit: setxbase('5776:?'); break;  //  5  7  7  6 10 15
    default: break;
  }
}


async function getcharc(chindx: number): Promise<ICharacter> {
  return await getrec(Zone.character, chindx, character);
}


async function putcharc(buffer: ICharacter, chindx: number): Promise<void> {
  await putrec(Zone.character, chindx, character, buffer);
}


/**
 * GTSCNTOC. The original re-reads the table of contents after writing a character, because doing
 * so evicted the dirty block pair and so forced it out to the floppy. The read still evicts it
 * here, and so still costs the write; it is also how the game notices a disk swapped underneath it.
 */
async function gtscntoc(): Promise<void> {
  g.scntoc = await getrec(Zone.toc, 0, scenarioToc);
}


/** MAKECHAR. Rolls a character from nothing and writes them into the slot CHARACX points at. */
async function makechar(): Promise<void> {
  await withExit('MAKECHAR', async (): Promise<void> => {
    function initchar(): void {
      charrec = blankchar();
      charrec.name = charname;
      charrec.age = (18 * 52) + (random() % 300);
      charrec.gold.low = 90 + (random() % 100);
      charrec.status = Tstatus.ok;

      for (let lsi: number = 0; lsi <= 4; lsi++) {
        charrec.skills[lsi] = 16;
      }

      charrec.maximumLevel = 1;
      charrec.level = 1;
      charrec.armourClass = 10;
    }

    function p010b0b(): void {
      gotoxy(0, 15);
      write(chr(11));
    }

    function p010b0c(): void {
      gotoxy(0, 15);
      write(chr(29));
    }

    async function makemenu(): Promise<void> {
      let passwd: string = '';

      write(chr(12));
      write([ 'NAME ', 10 ]);
      writeln(charrec.name);
      writeln([ 'PASSWORD', 9 ]);
      writeln([ 'RACE', 9 ]);
      writeln([ 'POINTS', 9 ]);
      writeln();
      writeln([ 'STRENGTH', 9 ]);
      writeln([ 'I.Q.', 9 ]);
      writeln([ 'PIETY', 9 ]);
      writeln([ 'VITALITY', 9 ]);
      writeln([ 'AGILITY', 9 ]);
      writeln([ 'LUCK', 9 ]);
      writeln();
      writeln('ALIGNMENT');
      writeln([ 'CLASS', 9 ]);
      writeln();

      do {
        p010b0b();
        writeln('ENTER A PASSWORD ([RET] FOR NONE)');
        gotoxy(10, 1);
        write(chr(29));
        gotoxy(10, 1);
        charname = await getpass();

        if (charname.length > 15) {
          charname = charname.substring(0, 15);
        }

        p010b0b();
        writeln('ENTER IT AGAIN TO BE SURE');
        gotoxy(10, 1);
        write(chr(29));
        gotoxy(10, 1);
        passwd = await getpass();
      } while (passwd !== charname);

      charrec.password = charname;
    }

    async function chosrace(): Promise<void> {
      p010b0b();
      gotoxy(0, 17);

      for (let racei: Trace = Trace.human; racei <= Trace.hobbit; racei++) {
        write(chr(ord('@') + racei), ') ');
        writeln(g.scntoc.raceNames[racei]);
      }

      do {
        p010b0c();
        write('CHOOSE A RACE >');
        await getkey();
      } while (!((g.inchar >= 'A') && (g.inchar <= 'E')));

      gotoxy(10, 2);
      charrec.race = Trace.human;

      while (g.inchar > 'A') {
        g.inchar = chr(ord(g.inchar) - 1);
        charrec.race = charrec.race + 1;
      }

      write(g.scntoc.raceNames[charrec.race]);
      setbase();
    }

    async function givepts(): Promise<void> {
      let canchg: boolean = false;
      let attribx: Tattrib = Tattrib.strength;
      let classx: Tclass = Tclass.fighter;

      function ptsmenu(): void {
        gotoxy(0, 15);
        write(chr(11));
        writeln('ENTER [+,-] TO ALTER A SCORE,');
        writeln('      [RET] TO GO TO NEXT SCORE,');
        writeln('      [ESC] TO GO ON WHEN POINTS USED UP');
        ptsleft = 7 + (random() % 4);

        // UCSD Pascal evaluates both operands of AND, so the draw happens even once the points
        // have run past twenty and the loop is about to stop.
        for (;;) {
          const under: boolean = ptsleft < 20;
          const lucky: boolean = (random() % 11) === 10;

          if (under && lucky) {
            ptsleft = ptsleft + 10;
          } else {
            break;
          }
        }

        sixattr2 = [ ...baseattr ];

        for (let index: Tattrib = Tattrib.strength; index <= Tattrib.luck; index++) {
          gotoxy(10, 5 + index);
          write([ sixattr2[index], 2 ]);
        }

        attribx = Tattrib.strength;
        canchg = false;
      }

      ptsmenu();

      do {
        gotoxy(13, 5 + attribx);
        write('<--');

        do {
          gotoxy(10, 3);
          write([ ptsleft, 2 ]);
          gotoxy(41, 0);
          await getkey();

          if (((g.inchar === '+') || (g.inchar === ';'))
              && (sixattr2[attribx] < 18) && (ptsleft > 0)) {
            sixattr2[attribx] = sixattr2[attribx] + 1;
            ptsleft = ptsleft - 1;
          } else if (((g.inchar === '-') || (g.inchar === '='))
              && (sixattr2[attribx] > baseattr[attribx])) {
            sixattr2[attribx] = sixattr2[attribx] - 1;
            ptsleft = ptsleft + 1;
          }

          if ((g.inchar === '+') || (g.inchar === '-') || (g.inchar === ';') || (g.inchar === '=')) {
            gotoxy(10, 5 + attribx);
            write([ sixattr2[attribx], 2 ]);
            canchg = gtchglst();

            for (classx = Tclass.fighter; classx <= Tclass.ninja; classx++) {
              gotoxy(20, 5 + classx);

              if (chg2lst[classx]) {
                write(chr(ord('A') + classx), ') ', g.scntoc.classNames[classx]);
              } else {
                write(chr(29));
              }
            }
          }
        } while (!((g.inchar === chr(27)) || (g.inchar === chr(CRETURN))));

        if (g.inchar === chr(CRETURN)) {
          gotoxy(13, 5 + attribx);
          write('   ');
          attribx = (attribx < Tattrib.luck) ? (attribx + 1) : Tattrib.strength;
        }
      } while (!((g.inchar === chr(27)) && canchg && (ptsleft === 0)));

      do {
        do {
          p010b0b();
          write('CHOOSE A CLASS >');
          await getkey();
        } while (!((g.inchar >= 'A') && (g.inchar <= 'H')));

        classx = Tclass.fighter;

        while (g.inchar > 'A') {
          classx = classx + 1;
          g.inchar = chr(ord(g.inchar) - 1);
        }
      } while (!chg2lst[classx]);

      gotoxy(10, 13);
      write(g.scntoc.classNames[classx]);
      charrec.characterClass = classx;

      for (let index: Tattrib = Tattrib.strength; index <= Tattrib.luck; index++) {
        charrec.attributes[index] = sixattr2[index];
      }
    }

    async function chosalig(): Promise<void> {
      p010b0b();
      gotoxy(0, 17);

      for (let alignx: Talign = Talign.good; alignx <= Talign.evil; alignx++) {
        write(chr(ord('@') + alignx), ') ');
        writeln(g.scntoc.alignmentNames[alignx]);
      }

      do {
        p010b0c();
        write('CHOOSE AN ALIGNMENT >');
        await getkey();
      } while (!((g.inchar >= 'A') && (g.inchar <= 'C')));

      if (g.inchar === 'A') {
        charrec.alignment = Talign.good;
      } else if (g.inchar === 'B') {
        charrec.alignment = Talign.neutral;
      } else {
        charrec.alignment = Talign.evil;
      }

      gotoxy(10, 12);
      write(g.scntoc.alignmentNames[charrec.alignment]);
    }

    async function keepchyn(): Promise<void> {
      let clshpmod: number = 0;
      let vithpmod: number = 0;

      do {
        p010b0b();
        write('KEEP THIS CHARACTER (Y/N)? >');
        await getkey();
      } while (!((g.inchar === 'Y') || (g.inchar === 'N')));

      if (g.inchar === 'N') {
        exit('MAKECHAR');
      }

      if ((charrec.characterClass === Tclass.mage) || (charrec.characterClass === Tclass.bishop)) {
        charrec.spellsKnown[3] = 1;
        charrec.spellsKnown[1] = 1;
        setspelgrp(charrec.mageSpellSlots, 1, 2);
      }

      if (charrec.characterClass === Tclass.priest) {
        charrec.spellsKnown[23] = 1;
        charrec.spellsKnown[24] = 1;
        setspelgrp(charrec.priestSpellSlots, 1, 2);
      }

      switch (charrec.characterClass) {
        case Tclass.fighter:
        case Tclass.lord:     clshpmod = 10; break;
        case Tclass.priest:   clshpmod = 8; break;
        case Tclass.thief:
        case Tclass.bishop:
        case Tclass.ninja:    clshpmod = 6; break;
        case Tclass.mage:     clshpmod = 4; break;
        case Tclass.samurai:  clshpmod = 16; break;
        default: break;
      }

      switch (charrec.attributes[Tattrib.vitality]) {
        case 3:  vithpmod = -2; break;
        case 4:
        case 5:  vithpmod = -1; break;
        case 16: vithpmod = 1; break;
        case 17: vithpmod = 2; break;
        case 18: vithpmod = 3; break;
        default: vithpmod = 0; break;
      }

      clshpmod = clshpmod + vithpmod;

      for (g.llbase04 = 1; g.llbase04 <= 2; g.llbase04++) {
        if ((random() % 2) === 1) {
          clshpmod = Math.trunc((9 * clshpmod) / 10);
        }
      }

      if (clshpmod < 2) {
        clshpmod = 2;
      }

      charrec.maximumHitPoints = clshpmod;
      charrec.hitPoints = clshpmod;
    }

    initchar();
    await makemenu();
    await chosrace();
    await chosalig();
    await givepts();
    await keepchyn();

    // PUTCHARC copies the whole record, and INITCHAR began by filling it with zeroes, so the slot
    // loses every trace of whoever held it before - the bits no field claims included. Answering
    // N to KEEPCHYN never gets here, which is why the slot is not cleared any earlier.
    await fillrec(Zone.character, characx, character);
    await putcharc(charrec, characx);
  });
}


/** CREATE. Finds the first free roster slot - a record whose status is LOST - and fills it. */
async function create(): Promise<void> {
  await withExit('CREATE', async (): Promise<void> => {
    async function exitcrea(exitstr: string): Promise<void> {
      writeln();
      writeln();
      writeln(exitstr);
      writeln();
      writeln('PRESS ANY KEY TO CONTINUE');
      gotoxy(41, 0);
      await getkey();
      exit('CREATE');
    }

    characx = -1;

    for (let charreci: number = 0; charreci <= (g.scntoc.recordsOnDisk[Zone.character] - 1); charreci++) {
      if (characx < 0) {
        charrec = await getcharc(charreci);

        if (charrec.status === Tstatus.lost) {
          characx = charreci;
        }
      }
    }

    if (characx === -1) {
      await exitcrea('THERE IS NO ROOM LEFT - TRY DELETING');
    }

    writeln();
    writeln();
    writeln('THAT CHARACTER DOES NOT EXIST. DO YOU');
    write('WANT TO CREATE IT (Y/N) ?> ');

    do {
      write(chr(8));
      await getkey();
    } while (!((g.inchar === 'Y') || (g.inchar === 'N')));

    if (g.inchar === 'N') {
      exit('CREATE');
    }

    await makechar();
  });
}


/** DSP20NM. "*ROSTER": every character on the disk that has not been deleted. */
async function dsp20nm(): Promise<void> {
  let linecnt: number = 0;

  write(chr(12));
  writeln('NAMES IN USE:');
  writeln('----------------------------------------');

  for (let chari: number = 0; chari <= (g.scntoc.recordsOnDisk[Zone.character] - 1); chari++) {
    charrec = await getcharc(chari);

    if (charrec.status !== Tstatus.lost) {
      linecnt = linecnt + 1;
      gotoxy(0, linecnt + 1);
      write(charrec.name, ' LEVEL ', charrec.level, ' ',
            g.scntoc.raceNames[charrec.race], ' ',
            g.scntoc.classNames[charrec.characterClass],
            ' (', g.scntoc.statusNames[charrec.status], ')');

      if (charrec.inMaze || (charrec.lostLocation[0] !== 0)) {
        write(' OUT');
      }
    }
  }

  gotoxy(0, 22);
  writeln('----------------------------------------');
  write('YOU MAY L)EAVE WHEN READY');

  do {
    gotoxy(41, 0);
    await getkey();
  } while (g.inchar !== 'L');

  g.inchar = chr(0);
}


/** TRAINING. What can be done to a character that already exists. */
async function training(): Promise<void> {
  await withExit('TRAINING', async (): Promise<void> => {
    async function losechar(): Promise<void> {
      charrec.status = Tstatus.lost;
      charrec.inMaze = false;
      await putcharc(charrec, characx);
      await gtscntoc();
    }

    function inspect(): void {
      g.partycnt = 1;
      g.charactr[0] = charrec;
      g.chardisk[0] = characx;
      g.xgoto = Xgoto.xinspct3;
      exit('ROLLER');
    }

    async function rusureyn(delstr: string): Promise<void> {
      do {
        write(chr(12), 'ARE YOU SURE YOU WANT TO ', delstr, ' (Y/N) ?');
        await getkey();
      } while (!((g.inchar === 'Y') || (g.inchar === 'N')));
    }

    async function delchar(): Promise<void> {
      await withExit('DELCHAR', async (): Promise<void> => {
        await rusureyn('DELETE');

        if (g.inchar === 'N') {
          exit('DELCHAR');
        }

        await losechar();
        exit('TRAINING');
      });
    }

    async function chgclass(): Promise<void> {
      await withExit('CHGCLASS', async (): Promise<void> => {
        let classx: Tclass = Tclass.fighter;

        gotoxy(0, 2);
        writeln(chr(11));

        for (let attribi: Tattrib = Tattrib.strength; attribi <= Tattrib.luck; attribi++) {
          sixattr2[attribi] = charrec.attributes[attribi];
        }

        gtchglst();

        for (classx = Tclass.fighter; classx <= Tclass.ninja; classx++) {
          if (chg2lst[classx] && !(classx === charrec.characterClass)) {
            write(chr(ord('A') + classx), ') ');
            writeln(g.scntoc.classNames[classx]);
          }
        }

        writeln();
        writeln('PRESS [LETTER] TO CHANGE CLASS');
        writeln([ '[RET] TO NOT CHANGE CLASS', 34 ]);

        do {
          do {
            gotoxy(41, 0);
            await getkey();
          } while (!((g.inchar === chr(CRETURN))
                  || ((ord(g.inchar) >= ord('A')) && (ord(g.inchar) <= ord('H')))));

          if (g.inchar === chr(CRETURN)) {
            exit('CHGCLASS');
          }

          classx = Tclass.fighter;

          while (g.inchar > 'A') {
            classx = classx + 1;
            g.inchar = chr(ord(g.inchar) - 1);
          }
        } while (!(chg2lst[classx] && !(classx === charrec.characterClass)));

        setbase();

        for (let attribi: Tattrib = Tattrib.strength; attribi <= Tattrib.luck; attribi++) {
          charrec.attributes[attribi] = baseattr[attribi];
        }

        charrec.characterClass = classx;
        charrec.level = 1;
        charrec.experience.high = 0;
        charrec.experience.mid = 0;
        charrec.experience.low = 0;
        charrec.age = charrec.age + (52 * (random() % 3)) + 252;

        if (classx === Tclass.mage) {
          charrec.spellsKnown[3] = 1;
        } else if (classx === Tclass.priest) {
          charrec.spellsKnown[23] = 1;
        }

        for (tempx = 1; tempx <= 7; tempx++) {
          setspelgrp(charrec.mageSpellSlots, tempx, 0);
          setspelgrp(charrec.priestSpellSlots, tempx, 0);
        }

        for (tempx = 1; tempx <= charrec.possessions.count; tempx++) {
          if (!charrec.possessions.items[tempx - 1].cursed) {
            charrec.possessions.items[tempx - 1].equipped = false;
          }
        }

        await putcharc(charrec, characx);
        await gtscntoc();
      });
    }

    async function chgpass(): Promise<void> {
      let newpass1: string = '';
      let newpass2: string = '';

      write(chr(12), 'ENTER NEW PASSWORD ([RET] FOR NONE)');

      do {
        gotoxy(10, 2);
        newpass1 = await getpass();
      } while (newpass1.length > 15);

      write(chr(12), 'ENTER AGAIN TO BE SURE');

      do {
        gotoxy(10, 2);
        newpass2 = await getpass();
      } while (newpass2.length > 15);

      write(chr(12));

      if (newpass1 === newpass2) {
        charrec.password = newpass1;
        await putcharc(charrec, characx);
        await gtscntoc();
        write('PASSWORD CHANGED - ');
      } else {
        writeln('THEY ARE NOT THE SAME - YOUR PASSWORD');
        writeln('HAS NOT BEEN CHANGED!');
        writeln();
      }

      write('PRESS [RET]');
      gotoxy(41, 0);

      do {
        await getkey();
      } while (g.inchar !== chr(CRETURN));
    }

    g.partycnt = 0;

    if (g.xgoto !== Xgoto.xbck2rol) {
      let passstr: string = '';

      do {
        gotoxy(9, 10);
        write('PASSWORD >');
        passstr = await getpass();
      } while (passstr.length > 15);

      if (passstr !== charrec.password) {
        exit('TRAINING');
      }
    } else {
      g.xgoto = Xgoto.xtrainin;
      charrec = g.charactr[0];
      characx = g.chardisk[0];
    }

    for (;;) {
      write(chr(12), charrec.name, ' LEVEL ', charrec.level, ' ',
            g.scntoc.raceNames[charrec.race], ' ',
            g.scntoc.classNames[charrec.characterClass],
            ' (', g.scntoc.statusNames[charrec.status]);
      writeln(')');
      writeln();

      writeln('YOU MAY I)NSPECT THIS CHARACTER,');
      writeln([ 'D)ELETE  THIS CHARACTER,', 32 ]);
      writeln([ 'R)EROLL  THIS CHARACTER,', 32 ]);
      writeln([ 'C)HANGE  CLASS,', 23 ]);
      writeln([ 'S)ET NEW PASSWORD, OR', 29 ]);
      writeln('  PRESS [RET] TO LEAVE');

      gotoxy(41, 0);
      await getkey();

      if (g.inchar === chr(CRETURN)) {
        exit('TRAINING');
      }

      // The key is taken out of INCHAR here because the branches below read INCHAR again after
      // asking their own questions, and it will be a different key by then.
      const chosen: string = g.inchar;

      switch (chosen) {
        case 'I':
          inspect();
          break;

        case 'D':
          await delchar();
          break;

        case 'C':
          await chgclass();
          break;

        case 'R':
          await rusureyn('REROLL');

          if (g.inchar === 'Y') {
            charname = charrec.name;
            await losechar();
            await makechar();
          }

          break;

        case 'S':
          await chgpass();
          break;

        default:
          break;
      }
    }
  });
}


/** SEGMENT PROCEDURE ROLLER. */
export async function roller(): Promise<void> {
  await withExit('ROLLER', async (): Promise<void> => {
    if (g.xgoto === Xgoto.xbck2rol) {
      await training();
    }

    for (;;) {
      write(chr(12), [ ' ', 12 ]);
      writeln('TRAINING GROUNDS');
      writeln();
      writeln('YOU MAY ENTER A CHARACTER NAME TO ADD,');
      write([ ' ', 8 ]);
      writeln('INSPECT OR EDIT,');
      writeln();
      write([ ' ', 8 ]);
      writeln('"*ROSTER" TO SEE ROSTER,');
      writeln();
      writeln([ 'OR PRESS [RET] FOR CASTLE.', 33 ]);

      do {
        gotoxy(13, 9);
        write(chr(11), 'NAME >');
        charname = await getline();

        if (charname === '') {
          write(chr(12));
          g.xgoto = Xgoto.xcastle;
          exit('ROLLER');
        }
      } while (charname.length > 15);

      if (charname === '*ROSTER') {
        await dsp20nm();
      } else {
        characx = -1;

        for (tempx = 0; tempx <= (g.scntoc.recordsOnDisk[Zone.character] - 1); tempx++) {
          if (characx < 0) {
            charrec = await getcharc(tempx);

            if (charrec.status !== Tstatus.lost) {
              if (charrec.name === charname) {
                characx = tempx;
              }
            }
          }
        }

        if (characx < 0) {
          await create();
        } else {
          await training();
        }
      }
    }
  });
}


/** Puts the segment's own variables back, so a test can start from a known place. */
export function resetroller(): void {
  charrec = blankchar();
  tempx = 0;
  characx = 0;
  ptsleft = 0;
  charname = '';
  chg2lst = new Array<boolean>(CLASS_COUNT).fill(false);
  baseattr = new Array<number>(ATTRIBUTE_COUNT).fill(0);
  sixattr2 = new Array<number>(ATTRIBUTE_COUNT).fill(0);
}
