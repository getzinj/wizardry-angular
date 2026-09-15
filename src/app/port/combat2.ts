// Wiz1B.DSK/COMBAT2.TEXT.txt - the two halves of a round's orders: CACTION, where the party say
// what they are doing, and ENATTACK, where the monsters decide.
//
// Both write the same two fields for every combatant - what they are doing and how quickly - and
// MELEE then plays the round out. Nothing here hits anybody.

import type { ICharacter, IObject } from '../data/layout/wiz-types';
import { Zone, object } from '../data/layout/wiz-types';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { disk, rt } from '../runtime/runtime';
import type { ITemp04, ITenemy2 } from './combat';
import {
  BADI, BADIAL, BADIALMA, BADIOS, DALTO, DILTO, HALITO, KATINO, LAHALITO, LORTO, MABADI, MADALTO,
  MAHALITO, MOLITO, MONTINO, TILTOWAI, ZILWAN, battlerc, cvar,
} from './combat';
import { CRETURN, PARTY_MAXIMUM, Tattrib, Tclass, Tobjtype, Tspel012, Tstatus, Xgoto, g, setspelgrp, spelgrp } from './wiz';
import {
  chr, getkey, getstr, int16, ord, pause1, pause2, printnum, printstr, random, unitclear, write,
} from './wiz2';

/** Bytes of a text row MOVETEXT shifts about: eleven words, which is the monster names and no more. */
const MOVETEXT_BYTES: number = 22;

/** Pixel rows between one row of a glyph and the next, inside one band of eight character rows. */
const PIXEL_ROW_STEP: number = 1024;

/** Bytes between one character row and the next, within a band, and where the names start. */
const CHARACTER_ROW_STEP: number = 128;
const NAMES_AT: number = 16;


/**
 * CACTION. Each of the party in turn, top to bottom, says what they mean to do. B) goes back to
 * the first of them, either from inside one character's menu or from the prompt at the end, which
 * is why the whole thing is a loop around a loop.
 */
export async function caction(): Promise<void> {
  await withExit('CACTION', async (): Promise<void> => {
    const splgrcnt: number[] = new Array<number>(PARTY_MAXIMUM).fill(0);
    let bdispell: boolean = false;
    let mycharx: number = 0;
    let agil1ten: number = 0;

    /**
     * WHICHGRP. Which group this is aimed at. With only one group in front of them there is nothing
     * to ask, and a return or a group that is already dead abandons the order and asks again.
     */
    async function whichgrp(solicit: string, spellhsh: number): Promise<void> {
      await withExit('WHICHGRP', async (): Promise<void> => {
        if (battlerc[2].a.alivecnt === 0) {
          battlerc[0].a.temp04[mycharx].victim = 1;
          battlerc[0].a.temp04[mycharx].spellhsh = spellhsh;
          exit('WHICHGRP');
        }

        rt().display.mvcursor(26 - Math.trunc(solicit.length / 2), 8);
        printstr(solicit);

        do {
          await getkey();
        } while (!(((g.inchar >= '1') && (g.inchar < '5')) || (g.inchar === chr(CRETURN))));

        if (g.inchar === chr(CRETURN)) {
          battlerc[0].a.temp04[mycharx].spellhsh = -999;
          exit('WHICHGRP');
        }

        if (battlerc[ord(g.inchar) - ord('0')].a.alivecnt === 0) {
          battlerc[0].a.temp04[mycharx].spellhsh = -999;
          exit('WHICHGRP');
        }

        battlerc[0].a.temp04[mycharx].victim = ord(g.inchar) - ord('0');
        battlerc[0].a.temp04[mycharx].spellhsh = spellhsh;
        rt().display.hires.clrrect(13, 8, 26, 2);
      });
    }

    /** USEITEM. An item with a spell in it, which is cast by using it rather than by naming it. */
    async function useitem(): Promise<void> {
      await withExit('USEITEM', async (): Promise<void> => {
        const buseable: boolean[] = new Array<boolean>(9).fill(false);
        let possx: number = 0;
        let objectr!: IObject;

        function readobjt(): void {
          objectr = disk().read(Zone.object,
                                g.charactr[mycharx].possessions.items[possx - 1].objectIndex,
                                object);
        }

        function dspitems(): void {
          let itemcnt: number = 0;

          rt().display.hires.clrrect(1, 11, 38, 4);

          for (possx = 1; possx <= g.charactr[mycharx].possessions.count; possx++) {
            buseable[possx] = false;
            rt().display.mvcursor(1 + (19 * ((possx - 1) % 2)), 11 + Math.trunc((possx - 1) / 2));
            readobjt();

            if (objectr.spellPower > 0) {
              if ((objectr.objectType === Tobjtype.special)
                  || (g.charactr[mycharx].possessions.items[possx - 1].equipped)) {
                itemcnt = itemcnt + 1;
                buseable[possx] = true;
                printnum(possx, 1);
                printstr(') ');

                if (g.charactr[mycharx].possessions.items[possx - 1].identified) {
                  printstr(objectr.name);
                } else {
                  printstr(objectr.unidentifiedName);
                }
              }
            }
          }

          if (itemcnt === 0) {
            exit('USEITEM');
          }

          rt().display.mvcursor(13, 8);
          printstr('WHICH ITEM (RETURN EXITS)?');
        }

        /** CHGITEM. Using an item can use it up, which turns it into something else. */
        function chgitem(): void {
          withExitSync('CHGITEM', (): void => {
            if ((random() % 100) >= objectr.changeChance) {
              exit('CHGITEM');
            }

            const held: ICharacter['possessions']['items'][number] =
              g.charactr[mycharx].possessions.items[possx - 1];

            held.objectIndex = objectr.changesTo;
            held.identified = false;
          });
        }

        function uigenerc(spellhsh: number): void {
          battlerc[0].a.temp04[mycharx].spellhsh = spellhsh;
          battlerc[0].a.temp04[mycharx].victim = -1;
          chgitem();
        }

        async function uiperson(spellhsh: number): Promise<void> {
          rt().display.mvcursor(15, 8);
          printstr('USE ITEM ON PERSON # ?');

          do {
            await getkey();
          } while (!((g.inchar >= '1') && (g.inchar <= chr(ord('0') + g.partycnt))));

          battlerc[0].a.temp04[mycharx].victim = ord(g.inchar) - ord('0') - 1;
          battlerc[0].a.temp04[mycharx].spellhsh = spellhsh;
          chgitem();
        }

        async function uigroup(spellhsh: number): Promise<void> {
          await whichgrp('USE ITEM ON WHAT GROUP # ?', spellhsh);
          chgitem();
        }

        if (g.charactr[mycharx].possessions.count === 0) {
          exit('USEITEM');
        }

        dspitems();

        do {
          await getkey();
          possx = ord(g.inchar) - ord('0');

          if (g.inchar === chr(CRETURN)) {
            exit('USEITEM');
          }
        } while (!((possx > 0)
                   && (possx <= g.charactr[mycharx].possessions.count)
                   && buseable[possx]));

        readobjt();
        rt().display.hires.clrrect(13, 6, 26, 4);
        g.llbase04 = g.scntoc.spellHash[objectr.spellPower];

        switch (g.scntoc.spellTarget[objectr.spellPower]) {
          case Tspel012.generic: uigenerc(g.llbase04); break;
          case Tspel012.person: await uiperson(g.llbase04); break;
          case Tspel012.group: await uigroup(g.llbase04); break;
          default: break;
        }
      });
    }

    /**
     * GETSPELL. Spells are cast by name, and the name is turned into a number the same way the
     * scenario disk's table of spell numbers was built, so nothing here holds a list of them.
     */
    async function getspell(): Promise<void> {
      await withExit('GETSPELL', async (): Promise<void> => {
        let spellcst: number = 0;

        async function dospell(): Promise<void> {
          /**
           * CASTCHK. Whether they know the spell and have a slot of that group left. Either way it
           * is the end of the order: knowing it and having the points means carrying on with the
           * spell, and anything else says so and throws the whole order away.
           */
          async function castchk(spelli: number, spellgr: number): Promise<void> {
            await withExit('CASTCHK', async (): Promise<void> => {
              if (g.charactr[mycharx].spellsKnown[spelli] !== 0) {
                // The ELSE belongs to the inner IF: a spell they know that is not a mage spell they
                // can pay for is tried as a priest spell instead. Groups above ten mean priest.
                if ((spelli < 22) && (spelgrp(g.charactr[mycharx].mageSpellSlots, spellgr) > 0)) {
                  splgrcnt[mycharx] = spellgr;
                } else if (spelgrp(g.charactr[mycharx].priestSpellSlots, spellgr) > 0) {
                  splgrcnt[mycharx] = spellgr + 10;
                }
              }

              rt().display.mvcursor(13, 9);

              if (splgrcnt[mycharx] > 0) {
                exit('CASTCHK');
              } else if (g.charactr[mycharx].spellsKnown[spelli] !== 0) {
                printstr('SPELL POINTS EXHAUSTED');
              } else {
                printstr('YOU DONT KNOW THAT SPELL');
              }

              await pause1();
              exit('GETSPELL');
            });
          }

          async function spgenerc(spelli: number, spellgr: number): Promise<void> {
            await castchk(spelli, spellgr);
            battlerc[0].a.temp04[mycharx].spellhsh = spellcst;
            battlerc[0].a.temp04[mycharx].victim = -1;
          }

          async function spperson(spelli: number, spellgr: number): Promise<void> {
            await castchk(spelli, spellgr);
            rt().display.mvcursor(13, 8);
            printstr(' CAST SPELL ON PERSON # ?');

            do {
              await getkey();
            } while (!((g.inchar >= '1') && (ord(g.inchar) <= (ord('0') + g.partycnt))));

            battlerc[0].a.temp04[mycharx].victim = ord(g.inchar) - ord('0') - 1;
            battlerc[0].a.temp04[mycharx].spellhsh = spellcst;
            rt().display.hires.clrrect(13, 8, 26, 1);
          }

          async function spgroup(spelli: number, spellgr: number): Promise<void> {
            await castchk(spelli, spellgr);
            await whichgrp('CAST SPELL ON GROUP #?', spellcst);
          }

          for (let spellx: number = 0; spellx <= 50; spellx++) {
            if (spellcst === g.scntoc.spellHash[spellx]) {
              switch (g.scntoc.spellTarget[spellx]) {
                case Tspel012.generic:
                  await spgenerc(spellx, g.scntoc.spellGroup[spellx]);
                  break;

                case Tspel012.person:
                  await spperson(spellx, g.scntoc.spellGroup[spellx]);
                  break;

                case Tspel012.group:
                  await spgroup(spellx, g.scntoc.spellGroup[spellx]);
                  break;

                default:
                  break;
              }
            }
          }
        }

        rt().display.mvcursor(13, 8);
        printstr('SPELL NAME ? >');

        const spellnam: string = await getstr(27, 8);
        const spelnaml: number = spellnam.length;

        if (spelnaml === 0) {
          exit('GETSPELL');
        }

        spellcst = spelnaml;

        for (let spelnami: number = 1; spelnami <= spelnaml; spelnami++) {
          const spelchra: number = ord(spellnam[spelnami - 1]) - 64;

          spellcst = int16(spellcst + (spelchra * spelchra * spelnami));
        }

        rt().display.hires.clrrect(13, 8, 26, 1);
        await dospell();
      });
    }

    /**
     * RUNAWAY. Getting away is harder the deeper they are and impossible from the tenth level.
     * Failing means nobody in the party acts at all this round.
     */
    function runaway(): void {
      let temp: number = 0;

      function runfaild(): void {
        for (temp = 0; temp <= (g.partycnt - 1); temp++) {
          battlerc[0].a.temp04[temp].agility = -1;
        }

        exit('CACTION');
      }

      rt().display.hires.clrrect(13, 6, 26, 4);
      temp = 38 - (3 * g.mazelev);

      if (g.partycnt < 4) {
        temp = temp + 20 - (5 * g.partycnt);
      }

      if (g.base12 > g.enstreng) {
        temp = temp + 20;
      }

      if (g.mazelev === 10) {
        temp = -1;
      }

      if ((random() % 100) > temp) {
        runfaild();
      }

      for (temp = 1; temp <= 4; temp++) {
        battlerc[temp].a.alivecnt = 0;
        battlerc[temp].a.enmycnt = 0;
      }

      g.xgoto = Xgoto.xreward2;
      cvar.donefigh = true;
      exit('CUTIL');
    }

    /** DOSUPRIS. Who saw whom first, said once at the start of the fight and then forgotten. */
    async function dosupris(): Promise<void> {
      rt().display.hires.clrrect(13, 6, 26, 4);
      rt().display.hires.clrrect(1, 11, 38, 4);
      rt().display.mvcursor(1, 12);

      if (cvar.surprise === 1) {
        printstr('YOU SURPRISED THE MONSTERS!');
      } else if (cvar.surprise === 2) {
        printstr('THE MONSTERS SURPRISED YOU!');
      }

      if (cvar.surprise !== 0) {
        write(chr(7));
        write(chr(7));
        write(chr(7));
        await pause2();
        await pause2();
      }
    }

    await dosupris();
    mycharx = 0;
    splgrcnt.fill(0);

    while (mycharx < g.partycnt) {
      do {
        if ((battlerc[0].a.temp04[mycharx].status === Tstatus.ok) && (cvar.surprise !== 2)) {
          battlerc[0].a.temp04[mycharx].spellhsh = -999;

          do {
            agil1ten = random() % 10;

            switch (g.charactr[mycharx].attributes[Tattrib.agility]) {
              case 3: agil1ten = agil1ten + 3; break;
              case 4: case 5: agil1ten = agil1ten + 2; break;
              case 6: case 7: agil1ten = agil1ten + 1; break;
              case 15: agil1ten = agil1ten - 1; break;
              case 16: agil1ten = agil1ten - 2; break;
              case 17: agil1ten = agil1ten - 3; break;
              case 18: agil1ten = agil1ten - 4; break;
              default: break;
            }

            if (agil1ten < 1) {
              agil1ten = 1;
            } else if (agil1ten > 10) {
              agil1ten = 10;
            }

            battlerc[0].a.temp04[mycharx].agility = agil1ten;
            unitclear();
            rt().display.mvcursor(13, 6);
            printstr(g.charactr[mycharx].name);
            printstr('\'S OPTIONS');
            rt().display.mvcursor(13, 8);

            if (mycharx < 3) {
              printstr('F)IGHT  ');
            }

            printstr('S)PELL  P)ARRY');
            rt().display.mvcursor(13, 9);
            printstr('R)UN    U)SE    ');
            bdispell = false;

            if ((g.charactr[mycharx].characterClass === Tclass.priest)
                || ((g.charactr[mycharx].characterClass === Tclass.lord)
                    && (g.charactr[mycharx].level > 8))
                || ((g.charactr[mycharx].characterClass === Tclass.bishop)
                    && (g.charactr[mycharx].level > 3))) {
              bdispell = true;
              printstr('D)ISPELL ');
            }

            do {
              await getkey();
            } while ((g.inchar !== 'F') && (g.inchar !== 'S')
                     && (g.inchar !== 'P') && (g.inchar !== 'U')
                     && (g.inchar !== 'D') && (g.inchar !== 'R')
                     && (g.inchar !== 'B'));

            rt().display.hires.clrrect(13, 8, 26, 2);
            splgrcnt[mycharx] = 0;

            const chosen: string = g.inchar;

            switch (chosen) {
              case 'D':
                if (bdispell) {
                  await whichgrp('DISPELL WHICH GROUP# ?', -5);
                }
                break;

              case 'R':
                runaway();
                break;

              case 'F':
                if (mycharx < 3) {
                  await whichgrp('FIGHT AGAINST GROUP# ?', -1);
                }
                break;

              case 'P':
                battlerc[0].a.temp04[mycharx].spellhsh = 0;
                battlerc[0].a.temp04[mycharx].agility = -1;
                break;

              case 'S':
                await getspell();
                break;

              case 'U':
                await useitem();
                rt().display.hires.clrrect(1, 11, 38, 4);
                break;

              case 'B':
                if (mycharx > 0) {
                  battlerc[0].a.temp04[mycharx].spellhsh = -100;
                }
                break;

              default:
                break;
            }

            rt().display.hires.clrrect(13, 6, 26, 4);
          } while (battlerc[0].a.temp04[mycharx].spellhsh === -999);

          if (battlerc[0].a.temp04[mycharx].spellhsh === -100) {
            mycharx = -1;
          }
        } else {
          battlerc[0].a.temp04[mycharx].agility = -1;
        }

        mycharx = mycharx + 1;
      } while (mycharx !== g.partycnt);

      if (cvar.surprise !== 2) {
        rt().display.mvcursor(14, 6);
        printstr('PRESS [RETURN] TO FIGHT,');
        rt().display.mvcursor(25, 7);
        printstr('OR');
        rt().display.mvcursor(14, 8);
        printstr('GO B)ACK TO REDO OPTIONS');

        do {
          await getkey();
        } while ((g.inchar !== chr(CRETURN)) && (g.inchar !== 'B'));

        if (g.inchar === 'B') {
          mycharx = 0;
        }
      }

      rt().display.hires.clrrect(13, 6, 26, 4);
      rt().display.hires.clrrect(1, 11, 38, 4);
    }

    for (mycharx = 0; mycharx <= (g.partycnt - 1); mycharx++) {
      if (splgrcnt[mycharx] > 0) {
        if (splgrcnt[mycharx] > 10) {
          setspelgrp(g.charactr[mycharx].priestSpellSlots,
                     splgrcnt[mycharx] - 10,
                     spelgrp(g.charactr[mycharx].priestSpellSlots, splgrcnt[mycharx] - 10) - 1);
        } else {
          setspelgrp(g.charactr[mycharx].mageSpellSlots,
                     splgrcnt[mycharx],
                     spelgrp(g.charactr[mycharx].mageSpellSlots, splgrcnt[mycharx]) - 1);
        }
      }
    }
  });
}


/**
 * ENATTACK. What the monsters do, which they decide one at a time in the order they are standing
 * in. A group may push past the one in front of it first.
 */
export async function enattack(): Promise<void> {
  let attcktyp: number = 0;
  let charx: number = 0;
  let enemyx: number = 0;
  let groupi: number = 0;

  /**
   * CANATTCK. A weapon or a spell the monster's kind cannot be touched by works half the time all
   * the same. Pascal evaluates both sides of an OR, so the draw happens whatever the left side says.
   */
  function canattck(): boolean {
    const immune: boolean =
      g.charactr[charx].bonusVersusType2[1][battlerc[groupi].b.monsterClass] !== 0;
    const anyway: boolean = (random() % 100) < 50;

    return (!immune) || anyway;
  }

  /** ENEMYSPL. A spell, picked by level out of a short list; there is no spell book behind it. */
  function enemyspl(): void {
    /** SPELLEZR. Casting it may cost the group a level of spells, the more of them the less often. */
    function spellezr(which: 'mageSpellLevel' | 'priestSpellLevel'): void {
      if ((random() % (battlerc[groupi].a.alivecnt + 2)) === 0) {
        battlerc[groupi].b[which] = battlerc[groupi].b[which] - 1;
      }
    }

    function getmagsp(spelllev: number): void {
      let spellcas: number = 0;
      let level: number = spelllev;

      // Both operands of an AND are evaluated every time the condition is tested, the test that
      // ends the loop included, so the draw happens once more than the loop turns.
      for (;;) {
        const deeper: boolean = level > 1;
        const unlucky: boolean = (random() % 100) > 70;

        if (deeper && unlucky) {
          level = level - 1;
        } else {
          break;
        }
      }

      const twothird: boolean = (random() % 100) > 33;

      spellezr('mageSpellLevel');

      // The comments are the original's: the second choice at levels two, four, five and six is
      // either a weaker spell than the first or the same one twice.
      switch (level) {
        case 1:
          spellcas = twothird ? KATINO : HALITO;
          break;

        case 2:
          spellcas = twothird ? DILTO : HALITO; // BUG
          break;

        case 3:
          spellcas = twothird ? MOLITO : MAHALITO;
          break;

        case 4:
          spellcas = twothird ? DALTO : LAHALITO; // ...HMMM
          break;

        case 5:
          spellcas = twothird ? LAHALITO : MADALTO; // ...HMMM
          break;

        case 6:
          spellcas = twothird ? MADALTO : ZILWAN; // ...HMMM
          break;

        case 7:
          spellcas = TILTOWAI;
          break;

        default:
          break;
      }

      attcktyp = spellcas;
    }

    function getprisp(spelllev: number): void {
      let spellcas: number = 0;
      const twothird: boolean = (random() % 100) > 33;

      spellezr('priestSpellLevel');

      switch (spelllev) {
        case 1:
          spellcas = BADIOS;
          break;

        case 2:
          spellcas = MONTINO;
          break;

        case 3:
          spellcas = twothird ? BADIOS : BADIAL;
          break;

        case 4:
          spellcas = BADIAL;
          break;

        case 5:
          spellcas = twothird ? BADIALMA : BADI;
          break;

        case 6:
          spellcas = twothird ? LORTO : MABADI;
          break;

        case 7:
          spellcas = MABADI;
          break;

        default:
          break;
      }

      attcktyp = spellcas;
    }

    if (battlerc[groupi].b.mageSpellLevel > 0) {
      if ((random() % 100) < 75) {
        getmagsp(battlerc[groupi].b.mageSpellLevel);
      }
    }

    if (attcktyp === 0) {
      if (battlerc[groupi].b.priestSpellLevel > 0) {
        if ((random() % 100) < 75) {
          getprisp(battlerc[groupi].b.priestSpellLevel);
        }
      }
    }
  }

  /** YELLHELP. Some of them call for another of their own kind, until there are five of them. */
  function yellhelp(): void {
    if (battlerc[groupi].b.properties[6] !== 0) {
      if (battlerc[groupi].a.alivecnt < 5) {
        if ((random() % 100) < 75) {
          attcktyp = -4;
        }
      }
    }
  }

  /** RUNENMY. Monsters that know when they are beaten, which they judge by the party's levels. */
  function runenmy(): void {
    withExitSync('RUNENMY', (): void => {
      if (battlerc[groupi].b.properties[5] === 0) {
        exit('RUNENMY');
      }

      if (g.base12 > g.enstreng) {
        if ((random() % 100) < 65) {
          attcktyp = -2;
        }
      }
    });
  }

  function breathes(): void {
    if (battlerc[groupi].b.breathes > 0) {
      if ((random() % 100) < 60) {
        attcktyp = -3;
      }
    }
  }

  /**
   * ADVANCE. A group behind another may change places with it, which is the only way anything in
   * groups two to four gets close enough to be hit by a sword.
   */
  async function advance(): Promise<void> {
    const advstren: number[] = new Array<number>(5).fill(0);
    let enemyx: number = 0;
    let groupi: number = 0;

    /**
     * MOVETEXT. Slides the name of the group that is advancing up a row on the screen, a pixel at
     * a time, so it visibly changes places with the one above it.
     *
     * Pointer arithmetic, as the original. Addresses there start at $2000, which is index zero of
     * video memory here; a character row is 128 bytes on from the one above while they are in the
     * same band of eight, and each of its eight pixel rows is 1024 further on again.
     */
    function movetext(groupi: number): void {
      const screen: Uint8Array = rt().display.hires.bytes;
      const lineptrs: number[] = new Array<number>(16).fill(0);
      const saverow: Uint8Array[] = [];

      lineptrs[0] = (CHARACTER_ROW_STEP * groupi) + NAMES_AT;
      lineptrs[8] = (CHARACTER_ROW_STEP * (groupi + 1)) + NAMES_AT;

      for (let pix: number = 1; pix <= 7; pix++) {
        lineptrs[pix] = lineptrs[pix - 1] + PIXEL_ROW_STEP;
        lineptrs[pix + 8] = lineptrs[pix + 7] + PIXEL_ROW_STEP;
      }

      write(chr(7));

      for (let pix: number = 0; pix <= 7; pix++) {
        saverow.push(screen.slice(lineptrs[pix], lineptrs[pix] + MOVETEXT_BYTES));
      }

      for (let pix: number = 0; pix <= 7; pix++) {
        screen.fill(0, lineptrs[pix], lineptrs[pix] + MOVETEXT_BYTES);
      }

      write(chr(7));

      for (let pix: number = 7; pix >= 0; pix--) {
        for (let linex: number = pix; linex <= (pix + 7); linex++) {
          screen.copyWithin(lineptrs[linex],
                            lineptrs[linex + 1],
                            lineptrs[linex + 1] + MOVETEXT_BYTES);
        }

        screen.fill(0, lineptrs[pix + 8], lineptrs[pix + 8] + MOVETEXT_BYTES);
      }

      write(chr(7));

      for (let pix: number = 0; pix <= 7; pix++) {
        screen.set(saverow[pix], lineptrs[pix + 8]);
      }

      rt().display.hires.dirty = true;
    }

    for (groupi = 1; groupi <= 4; groupi++) {
      advstren[groupi] = 0;

      for (enemyx = 0; enemyx <= (battlerc[groupi].a.alivecnt - 1); enemyx++) {
        if (battlerc[groupi].a.temp04[enemyx].status === Tstatus.ok) {
          advstren[groupi] = advstren[groupi]
              + battlerc[groupi].a.temp04[enemyx].hpleft
              - (3 * (battlerc[groupi].b.mageSpellLevel + battlerc[groupi].b.priestSpellLevel));
        }
      }

      if (advstren[groupi] > 1000) {
        advstren[groupi] = 1000;
      } else if (advstren[groupi] < 1) {
        advstren[groupi] = 1;
      }
    }

    for (groupi = 4; groupi >= 2; groupi--) {
      if (battlerc[groupi].a.alivecnt > 0) {
        if ((random() % 100)
            <= (30 + Math.trunc((20 * advstren[groupi]) / advstren[groupi - 1]))) {
          rt().display.mvcursor(1, 15 - groupi);
          printstr('THE ');

          if (battlerc[groupi].a.identifi) {
            printstr(battlerc[groupi].b.plural);
          } else {
            printstr(battlerc[groupi].b.unidentifiedPlural);
          }

          printstr(' ADVANCE!');
          movetext(groupi - 1);
          await pause1();

          enemyx = advstren[groupi];
          advstren[groupi] = advstren[groupi - 1];
          advstren[groupi - 1] = enemyx;

          // The original copies the whole record through TEMPE2; swapping which slot holds which
          // group is the same thing, since nothing else is holding on to either of them.
          const tempe2: ITenemy2 = battlerc[groupi];

          battlerc[groupi] = battlerc[groupi - 1];
          battlerc[groupi - 1] = tempe2;
        }
      }
    }

    rt().display.hires.clrrect(1, 11, 38, 4);
  }

  await advance();

  for (groupi = 1; groupi <= 4; groupi++) {
    if (battlerc[groupi].a.alivecnt > 0) {
      for (enemyx = 0; enemyx <= (battlerc[groupi].a.alivecnt - 1); enemyx++) {
        const group: ITenemy2 = battlerc[groupi];
        const one: ITemp04 = group.a.temp04[enemyx];

        if ((one.status === Tstatus.ok) && (cvar.surprise !== 1)) {
          one.agility = (random() % 8) + 2;

          if (g.partycnt === 1) {
            charx = 0;
          } else {
            charx = g.partycnt - 1;

            while (battlerc[0].a.temp04[charx].status >= Tstatus.dead) {
              charx = charx - 1;
            }

            charx = random() % (charx + 1);
          }

          one.victim = charx;
          one.spellhsh = 0;
          attcktyp = 0;

          if (canattck()) {
            enemyspl();

            if (attcktyp === 0) {
              breathes();
            }

            if (attcktyp === 0) {
              yellhelp();
            }

            if (attcktyp === 0) {
              runenmy();
            }

            if (attcktyp > 0) {
              if (g.charactr[charx].bonusVersusType3[1][6] !== 0) {
                one.agility = -1;
              }
            }

            if (attcktyp === 0) {
              // Only the first few of a group are close enough to use their claws, and the further
              // back the group is standing the less likely even they are to reach. Both operands of
              // an OR are evaluated, so the draw happens for the ones at the front too, who reach
              // whatever it says.
              const closeenough: boolean = enemyx <= (4 - groupi);
              const reaches: boolean = (60 - (10 * groupi)) <= (random() % 100);

              if (closeenough || reaches) {
                charx = charx % 3;

                if (canattck()) {
                  attcktyp = -1;
                  one.victim = charx;
                } else {
                  one.agility = -1;
                }
              }
            }
          }

          one.spellhsh = attcktyp;
        } else {
          one.agility = -1;
        }
      }
    }
  }
}
