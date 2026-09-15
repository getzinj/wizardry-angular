// Wiz1B.DSK/COMBAT4.TEXT.txt - CASTASPE, which is every spell in the game as it works in a fight.
//
// One spell number comes in and the two long lists of IFs below find it. Both lists are walked
// every time, which is why a priest spell still costs the mage list's comparisons, and it is also
// why a spell number that matches nothing simply does nothing.
//
// MELEE's own variables are passed in rather than shared: the two sub-segments only ever read them.

import type { ICharacter } from '../data/layout/wiz-types';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { rt } from '../runtime/runtime';
import {
  BADI, BADIAL, BADIALMA, BADIOS, BAMATU, DALTO, DI, DIAL, DIALKO, DIALMA, DILTO, DIOS, GROUP_COUNT,
  HALITO, HAMAN, KADORTO, KALKI, KANDI, KATINO, LAHALITO, LAKANITO, LATUMAPI, LATUMOFI, LITOKAN,
  LOKTOFEI, LOMILWA, LORTO, MABADI, MADALTO, MADI, MAHALITO, MAHAMAN, MAKANITO, MALIKTO, MALOR,
  MAMORLIS, MANIFO, MAPORFIC, MASOPIC, MATU, MILWA, MOGREF, MOLITO, MONTINO, MORLIS, PORFIC, SOPIC,
  TILTOWAI, ZILWAN, battlerc, drained,
} from './combat';
import type { ITemp04 } from './combat';
import { Zone } from '../data/layout/wiz-types';
import { PARTY_MAXIMUM, Tstatus, Xgoto, g } from './wiz';
import { chr, pause1, pause2, printnum, printstr, random, textmode, write } from './wiz2';

/** THITHEAL: a roll of HITS dice of HITRANGE, plus HITMIN. */
interface IThitheal {
  hits: number;
  hitrange: number;
  hitmin: number;
}

/**
 * CASTASPE's own variables, which outlive a call here because the original's outlive one too:
 * CASTI is read by the group spells but written only where the group is real and still has somebody
 * in it, so a group that died between the order and the blow is hit at whatever index was last left
 * behind. What that index is cannot be known - the original's frame is stack space that SWINGASW,
 * called from the same statement of MELEE, writes over with its own - so this keeps the last cast's,
 * which is the closest a port can come to it.
 */
let spell: number = 0;
let casti: number = 0;
let castgr: number = 0;


/** SEGMENT PROCEDURE CASTASPE. */
export async function castaspe(batg: number, bati: number): Promise<void> {
  await withExit('CASTASPE', async (): Promise<void> => {
    /** DSPNAMES. Whoever it is, named as the party know them: a monster they have not placed yet
     *  goes by what it looks like. */
    function dspnames(groupi: number, mychari: number): void {
      if (groupi === 0) {
        printstr(g.charactr[mychari].name);
      } else if (battlerc[groupi].a.identifi) {
        printstr(battlerc[groupi].b.name);
      } else {
        printstr(battlerc[groupi].b.unidentifiedName);
      }

      printstr(' ');
    }

    /**
     * UNAFFECT. Damage, and what it says about it. A monster's kind resists spells outright, which
     * is rolled for here as well as wherever the damage was worked out.
     */
    async function unaffect(groupi: number, charx: number, dampts: number): Promise<void> {
      await withExit('UNAFFECT', async (): Promise<void> => {
        let damage: number = dampts;

        rt().display.hires.clrrect(1, 12, 38, 3);

        if (battlerc[groupi].a.temp04[charx].status >= Tstatus.dead) {
          exit('UNAFFECT');
        }

        rt().display.mvcursor(1, 12);
        dspnames(groupi, charx);

        if (groupi !== 0) {
          if (battlerc[groupi].b.resistances > (random() % 100)) {
            damage = 0;
          }
        }

        if (damage === 0) {
          printstr('IS UNAFFECTED!');
        } else {
          printstr('TAKES ');
          printnum(damage, 4);
          printstr(' DAMAGE');

          const one: ITemp04 = battlerc[groupi].a.temp04[charx];

          one.hpleft = one.hpleft - damage;

          if (one.hpleft <= 0) {
            one.hpleft = 0;
            one.status = Tstatus.dead;
            rt().display.mvcursor(1, 14);
            dspnames(groupi, charx);
            printstr('DIES!');
          }
        }

        await pause1();
      });
    }

    /** ISISNOT. The spells that do something other than damage: held, silenced, slain, slept. */
    async function isisnot(groupi: number,
                           chari: number,
                           isnotchn: number,
                           sdamtype: string,
                           damtype: number): Promise<void> {
      rt().display.mvcursor(1, 13);
      dspnames(groupi, chari);

      if ((random() % 100) < isnotchn) {
        printstr('IS NOT ');
      } else {
        printstr('IS ');

        switch (damtype) {
          case 0:
          case 3:
            battlerc[groupi].a.temp04[chari].status = Tstatus.asleep;
            break;

          case 1:
            battlerc[groupi].a.temp04[chari].inaudcnt = (random() % 4) + 2;
            break;

          case 2:
            battlerc[groupi].a.temp04[chari].status = Tstatus.dead;
            battlerc[groupi].a.temp04[chari].hpleft = 0;
            break;

          default:
            break;
        }
      }

      printstr(sdamtype);
      await pause1();
      rt().display.hires.clrrect(1, 13, 38, 1);
    }

    function calcpts(hitheal: IThitheal): number {
      const roll: IThitheal = { ...hitheal };
      let points: number = 0;

      while (roll.hits > 0) {
        points = points + (random() % roll.hitrange) + 1;
        roll.hits = roll.hits - 1;
      }

      return points + roll.hitmin;
    }

    /** MODAC. What the armour spells do, which is kept apart from the character's own armour class
     *  so that it lasts only as long as the fight. */
    function modac(groupi: number, acmod: number, charf: number, charl: number): void {
      for (let x: number = charf; x <= charl; x++) {
        battlerc[groupi].a.temp04[x].armorcl = battlerc[groupi].a.temp04[x].armorcl + acmod;
      }
    }

    function doheal(groupi: number, chari: number, hitcnt: number, hitrange: number): void {
      const hitheal: IThitheal = { hits: hitcnt, hitrange, hitmin: 0 };
      const points: number = calcpts(hitheal);

      battlerc[groupi].a.temp04[chari].hpleft =
        battlerc[groupi].a.temp04[chari].hpleft + points;

      if (g.charactr[chari].maximumHitPoints < battlerc[groupi].a.temp04[chari].hpleft) {
        battlerc[groupi].a.temp04[chari].hpleft = g.charactr[chari].maximumHitPoints;
      }

      dspnames(groupi, chari);

      if (g.charactr[chari].maximumHitPoints === battlerc[groupi].a.temp04[chari].hpleft) {
        printstr('IS FULLY HEALED');
      } else {
        printstr('IS PARTIALLY HEALED');
      }
    }

    async function dohits(groupi: number,
                          chari: number,
                          hitcnt: number,
                          hitrange: number): Promise<void> {
      const hitheal: IThitheal = { hits: hitcnt, hitrange, hitmin: 0 };
      let points: number = calcpts(hitheal);

      if (groupi > 0) {
        if (battlerc[groupi].b.resistances > 0) {
          if ((random() % 100) < battlerc[groupi].b.resistances) {
            points = 0;
          }
        }
      }

      await unaffect(groupi, chari, points);
    }

    async function dohold(): Promise<void> {
      for (let charx: number = 0; charx <= (battlerc[castgr].a.alivecnt - 1); charx++) {
        if (battlerc[castgr].a.temp04[charx].status <= Tstatus.asleep) {
          if (castgr === 0) {
            await isisnot(castgr, charx, 50 + (10 * g.charactr[charx].level), 'HELD', 0);
          } else {
            await isisnot(castgr,
                          charx,
                          50 + (10 * battlerc[castgr].b.hitPoints.diceCount),
                          'HELD',
                          0);
          }
        }
      }
    }

    async function dosilenc(): Promise<void> {
      for (let charx: number = 0; charx <= (battlerc[castgr].a.alivecnt - 1); charx++) {
        if (castgr === 0) {
          await isisnot(castgr, charx, 100 - (5 * g.charactr[charx].skills[4]), 'SILENCED', 1);
        } else {
          await isisnot(castgr,
                        charx,
                        10 * battlerc[castgr].b.hitPoints.diceCount,
                        'SILENCED',
                        1);
        }
      }
    }

    /** DODISRUP. The spells that only work out of a fight say so when one is cast in a fight. */
    function dodisrup(): void {
      rt().display.mvcursor(1, 13);
      printstr('SPELL DISRUPTED');
    }

    async function doslain(groupi: number, chari: number): Promise<void> {
      let chnotsln: number = 0;

      if (groupi === 0) {
        chnotsln = g.charactr[chari].level;
      } else {
        chnotsln = battlerc[groupi].b.hitPoints.diceCount;
      }

      await isisnot(groupi, chari, 10 * chnotsln, 'SLAIN', 2);
    }

    async function doslept(): Promise<void> {
      for (let charx: number = 0; charx <= (battlerc[castgr].a.alivecnt - 1); charx++) {
        if (battlerc[castgr].a.temp04[charx].status < Tstatus.asleep) {
          if (castgr > 0) {
            // Only the kinds of monster that sleep at all, which is what property four says.
            if (battlerc[castgr].b.properties[4] !== 0) {
              await isisnot(castgr,
                            charx,
                            20 * battlerc[castgr].b.hitPoints.diceCount,
                            'SLEPT',
                            3);
            }
          } else {
            await isisnot(castgr, charx, 20 * g.charactr[charx].level, 'SLEPT', 3);
          }
        }
      }
    }

    /**
     * HAMMAHAM. HAMAN and MAHAMAN: both cost the caster a level and then do one of seven things,
     * chosen by a number that cannot reach most of them.
     */
    async function hammaham(mahamflg: number): Promise<void> {
      await withExit('HAMMAHAM', async (): Promise<void> => {
        let temp2: number = 0;
        let temp1: number = 0;

        function hamcure(): void {
          printstr('DIALKO\'S PARTY 3 TIMES');

          const hitheal: IThitheal = { hits: 9, hitrange: 8, hitmin: 0 };

          for (temp1 = 0; temp1 <= (g.partycnt - 1); temp1++) {
            if (battlerc[0].a.temp04[temp1].status < Tstatus.dead) {
              const one: ITemp04 = battlerc[0].a.temp04[temp1];

              one.status = Tstatus.ok;
              one.inaudcnt = 0;
              one.hpleft = one.hpleft + calcpts(hitheal);

              if (one.hpleft > g.charactr[temp1].maximumHitPoints) {
                one.hpleft = g.charactr[temp1].maximumHitPoints;
              }
            }
          }
        }

        function hamsilen(): void {
          printstr('SILENCES MONSTERS!');

          for (temp1 = 1; temp1 <= 3; temp1++) {
            for (temp2 = 0; temp2 <= (battlerc[temp1].a.alivecnt - 1); temp2++) {
              battlerc[temp1].a.temp04[temp2].inaudcnt = 5 + (random() % 5);
            }
          }
        }

        function hammagic(): void {
          printstr('ZAPS MONSTER MAGIC RESISTANCE!');

          for (temp1 = 1; temp1 <= 3; temp1++) {
            battlerc[temp1].b.resistances = 0;
          }
        }

        function hamtelep(): void {
          printstr('DESTROYS MONSTERS!');

          for (temp1 = 1; temp1 <= 4; temp1++) {
            for (temp2 = 0; temp2 <= (battlerc[temp1].a.alivecnt - 1); temp2++) {
              battlerc[temp1].a.temp04[temp2].status = Tstatus.dead;
              battlerc[temp1].a.temp04[temp2].hpleft = 0;
            }

            battlerc[temp1].a.alivecnt = 0;
          }
        }

        function hamheal(): void {
          printstr('HEALS PARTY!');

          for (temp1 = 0; temp1 <= (g.partycnt - 1); temp1++) {
            if (battlerc[0].a.temp04[temp1].status < Tstatus.dead) {
              const one: ITemp04 = battlerc[0].a.temp04[temp1];

              one.status = Tstatus.ok;
              one.inaudcnt = 0;
              one.hpleft = g.charactr[temp1].maximumHitPoints;
            }
          }
        }

        function hamprot(): void {
          printstr('SHIELDS PARTY');

          for (temp1 = 0; temp1 <= (g.partycnt - 1); temp1++) {
            if (g.charactr[temp1].armourClass > -10) {
              g.charactr[temp1].armourClass = -10;
            }
          }
        }

        function hamalive(): void {
          printstr('RESSURECTS AND ');

          for (temp1 = 0; temp1 <= (g.partycnt - 1); temp1++) {
            if (battlerc[0].a.temp04[temp1].status !== Tstatus.lost) {
              battlerc[0].a.temp04[temp1].status = Tstatus.ok;
            }
          }

          hamheal();
        }

        /** HAMMANGL. The price of asking too often: half the caster's spells are forgotten. */
        function hammangl(): void {
          rt().display.mvcursor(1, 14);
          printstr('BUT HIS SPELL BOOKS ARE MANGLED!');

          // TEMP1 is not the caster: it is wherever the branch above left its own FOR loop. What
          // that is depends on the value a Pascal FOR leaves its counter at when it ends, which the
          // language leaves undefined; on the reading taken here - one past the limit - it is four,
          // five, or one past the party, and so for a full party the original wrote past the end of
          // CHARACTR and into the table of contents behind it. Only the store was out of bounds, so
          // the fifty draws happen either way and the rest of the fight rolls the same numbers.
          const mangles: boolean = temp1 < PARTY_MAXIMUM;

          for (let spelli: number = 1; spelli <= 50; spelli++) {
            if (((random() % 100) > 50) && mangles) {
              g.charactr[temp1].spellsKnown[spelli] = 0;
            }
          }
        }

        if (mahamflg === 7) {
          printstr('MA');
        }

        printstr('HAMAN IS INTONED AND...');
        await pause2();
        rt().display.mvcursor(1, 13);

        if (g.charactr[bati].level < 13) {
          printstr('FAILS!');
          exit('HAMMAHAM');
        }

        g.charactr[bati].level = g.charactr[bati].level - 1;
        drained[bati] = true;

        // MOD and * bind equally and go left to right, so this is (RANDOM MOD 3) * MAHAMFLG: three
        // of the seven outcomes for HAMAN and three others for MAHAMAN. The labels the original
        // wrote for the rest cannot be reached, and its own comments say as much.
        switch ((random() % 3) * mahamflg) {
          case 0: case 1: case 2: case 3: case 4: case 5: hamcure(); break;
          case 7: case 8: case 9: case 10: case 11: hamsilen(); break;
          case 12: case 13: case 22: case 23: hammagic(); break;
          case 14: case 20: case 21: hamtelep(); break;
          case 6: case 15: case 19: hamheal(); break;
          case 17: hamprot(); break;
          case 16: case 18: hamalive(); break;
          default: break;
        }

        if ((random() % g.charactr[bati].level) === 5) {
          hammangl();
        }
      });
    }

    /** HITGROUP. The spells that hit everything in a group, at half strength against what resists. */
    async function hitgroup(groupi: number,
                            hitsx: number,
                            hitsr: number,
                            temp99i: number): Promise<void> {
      if (battlerc[groupi].a.alivecnt > 0) {
        for (let chari: number = 0; chari <= (battlerc[groupi].a.alivecnt - 1); chari++) {
          if (groupi === 0) {
            // A word copy in the original, from a row of seven bits into a field of sixteen: the
            // party have no monster record, so the one in slot zero is borrowed to carry whatever
            // the character's own resistances are. Only the first three are ever looked at.
            battlerc[0].b.weakVersusType3 = g.charactr[chari].bonusVersusType3[1]
                .concat(new Array<number>(9).fill(0));
          }

          if (battlerc[groupi].b.weakVersusType3[temp99i] !== 0) {
            await dohits(groupi, chari, Math.trunc(hitsx / 2) + 1, hitsr);
          } else {
            await dohits(groupi, chari, hitsx, hitsr);
          }
        }
      }
    }

    /** SLOKTOFE. LOKTOFEIT: everything the party are carrying, and their gold, for a way out. */
    function sloktofe(): void {
      withExitSync('SLOKTOFE', (): void => {
        if ((random() % 100) > (2 * g.charactr[bati].level)) {
          rt().display.mvcursor(1, 13);
          printstr('LOKTOFEIT FAILS!');
          exit('SLOKTOFE');
        }

        for (let tempxx: number = 0; tempxx <= (g.partycnt - 1); tempxx++) {
          for (let possx: number = 1; possx <= g.charactr[tempxx].possessions.count; possx++) {
            const held: ICharacter['possessions']['items'][number] =
              g.charactr[tempxx].possessions.items[possx - 1];

            held.objectIndex = 0;
            held.identified = false;
            held.cursed = false;
            held.equipped = false;
          }

          g.charactr[tempxx].possessions.count = 0;

          // Only the top eight digits of their gold, which leaves them whatever was in the low four.
          g.charactr[tempxx].gold.high = 0;
          g.charactr[tempxx].gold.mid = 0;
        }

        g.xgoto = Xgoto.xchk4win;
        write(chr(12));
        textmode();
        exit('COMBAT');
      });
    }

    /** SMAKANIT. MAKANITO: everything that breathes and is no higher than the seventh level dies. */
    async function smakanit(): Promise<void> {
      for (let groupi: number = 1; groupi <= 4; groupi++) {
        if (battlerc[groupi].a.alivecnt > 0) {
          rt().display.mvcursor(1, 13);

          if (battlerc[groupi].a.identifi) {
            printstr(battlerc[groupi].b.plural);
          } else {
            printstr(battlerc[groupi].b.unidentifiedPlural);
          }

          if (battlerc[groupi].b.monsterClass === 10) {
            printstr(' ARE UNAFFECTED!');
          } else if (battlerc[groupi].b.hitPoints.diceCount > 7) {
            printstr(' SURVIVE!');
          } else {
            printstr(' PERISH!');

            // One past the living, which in the original wrote into the monster record behind them.
            for (let enemyx: number = 0; enemyx <= battlerc[groupi].a.alivecnt; enemyx++) {
              battlerc[groupi].a.temp04[enemyx].hpleft = 0;
              battlerc[groupi].a.temp04[enemyx].status = Tstatus.dead;
            }
          }

          await pause1();
          rt().display.hires.clrrect(1, 13, 38, 1);
        }
      }
    }

    /**
     * SMALOR. MALOR in a fight, which is not the MALOR of the camp: it picks a square at random and
     * then walks the level number down towards the daylight - and then floors it at the number of
     * levels the scenario has, which is the deepest one. So however the rolls go the party arrive at
     * the bottom of the maze, and the test for having come out of it, which follows the floor, can
     * never be met.
     */
    function smalor(): void {
      g.mazex = random() % 20;
      g.mazey = random() % 20;

      while ((random() % 100) < 30) {
        g.mazelev = g.mazelev - 1;
      }

      while ((random() % 100) < 10) {
        g.mazelev = g.mazelev - 1;
      }

      if (g.mazelev < g.scntoc.recordsOnDisk[Zone.maze]) {
        g.mazelev = g.scntoc.recordsOnDisk[Zone.maze];
      }

      rt().display.hires.clrrect(13, 1, 26, 4);

      if (g.mazelev === 0) {
        g.xgoto = Xgoto.xchk4win;
        write(chr(12));
        textmode();
      } else {
        g.xgoto = Xgoto.xnewmaze;
      }

      exit('COMBAT');
    }

    async function dopriest(): Promise<void> {
      if (spell === KALKI) {
        modac(0, 1, 0, g.partycnt - 1);
      }

      if (spell === DIOS) {
        doheal(0, castgr, 1, 8);
      }

      if (spell === BADIOS) {
        await dohits(castgr, casti, 1, 8);
      }

      if (spell === MILWA) {
        g.light = g.light + 15 + (random() % 15);
      }

      if (spell === PORFIC) {
        modac(0, 4, bati, bati);
      }

      if (spell === MATU) {
        modac(0, 2, 0, g.partycnt - 1);
      }

      if (spell === MANIFO) {
        await dohold();
      }

      if (spell === MONTINO) {
        await dosilenc();
      }

      if (spell === LOMILWA) {
        g.light = 32000;
      }

      if (spell === DIALKO) {
        dspnames(0, castgr);

        if ((battlerc[0].a.temp04[castgr].status === Tstatus.plyze)
            || (battlerc[0].a.temp04[castgr].status === Tstatus.asleep)) {
          battlerc[0].a.temp04[castgr].status = Tstatus.ok;
          printstr('IS CURED!');
        } else {
          printstr('IS NOT HELPED!');
        }
      }

      if (spell === LATUMAPI) {
        // The subscript is LLBASE04 rather than the loop's own counter, so what LATUMAPI really
        // does is place the group that whatever ran last left in that scratch word, four times
        // over. Where that is not a group at all the original wrote outside the array; here it
        // does nothing, which is the one thing that cannot be reproduced.
        for (let groupi: number = 1; groupi <= 4; groupi++) {
          if ((g.llbase04 >= 0) && (g.llbase04 < GROUP_COUNT)) {
            battlerc[g.llbase04].a.identifi = true;
          }
        }
      }

      if (spell === BAMATU) {
        modac(0, 4, 0, g.partycnt - 1);
      }

      if (spell === DIAL) {
        doheal(0, castgr, 2, 8);
      }

      if (spell === BADIAL) {
        await dohits(castgr, casti, 2, 8);
      }

      if (spell === LATUMOFI) {
        dspnames(0, castgr);
        printstr('IS UNPOISONED!');
        g.charactr[castgr].lostLocation[0] = 0;
      }

      if (spell === MAPORFIC) {
        g.acmod2 = 2;
      }

      if (spell === DIALMA) {
        doheal(0, castgr, 3, 8);
      }

      if (spell === BADIALMA) {
        await dohits(castgr, casti, 3, 8);
      }

      if (spell === LITOKAN) {
        await hitgroup(castgr, 3, 8, 1);
      }

      if (spell === KANDI) {
        dodisrup();
      }

      if (spell === DI) {
        dodisrup();
      }

      if (spell === BADI) {
        await doslain(castgr, casti);
      }

      if (spell === LORTO) {
        await hitgroup(castgr, 6, 6, 0);
      }

      if (spell === MADI) {
        battlerc[0].a.temp04[castgr].hpleft = g.charactr[castgr].maximumHitPoints;

        if (battlerc[0].a.temp04[castgr].status < Tstatus.dead) {
          battlerc[0].a.temp04[castgr].status = Tstatus.ok;
        }

        g.charactr[castgr].lostLocation[0] = 0;
        doheal(0, castgr, 1, 1);
      }

      if (spell === MABADI) {
        rt().display.hires.clrrect(1, 12, 38, 3);
        rt().display.mvcursor(1, 12);
        dspnames(castgr, casti);
        printstr(' IS HIT BY MABADI!');
        battlerc[castgr].a.temp04[casti].hpleft = 1 + (random() % 8);
      }

      if (spell === LOKTOFEI) {
        sloktofe();
      }

      if (spell === MALIKTO) {
        for (let groupi: number = 1; groupi <= 4; groupi++) {
          await hitgroup(groupi, 12, 6, 0);
        }
      }

      if (spell === KADORTO) {
        dodisrup();
      }
    }

    async function domage(): Promise<void> {
      if (spell === HALITO) {
        await dohits(castgr, casti, 1, 8);
      }

      if (spell === MOGREF) {
        modac(0, 2, bati, bati);
      }

      if (spell === KATINO) {
        await doslept();
      }

      if (spell === DILTO) {
        modac(castgr, -2, 0, battlerc[castgr].a.alivecnt - 1);
      }

      if (spell === SOPIC) {
        modac(0, 4, bati, bati);
      }

      if (spell === MAHALITO) {
        await hitgroup(castgr, 4, 6, 1);
      }

      if (spell === MOLITO) {
        await hitgroup(castgr, 3, 6, 0);
      }

      if (spell === MORLIS) {
        modac(castgr, -3, 0, battlerc[castgr].a.alivecnt - 1);
      }

      if (spell === DALTO) {
        await hitgroup(castgr, 6, 6, 2);
      }

      if (spell === LAHALITO) {
        await hitgroup(castgr, 6, 6, 1);
      }

      if (spell === MAMORLIS) {
        // From one rather than nought, so the first of each group keeps its armour and the slot
        // past the living loses some.
        for (let groupi: number = 1; groupi <= 4; groupi++) {
          modac(groupi, -3, 1, battlerc[groupi].a.alivecnt);
        }
      }

      if (spell === MAKANITO) {
        await smakanit();
      }

      if (spell === MADALTO) {
        await hitgroup(castgr, 8, 8, 2);
      }

      if (spell === LAKANITO) {
        for (let groupi: number = 0; groupi <= (battlerc[castgr].a.alivecnt - 1); groupi++) {
          if (battlerc[castgr].a.temp04[groupi].status < Tstatus.dead) {
            await isisnot(castgr,
                          groupi,
                          6 * battlerc[castgr].b.hitPoints.diceCount,
                          'SMOTHERED',
                          2);
          }
        }
      }

      if (spell === ZILWAN) {
        if (battlerc[castgr].b.monsterClass === 10) {
          await dohits(castgr, casti, 10, 200);
        }
      }

      if (spell === MASOPIC) {
        modac(0, 4, 0, g.partycnt - 1);
      }

      if (spell === HAMAN) {
        await hammaham(6);
      }

      if (spell === MALOR) {
        smalor();
      }

      if (spell === MAHAMAN) {
        await hammaham(7);
      }

      if (spell === TILTOWAI) {
        if (batg === 0) {
          for (let groupi: number = 1; groupi <= 4; groupi++) {
            await hitgroup(groupi, 10, 15, 0);
          }
        } else {
          await hitgroup(0, 10, 15, 0);
        }
      }
    }

    function exitcast(exitstr: string): void {
      rt().display.mvcursor(1, 12);
      printstr(exitstr);
      exit('CASTASPE');
    }

    dspnames(batg, bati);
    printstr('CASTS A SPELL');

    if (battlerc[batg].a.temp04[bati].inaudcnt > 0) {
      exitcast('WHICH FAILS TO BECOME AUDIBLE!');
    }

    if (g.fizzles > 0) {
      exitcast('WHICH FIZZLES OUT');
    }

    if (batg === 0) {
      castgr = battlerc[0].a.temp04[bati].victim;

      if ((castgr > 0) && (castgr < 5)) {
        if (battlerc[castgr].a.alivecnt > 0) {
          casti = bati % battlerc[castgr].a.alivecnt;
        }
      }

      spell = battlerc[0].a.temp04[bati].spellhsh;
    } else {
      castgr = 0;
      casti = battlerc[batg].a.temp04[bati].victim;
      spell = battlerc[batg].a.temp04[bati].spellhsh;
    }

    rt().display.mvcursor(1, 12);
    await domage();
    await dopriest();
  });
}


/** Puts CASTASPE's variables back, for a test that wants a known starting point. */
export function resetcastaspe(): void {
  spell = 0;
  casti = 0;
  castgr = 0;
}
