// Wiz1C.DSK/REWARDS.TEXT.txt - what the party get for winning: the chest, its trap, and the gold
// and items inside it.
//
// The fight is over before any of this runs. What is found is whichever reward record the monster
// that was fought points at - one of its two, chosen by how the fight started - and the chest in
// front of it is a screen of its own: five ways to deal with a trap, each of which can set it off.

import type { ICharacter, IMonster, IObject, IReward, IRewardEntry } from '../data/layout/wiz-types';
import { Zone, monster, object, reward } from '../data/layout/wiz-types';
import { exit, withExit } from '../runtime/pascal-exit';
import { rt } from '../runtime/runtime';
import { getbytes, getrec, putrec } from './diskio';
import type { ITwizlong } from './wiz';
import { PARTY_MAXIMUM, Tattrib, Tclass, Tstatus, Xgoto, g, spelgrp, setspelgrp } from './wiz';
import {
  addlongs, chr, clearpic, divlong, getkey, getstr, long2bcd, multlong, newlong, ord, pause2,
  printchr, printstr, random, unitclear,
} from './wiz2';
import type { Tbcd } from './wiz2';

/** A picture is a block of the scenario, and ten bytes of it are one row of seventy pixels. */
const PICTURE_SIZE: number = 512;
const PICTURE_BYTES_PER_ROW: number = 10;
const PICTURE_FIRST_ROW: number = 23;
const PICTURE_LAST_ROW: number = 72;

/** Which stored pictures these are: the chest, and the heap of treasure out of it. */
const CHEST_PICTURE: number = 18;
const REWARD_PICTURE: number = 19;

/** Digits a TWIZLONG holds, which is what PRLONG2 prints with the leading zeroes taken off. */
const LONG_DIGITS: number = 12;

/** CALFO is spell 28, and it is the second group of priest spells that pays for it. */
const CALFO_SPELL: number = 28;
const CALFO_GROUP: number = 2;


/**
 * REWARDS' own variables. The scalars are in one object because REWARDS2 assigns to them as well,
 * and a module cannot assign to a name it imported.
 */
export const rvar: { alivecnt: number; oneortwo: number; rewardi: number; trap3typ: number } = {
  alivecnt: 0,
  oneortwo: 0,
  rewardi: 0,
  trap3typ: 0,
};

/** What each survivor is paid for the fight. A record, so it is filled in rather than replaced. */
export const expperch: ITwizlong = newlong();


/**
 * PIC2SCRN. The chest and the treasure, dropped into video memory a row at a time. COMBAT has its
 * own copy of this for monsters, as ENEMYPIC, and so does the original.
 */
export async function pic2scrn(picture: number): Promise<void> {
  const bytes: Uint8Array = await getbytes(Zone.picture, picture, PICTURE_SIZE);
  let bufferi: number = 0;

  clearpic();

  for (let pixlin: number = PICTURE_FIRST_ROW; pixlin <= PICTURE_LAST_ROW; pixlin++) {
    rt().display.hires.blitPictureRow(pixlin, bytes, bufferi, PICTURE_BYTES_PER_ROW);
    bufferi = bufferi + PICTURE_BYTES_PER_ROW;
  }
}


/** PRLONG2. A twelve-digit number on the high-resolution page, with its leading zeroes dropped. */
export function prlong2(mp01: ITwizlong): void {
  const bcdnum: Tbcd = long2bcd(mp01);
  let supresi: number = 1;

  while ((supresi < LONG_DIGITS) && (bcdnum[supresi] === 0)) {
    supresi = supresi + 1;
  }

  for (let nonzeroi: number = supresi; nonzeroi <= LONG_DIGITS; nonzeroi++) {
    printchr(chr(bcdnum[nonzeroi] + ord('0')));
  }
}


/**
 * ENMYREWD. Which reward record this fight pays out of, and how much of it.
 *
 * This is also where a monster there is only a fixed number of ever gets used up: UNIQUE counts
 * down by one and is written back to the disk, and once it reaches nothing ENGROUPS will send the
 * next fight to whatever the monster keeps company with instead.
 */
async function enmyrewd(): Promise<void> {
  const enemy: IMonster = await getrec(Zone.monster, g.enemyinx, monster);

  if (enemy.unique > 0) {
    enemy.unique = enemy.unique - 1;
    await putrec(Zone.monster, g.enemyinx, monster, enemy);
  }

  rvar.oneortwo = 1;

  if (g.attk012 === 0) {
    rvar.rewardi = enemy.reward1;
  } else if (g.attk012 === 1) {
    rvar.rewardi = enemy.reward1;
    rvar.oneortwo = 2;
  } else {
    rvar.rewardi = enemy.reward2;
  }
}


/** FOUNDITM. An item into the first free slot of whoever found it, unidentified. */
async function founditm(fndcharx: number, possx: number, itemindx: number): Promise<void> {
  const objectrc: IObject = await getrec(Zone.object, itemindx, object);

  rt().display.hires.clrrect(1, 11, 38, 4);
  rt().display.mvcursor(1, 12);
  printstr(g.charactr[fndcharx].name);
  printstr(' FOUND - ');
  printstr(objectrc.unidentifiedName);

  const carried: ICharacter['possessions'] = g.charactr[fndcharx].possessions;
  let slot: number = possx;

  // The slot is worked out here, so whatever the caller passed as POSSX is thrown away.
  slot = carried.count + 1;
  carried.items[slot - 1].equipped = false;
  carried.items[slot - 1].identified = false;
  carried.items[slot - 1].cursed = false;
  carried.items[slot - 1].objectIndex = itemindx;
  carried.count = slot;
}


/** CHSTGOLD. The chest, and then the spoils, which are shared out between whoever is still alive. */
export async function chstgold(): Promise<void> {
  let chrxchst: number = 0;
  let indx: number = 0;
  const gold2one: ITwizlong = newlong();
  let rewardz!: IReward;

  async function rdreward(): Promise<void> {
    rewardz = await getrec(Zone.reward, rvar.rewardi, reward);
  }

  /** ACHEST. The chest in front of the party, which nothing makes them open. */
  async function achest(): Promise<void> {
    await withExit('ACHEST', async (): Promise<void> => {
      const whotried: boolean[] = new Array<boolean>(PARTY_MAXIMUM).fill(false);
      let traptype: number = 0;

      /**
       * GTTRAPTY. Which trap, if any. The deeper the party are the likelier a trap is at all, and
       * then a number between nought and ninety-nine is walked up the list of traps, a step at a
       * time, stopping on one this chest can hold once the number has run out. The step off the
       * third costs five rather than one, so the walk runs out of road sooner there. The wrap at the
       * end goes back to one rather than nought, so it can never land on a trapless chest.
       */
      function gttrapty(): void {
        let btrapped: boolean = false;

        for (traptype = 0; traptype <= 7; traptype++) {
          if (rewardz.trapKinds[traptype] !== 0) {
            btrapped = true;
          }
        }

        rvar.trap3typ = random() % 5;

        if (!btrapped) {
          traptype = 0;
        } else if ((random() % 15) > (4 + g.mazelev)) {
          traptype = 0;
        } else {
          let zero99: number = random() % 100;

          traptype = 0;

          while (zero99 > 0) {
            do {
              if (traptype < 7) {
                if (traptype === 3) {
                  zero99 = zero99 - 5;
                } else {
                  zero99 = zero99 - 1;
                }

                traptype = traptype + 1;
              } else {
                traptype = 0 + 1;
              }
            } while (rewardz.trapKinds[traptype] === 0);
          }
        }
      }

      function exitrwds(): void {
        exit('REWARDS');
      }

      /** PRTRAPTY. What the trap is called, which is also what has to be typed to disarm it. */
      async function prtrapty(traptype: number, trap3ty: number): Promise<void> {
        switch (traptype) {
          case 0: printstr('TRAPLESS CHEST'); break;
          case 1: printstr('POISON NEEDLE'); break;
          case 2: printstr('GAS BOMB'); break;

          case 3:
            switch (trap3ty) {
              case 0: printstr('CROSSBOW BOLT'); break;
              case 1: printstr('EXPLODING BOX'); break;
              case 2: printstr('SPLINTERS'); break;
              case 3: printstr('BLADES'); break;
              case 4: printstr('STUNNER'); break;
              default: break;
            }
            break;

          case 4: printstr('TELEPORTER'); break;
          case 5: printstr('ANTI-MAGE'); break;
          case 6: printstr('ANTI-PRIEST'); break;
          case 7: printstr('ALARM'); break;
          default: break;
        }

        await pause2();
      }

      /** DOTRAPDM. The trap goes off. Whatever it does, the chest is finished with afterwards. */
      async function dotrapdm(): Promise<void> {
        let charx: number = 0;

        /** HPDAMAGE. Damage to one of the party, and the party's last death sends them all home. */
        function hpdamage(charxhit: number, hitcnt: number, hitdam: number): void {
          let totdam: number = 0;
          let hits: number = hitcnt;

          while (hits > 0) {
            totdam = totdam + (random() % hitdam) + 1;
            hits = hits - 1;
          }

          g.charactr[charxhit].hitPoints = g.charactr[charxhit].hitPoints - totdam;

          if (g.charactr[charxhit].hitPoints < 1) {
            g.charactr[charxhit].hitPoints = 0;
            g.charactr[charxhit].status = Tstatus.dead;
            rt().display.hires.clrrect(1, 11, 38, 4);
            rt().display.mvcursor(1, 12);
            printstr(g.charactr[charxhit].name);
            printstr(' DIES!');
            rvar.alivecnt = rvar.alivecnt - 1;

            if (rvar.alivecnt === 0) {
              g.xgoto = Xgoto.xcemetry;
              exit('REWARDS');
            }
          }
        }

        /**
         * ANTIPM. The two traps aimed at spell casters, which turn them to stone or hold them
         * still. The draw is made for everybody whether their class can be touched by it or not.
         */
        function antipm(bmagedam: boolean): void {
          function isstoned(charpm: number): void {
            if (g.charactr[charpm].status < Tstatus.stoned) {
              g.charactr[charpm].status = Tstatus.stoned;
            }
          }

          function isplyze(charpm: number): void {
            if (g.charactr[charpm].status < Tstatus.plyze) {
              g.charactr[charpm].status = Tstatus.plyze;
            }
          }

          for (let charpm: number = 0; charpm <= (g.partycnt - 1); charpm++) {
            const plyzston: boolean = (random() % 20) < g.charactr[charpm].skills[4];

            switch (g.charactr[charpm].characterClass) {
              case Tclass.mage:
                if (bmagedam) {
                  if (plyzston) {
                    isplyze(charpm);
                  } else {
                    isstoned(charpm);
                  }
                }
                break;

              case Tclass.samurai:
                if (bmagedam) {
                  if (!plyzston) {
                    isplyze(charpm);
                  }
                }
                break;

              case Tclass.priest:
                if (!bmagedam) {
                  if (plyzston) {
                    isplyze(charpm);
                  } else {
                    isstoned(charpm);
                  }
                }
                break;

              case Tclass.bishop:
                if (!bmagedam) {
                  if (!plyzston) {
                    isplyze(charpm);
                  }
                }
                break;

              default:
                break;
            }
          }
        }

        /** TYPE3DAM. The third trap has five faces, and only the first is aimed at one person. */
        function type3dam(): void {
          function hpdamall(chanchit: number, hitcnt: number, hitdam: number): void {
            for (let charxhit: number = 0; charxhit <= (g.partycnt - 1); charxhit++) {
              if ((random() % 100) < chanchit) {
                hpdamage(charxhit, hitcnt, hitdam);
              } else if ((random() % 100) < chanchit) {
                hpdamage(charxhit, hitcnt, Math.trunc(hitdam / 2) + 1);
              }
            }
          }

          switch (rvar.trap3typ) {
            case 0: hpdamage(chrxchst, g.mazelev, 8); break;
            case 1: hpdamall(50, g.mazelev, 8); break;
            case 2: hpdamall(70, g.mazelev, 6); break;
            case 3: hpdamall(30, g.mazelev, 12); break;
            case 4: g.charactr[chrxchst].status = Tstatus.plyze; break;
            default: break;
          }
        }

        rt().display.hires.clrrect(13, 8, 26, 2);
        rt().display.mvcursor(13, 8);

        if (traptype !== 0) {
          printstr('OOPPS! A ');
          await prtrapty(traptype, rvar.trap3typ);
        } else {
          printstr('THE CHEST WAS NOT TRAPPED');
        }

        await pause2();

        switch (traptype) {
          case 1:
            g.charactr[chrxchst].lostLocation[0] = g.charactr[chrxchst].lostLocation[0] + 1;
            break;

          case 2:
            // LUCKSKIL is a threshold to fall below rather than a score to beat: EQUIPCHR sets it to
            // (20 - CHARLEV DIV 5) - (LUCK DIV 6) and a thief gets three taken off this very slot,
            // so the roll going under it is the save failing. Whoever is unpoisoned keeps whatever
            // poison they already had - it is set rather than added to, unlike the needle's.
            for (charx = 0; charx <= (g.partycnt - 1); charx++) {
              if ((random() % 20) < g.charactr[charx].skills[3]) {
                g.charactr[charx].lostLocation[0] = 1;
              }
            }
            break;

          case 3:
            type3dam();
            break;

          case 4:
            g.mazex = random() % (19 + 1);
            g.mazey = random() % (19 + 1);
            g.directio = random() % 4;
            break;

          case 5:
            antipm(true);
            break;

          case 6:
            antipm(false);
            break;

          case 7:
            g.chstalrm = 1;
            exit('REWARDS');
            break;

          default:
            break;
        }

        exit('ACHEST');
      }

      async function prtrap(): Promise<void> {
        rt().display.hires.clrrect(13, 8, 26, 2);
        rt().display.mvcursor(13, 8);
        await prtrapty(traptype, rvar.trap3typ);
        await pause2();
      }

      /** PRRNDTRP. A guess at the trap rather than a reading of it, got at by counting round. */
      async function prrndtrp(): Promise<void> {
        let trap: number = 0;
        const rndx: number = random() % 50;

        for (let looper: number = 1; looper <= rndx; looper++) {
          if (trap === 7) {
            trap = 0;
          } else {
            trap = trap + 1;
          }
        }

        rt().display.hires.clrrect(13, 8, 26, 2);
        rt().display.mvcursor(13, 8);
        await prtrapty(trap, random() % 5);
        await pause2();
      }

      /**
       * INSPCHST. One look each: a thief's agility counts six times over and a ninja's four, and a
       * look that goes badly wrong sets the trap off.
       */
      async function inspchst(): Promise<void> {
        await withExit('INSPCHST', async (): Promise<void> => {
          rt().display.hires.clrrect(13, 8, 26, 2);
          rt().display.mvcursor(15, 8);
          printstr('WHO (#) WILL INSPECT?');
          await getkey();

          const charinsp: number = ord(g.inchar) - ord('0') - 1;

          if ((charinsp < 0) || (charinsp >= g.partycnt)) {
            exit('INSPCHST');
          }

          if (g.charactr[charinsp].status !== Tstatus.ok) {
            exit('INSPCHST');
          }

          if (whotried[charinsp]) {
            rt().display.hires.clrrect(13, 8, 26, 1);
            rt().display.mvcursor(16, 8);
            printstr('YOU ALREADY LOOKED!');
            await pause2();
            exit('INSPCHST');
          }

          whotried[charinsp] = true;

          let chncgood: number = g.charactr[charinsp].attributes[Tattrib.agility];

          if (g.charactr[charinsp].characterClass === Tclass.thief) {
            chncgood = chncgood * 6;
          } else if (g.charactr[charinsp].characterClass === Tclass.ninja) {
            chncgood = chncgood * 4;
          }

          if (chncgood > 95) {
            chncgood = 95;
          }

          chrxchst = charinsp;

          if ((random() % 100) < chncgood) {
            await prtrap();
          } else if ((random() % 20) > g.charactr[charinsp].attributes[Tattrib.agility]) {
            await dotrapdm();
          } else {
            await prrndtrp();
          }
        });
      }

      /** CALFOCH. CALFO reads the trap nineteen times in twenty, and costs the slot either way. */
      async function calfoch(): Promise<void> {
        await withExit('CALFOCH', async (): Promise<void> => {
          rt().display.hires.clrrect(13, 8, 26, 2);
          rt().display.mvcursor(14, 8);
          printstr('WHO (#) WILL CAST CALFO?');
          await getkey();
          chrxchst = ord(g.inchar) - ord('0') - 1;

          if ((chrxchst < 0) || (chrxchst >= g.partycnt)) {
            exit('CALFOCH');
          }

          if (g.charactr[chrxchst].spellsKnown[CALFO_SPELL] === 0) {
            exit('CALFOCH');
          }

          if (spelgrp(g.charactr[chrxchst].priestSpellSlots, CALFO_GROUP) === 0) {
            exit('CALFOCH');
          }

          if (g.charactr[chrxchst].status !== Tstatus.ok) {
            exit('CALFOCH');
          }

          setspelgrp(g.charactr[chrxchst].priestSpellSlots,
                     CALFO_GROUP,
                     spelgrp(g.charactr[chrxchst].priestSpellSlots, CALFO_GROUP) - 1);

          if ((random() % 100) < 95) {
            await prtrap();
          } else {
            await prrndtrp();
          }
        });
      }

      /**
       * DISARMTR. The trap has to be named, exactly, and naming the wrong one sets it off. A thief
       * or a ninja is fifty better at it than anybody else.
       */
      async function disarmtr(): Promise<void> {
        await withExit('DISARMTR', async (): Promise<void> => {
          async function disarm(): Promise<void> {
            rt().display.hires.clrrect(13, 8, 26, 2);
            rt().display.mvcursor(18, 8);

            const sneaky: boolean = (g.charactr[chrxchst].characterClass === Tclass.thief)
                || (g.charactr[chrxchst].characterClass === Tclass.ninja);

            if ((random() % 70) < (g.charactr[chrxchst].level
                                   - g.mazelev
                                   + (50 * (sneaky ? 1 : 0)))) {
              printstr('YOU DISARMED IT!');
              await pause2();
              exit('ACHEST');
            } else if ((random() % 20) < g.charactr[chrxchst].attributes[Tattrib.agility]) {
              printstr('DISARM FAILED!!');
              await pause2();
              exit('DISARMTR');
            } else {
              printstr('YOU SET IT OFF!');
              await pause2();
              await dotrapdm();
            }
          }

          rt().display.hires.clrrect(13, 8, 26, 2);
          rt().display.mvcursor(16, 8);
          printstr('WHO (#) WILL DISARM?');
          await getkey();
          chrxchst = ord(g.inchar) - ord('0') - 1;

          if ((chrxchst < 0) || (chrxchst >= g.partycnt)) {
            exit('DISARMTR');
          }

          if (g.charactr[chrxchst].status !== Tstatus.ok) {
            exit('DISARMTR');
          }

          rt().display.hires.clrrect(13, 8, 26, 2);
          rt().display.mvcursor(13, 8);
          printstr('WHAT TRAP >');

          const trapstr: string = await getstr(24, 8);

          if ((trapstr === 'POISON NEEDLE') && (traptype === 1)) {
            await disarm();
          } else if ((trapstr === 'GAS BOMB') && (traptype === 2)) {
            await disarm();
          } else if (traptype === 3) {
            // Naming the wrong one of the third trap's five faces does nothing at all, where naming
            // the wrong trap altogether sets it off.
            switch (rvar.trap3typ) {
              case 0: if (trapstr === 'CROSSBOW BOLT') { await disarm(); } break;
              case 1: if (trapstr === 'EXPLODING BOX') { await disarm(); } break;
              case 2: if (trapstr === 'SPLINTERS') { await disarm(); } break;
              case 3: if (trapstr === 'BLADES') { await disarm(); } break;
              case 4: if (trapstr === 'STUNNER') { await disarm(); } break;
              default: break;
            }
          } else if ((trapstr === 'TELEPORTER') && (traptype === 4)) {
            await disarm();
          } else if ((trapstr === 'ANTI-MAGE') && (traptype === 5)) {
            await disarm();
          } else if ((trapstr === 'ANTI-PRIEST') && (traptype === 6)) {
            await disarm();
          } else if ((trapstr === 'ALARM') && (traptype === 7)) {
            await disarm();
          } else {
            await dotrapdm();
          }
        });
      }

      /** OPENCHST. Opening it by hand, which sets off whatever is on it barring a thousandth. */
      async function openchst(): Promise<void> {
        await withExit('OPENCHST', async (): Promise<void> => {
          rt().display.hires.clrrect(13, 8, 26, 2);
          rt().display.mvcursor(17, 8);
          printstr('WHO (#) WILL OPEN?');
          await getkey();
          chrxchst = ord(g.inchar) - ord('0') - 1;

          if ((chrxchst < 0) || (chrxchst >= g.partycnt)) {
            exit('OPENCHST');
          }

          if (g.charactr[chrxchst].status !== Tstatus.ok) {
            exit('OPENCHST');
          }

          if (traptype === 0) {
            exit('ACHEST');
          }

          if ((random() % 1000) < g.charactr[chrxchst].level) {
            exit('ACHEST');
          }

          await dotrapdm();
        });
      }

      await pic2scrn(CHEST_PICTURE);
      whotried.fill(false);
      gttrapty();
      rt().display.hires.clrrect(13, 6, 26, 4);
      rt().display.mvcursor(13, 6);
      printstr('A CHEST! YOU MAY:');

      for (;;) {
        rt().display.hires.clrrect(13, 8, 26, 2);
        rt().display.mvcursor(13, 8);
        printstr('O)PEN     C)ALFO   L)EAVE');
        rt().display.mvcursor(13, 9);
        printstr('I)NSPECT  D)ISARM');
        await getkey();

        if (g.inchar === 'O') {
          await openchst();
        } else if (g.inchar === 'L') {
          exitrwds();
        } else if (g.inchar === 'I') {
          await inspchst();
        } else if (g.inchar === 'C') {
          await calfoch();
        } else if (g.inchar === 'D') {
          await disarmtr();
        }
      }
    });
  }

  /** GETREWRD. One of the reward record's entries, which is either money or a thing. */
  async function getrewrd(rewardm: IRewardEntry): Promise<void> {
    await withExit('GETREWRD', async (): Promise<void> => {
      let itemindx: number = 0;
      let chariiii: number = 0;
      let charxxxx: number = 0;

      /** CALCULAT. So many rolls of so many sides, plus a fixed amount. */
      function calculat(tries: number, aveamt: number, minadd: number): number {
        let total: number = minadd;
        let left: number = tries;

        while (left > 0) {
          total = total + (random() % aveamt) + 1;
          left = left - 1;
        }

        return total;
      }

      // REWDCALC read as GOLD. The amount is rolled, multiplied by a fixed number, multiplied again
      // by a second roll, and then doubled where the party walked into the fight unprepared.
      function goldrewd(): void {
        const goldamt: ITwizlong = newlong();

        goldamt.low = calculat(rewardm.calculation[0],
                               rewardm.calculation[1],
                               rewardm.calculation[2]);
        multlong(goldamt, rewardm.calculation[3]);
        charxxxx = calculat(rewardm.calculation[4],
                            rewardm.calculation[5],
                            rewardm.calculation[6]);
        multlong(goldamt, charxxxx);
        multlong(goldamt, rvar.oneortwo);
        addlongs(gold2one, goldamt);
      }

      // REWDCALC read as ITEM: the lowest item it can be, how far along a better one is, how many
      // times better it can get, the range, and how likely each step up is.
      async function itemrewd(): Promise<void> {
        await withExit('ITEMREWD', async (): Promise<void> => {
          charxxxx = random() % g.partycnt;

          while (g.charactr[charxxxx].status !== Tstatus.ok) {
            charxxxx = (charxxxx + 1) % g.partycnt;
          }

          if (g.charactr[charxxxx].possessions.count === 8) {
            // Whoever it is was picked at random and their hands are full, so the item is lost
            // rather than offered to anybody else.
            exit('ITEMREWD');
          }

          chariiii = 0;

          // The roll is on the left of the AND and is what the loop turns on, so it happens every
          // time the condition is tested either way round.
          while ((calculat(1, 100, 1) < rewardm.calculation[4])
                 && (chariiii < rewardm.calculation[2])) {
            chariiii = chariiii + 1;
          }

          itemindx = rewardm.calculation[0]
              + calculat(1, rewardm.calculation[3], 1)
              + (rewardm.calculation[1] * chariiii);
          await founditm(charxxxx, chariiii, itemindx);
          await pause2();
        });
      }

      if (rewardm.chance < (random() % 100)) {
        exit('GETREWRD');
      }

      if (rewardm.isItem === 0) {
        goldrewd();
      } else {
        await itemrewd();
      }
    });
  }

  /** GIVEGOLD. The gold is shared between the living, and the dead get nothing. */
  async function givegold(): Promise<void> {
    divlong(gold2one, rvar.alivecnt);
    rt().display.hires.clrrect(1, 11, 38, 4);
    rt().display.mvcursor(1, 12);
    printstr('EACH SHARE IS WORTH ');
    prlong2(gold2one);
    printstr(' GP!');

    for (indx = 0; indx <= (g.partycnt - 1); indx++) {
      if (g.charactr[indx].status === Tstatus.ok) {
        addlongs(g.charactr[indx].gold, gold2one);
      }
    }

    await pause2();
  }

  await enmyrewd();
  await rdreward();
  unitclear();

  if (rewardz.hasChest && (g.chstalrm !== 1)) {
    await achest();
    rt().display.hires.clrrect(3, 5, 9, 5);
  } else {
    g.chstalrm = 0;
  }

  rt().display.hires.clrrect(1, 11, 38, 4);
  await pic2scrn(REWARD_PICTURE);

  for (indx = 1; indx <= rewardz.entryCount; indx++) {
    await getrewrd(rewardz.entries[indx - 1]);
  }

  await givegold();
}



/** Puts the segment's variables back, for a test that wants a known starting point. */
export function resetrewards(): void {
  rvar.alivecnt = 0;
  rvar.oneortwo = 0;
  rvar.rewardi = 0;
  rvar.trap3typ = 0;
  expperch.low = 0;
  expperch.mid = 0;
  expperch.high = 0;
}
