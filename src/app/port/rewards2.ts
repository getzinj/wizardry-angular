// Wiz1C.DSK/REWARDS2.TEXT.txt - the experience for the fight, and the REWARDS segment's own body,
// which is where the original puts it too.
//
// Nothing on the disk says what a monster is worth. The number is worked out here, from what the
// monster can do: its hit dice, whether it breathes, what it can cast, what it drains, how fast it
// heals, how hard it is to hit, how many times it strikes, and how much magic it shrugs off.

import type { IExperienceTable, IMonster } from '../data/layout/wiz-types';
import { Zone, experienceTable, monster } from '../data/layout/wiz-types';
import { exit, withExit } from '../runtime/pascal-exit';
import { disk, rt } from '../runtime/runtime';
import { batreslt } from './combat';
import { chstgold, expperch, prlong2, rvar } from './rewards';
import type { ITwizlong } from './wiz';
import type { Tclass } from './wiz';
import { Tstatus, Xgoto, g } from './wiz';
import { addlongs, divlong, multlong, newlong, pause2, printstr } from './wiz2';

/** The highest level the experience table holds a figure for; past it each one costs the same. */
const TABULATED_LEVELS: number = 12;


/** GIVEEXP. What the fight was worth, shared between whoever is still standing at the end of it. */
async function giveexp(): Promise<void> {
  await withExit('GIVEEXP', async (): Promise<void> => {
    let charxxx: number = 0;
    const killexp: ITwizlong = newlong();

    /** CNTALIVE. With nobody left there is nothing to pay, and the party are already in the ground. */
    function cntalive(): void {
      rvar.alivecnt = 0;

      for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
        if (g.charactr[g.llbase04].status === Tstatus.ok) {
          rvar.alivecnt = rvar.alivecnt + 1;
        }
      }

      if (rvar.alivecnt === 0) {
        g.xgoto = Xgoto.xcemetry;
        exit('REWARDS');
      }
    }

    /** CALC1EXP. Every group that was fought, added up and divided between the survivors. */
    function calc1exp(): void {
      let mult2040: number = 0;

      function totalexp(): void {
        const enemyrec: IMonster =
          disk().read(Zone.monster, batreslt.enmyid[charxxx], monster);

        /**
         * CALCKILL. What one of them is worth. The original's own comment notes that Legacy of
         * Llylgamyn simply took EXPAMT off the monster record; this works it out instead, and the
         * number on the record is not read at all.
         */
        function calckill(): void {
          const killexpx: ITwizlong = newlong();

          function setkillx(amount: number): void {
            killexpx.high = 0;
            killexpx.mid = 0;
            killexpx.low = amount;
          }

          /** MLTADDKX. The amount doubled once per step, which is what makes the later terms tell. */
          function mltaddkx(multiply: number, amount: number): void {
            let left: number = multiply;

            if (left !== 0) {
              setkillx(amount);

              while (left > 1) {
                left = left - 1;
                addlongs(killexpx, killexpx);
              }

              addlongs(killexp, killexpx);
            }
          }

          killexp.low = 0;
          killexp.mid = 0;
          killexp.high = 0;
          killexpx.low = 0;
          killexpx.mid = 0;
          killexpx.high = 0;

          setkillx(enemyrec.hitPoints.diceCount * enemyrec.hitPoints.diceSides);

          if (enemyrec.breathes === 0) {
            mult2040 = 20;
          } else {
            mult2040 = 40;
          }

          multlong(killexpx, mult2040);
          addlongs(killexp, killexpx);
          mltaddkx(enemyrec.mageSpellLevel, 35);
          mltaddkx(enemyrec.priestSpellLevel, 35);
          mltaddkx(enemyrec.levelDrain, 200);
          mltaddkx(enemyrec.healingPerTurn, 90);

          setkillx(40 * (11 - enemyrec.armourClass));
          addlongs(killexp, killexpx);

          if (enemyrec.attackCount > 1) {
            mltaddkx(enemyrec.attackCount, 30);
          }

          if (enemyrec.resistances > 0) {
            mltaddkx(Math.trunc(enemyrec.resistances / 10) + 1, 40);
          }

          g.llbase04 = 0;

          for (let wepsty3i: number = 1; wepsty3i <= 6; wepsty3i++) {
            if (enemyrec.weakVersusType3[wepsty3i] !== 0) {
              g.llbase04 = g.llbase04 + 1;
            }
          }

          mltaddkx(g.llbase04, 35);
          g.llbase04 = 0;

          for (let sppci: number = 0; sppci <= 6; sppci++) {
            if (enemyrec.properties[sppci] !== 0) {
              g.llbase04 = g.llbase04 + 1;
            }
          }

          mltaddkx(g.llbase04, 40);
        }

        calckill();
        multlong(killexp, batreslt.enmycnt[charxxx]);
        addlongs(expperch, killexp);
      }

      expperch.low = 0;
      expperch.mid = 0;
      expperch.high = 0;

      for (charxxx = 1; charxxx <= 4; charxxx++) {
        if (batreslt.enmyid[charxxx] >= 0) {
          totalexp();
        }
      }

      divlong(expperch, rvar.alivecnt);
    }

    /**
     * CHKDRAIN. A level that combat drained is paid for here: the character is put back to the
     * experience their new level starts at, plus one point, so the level is really gone rather than
     * earned back on the walk home.
     */
    async function chkdrain(): Promise<void> {
      await withExit('CHKDRAIN', async (): Promise<void> => {
        const exptable: IExperienceTable = disk().read(Zone.experience, 0, experienceTable);

        async function droplevl(charexp: ITwizlong,
                                currlevl: number,
                                characterClass: Tclass): Promise<void> {
          rt().display.mvcursor(1, 13);
          printstr('HE HAD ');
          prlong2(charexp);
          printstr(' EP');

          const dropped: number = currlevl - 1;

          if (dropped === 0) {
            charexp.low = 0;
            charexp.mid = 0;
            charexp.high = 0;
          } else if (dropped < 13) {
            Object.assign(charexp, exptable[characterClass][dropped]);
          } else {
            Object.assign(charexp, exptable[characterClass][TABULATED_LEVELS]);

            // Element nought of a class's row is not a level: it is what each one past the twelfth
            // costs on top of the twelfth. CHARXXX is GIVEEXP's own counter and the loop that called
            // this is using it, so draining anybody past the twelfth level ends that loop early.
            // Combat has already taken the level off whoever comes after them; what they keep is the
            // experience for it, which the next visit to the inn hands the level straight back for.
            for (charxxx = 13; charxxx <= dropped; charxxx++) {
              addlongs(charexp, exptable[characterClass][0]);
            }
          }

          addlongs(charexp, killexp);
          rt().display.mvcursor(1, 14);
          printstr('HE HAS ');
          prlong2(charexp);
          printstr(' EP NOW');
          await pause2();
        }

        killexp.high = 0;
        killexp.mid = 0;
        killexp.low = 1;

        for (charxxx = 0; charxxx <= (g.partycnt - 1); charxxx++) {
          if (batreslt.drained[charxxx]) {
            rt().display.hires.clrrect(1, 11, 38, 4);
            rt().display.mvcursor(1, 11);
            printstr(g.charactr[charxxx].name);
            printstr(' WAS DRAINED!');
            await droplevl(g.charactr[charxxx].experience,
                           g.charactr[charxxx].level,
                           g.charactr[charxxx].characterClass);
          }
        }

        rt().display.hires.clrrect(1, 11, 38, 4);

        if (g.xgoto === Xgoto.xreward2) {
          // Running away pays nothing, so the rest of GIVEEXP is skipped - but the drained have
          // already had their levels taken off them above.
          exit('GIVEEXP');
        }

        for (charxxx = 0; charxxx <= (g.partycnt - 1); charxxx++) {
          if (g.charactr[charxxx].status === Tstatus.ok) {
            exit('CHKDRAIN');
          }
        }

        g.xgoto = Xgoto.xcemetry;
        exit('REWARDS');
      });
    }

    // The original takes the battle result out of the disk cache here, where COMBAT left it, and
    // then clears the dirty flag so those bytes are never written to the disk as though they were a
    // record. There is no cache here: the result is simply where COMBAT left it.
    cntalive();
    await chkdrain();
    calc1exp();
    rt().display.hires.clrrect(13, 1, 26, 4);
    rt().display.mvcursor(13, 1);
    printstr('FOR KILLING THE MONSTERS');
    rt().display.mvcursor(13, 2);
    printstr('EACH SURVIVOR GETS ');
    prlong2(expperch);
    rt().display.mvcursor(13, 3);
    printstr('EXPERIENCE POINTS');
    await pause2();

    for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
      if (g.charactr[g.llbase04].status === Tstatus.ok) {
        addlongs(g.charactr[g.llbase04].experience, expperch);
      }
    }
  });
}


/**
 * SEGMENT PROCEDURE REWARDS. Two ways in: the fight was won, or the party ran away from it.
 *
 * Winning sets the way out before anything is paid, so every path through here that does not throw
 * itself out ends with the party back in the maze. Running away is paid nothing and shown a
 * scenario message instead.
 */
export async function rewards(): Promise<void> {
  await withExit('REWARDS', async (): Promise<void> => {
    if (g.xgoto === Xgoto.xreward) {
      g.xgoto = Xgoto.xrunner;
      await giveexp();
      await chstgold();
    } else if (g.xgoto === Xgoto.xreward2) {
      await giveexp();
      g.llbase04 = 0;
      g.xgoto = Xgoto.xscnmsg;
    }
  });
}
