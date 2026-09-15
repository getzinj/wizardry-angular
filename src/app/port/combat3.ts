// Wiz1B.DSK/COMBAT3.TEXT.txt - the top of a round: what a night's worth of regeneration and a
// moment's recovery do to both sides, the two panels that say how the fight stands, and CUTIL's
// own body, which is the round itself.

import type { ICharacter } from '../data/layout/wiz-types';
import { exit, withExit } from '../runtime/pascal-exit';
import { rt } from '../runtime/runtime';
import { caction, enattack } from './combat2';
import type { ITenemy2 } from './combat';
import { battlerc, copytemp04, cvar, drained, prebator } from './combat';
import { Tattrib, Tstatus, g } from './wiz';
import { pause2, printchr, printnum, printstr, random } from './wiz2';


/** HEAL. Both sides mend a little, and whoever can shake off being asleep, afraid or held does. */
async function heal(): Promise<void> {
  let mvuplive: number = 0;
  let t1: number = 0;
  let t2: number = 0;

  /** TRYHEAL. One chance in so many of coming round, capped at half however good it looks. */
  function tryheal(healchan: number): void {
    let chance: number = healchan;

    if (chance > 50) {
      chance = 50;
    }

    if ((random() % 100) <= chance) {
      battlerc[t2].a.temp04[t1].status = Tstatus.ok;
    }
  }

  /**
   * HEALENMY. The dead are squeezed out of each group, which is why a group's living are always at
   * the front of it, and the emptied groups are then sorted to the back. When nothing is left in
   * any of them the fight is over.
   */
  function healenmy(): void {
    for (t2 = 1; t2 <= 4; t2++) {
      if (battlerc[t2].a.alivecnt > 0) {
        t1 = 0;
        mvuplive = 0;

        while (mvuplive < battlerc[t2].a.alivecnt) {
          copytemp04(battlerc[t2].a.temp04[t1], battlerc[t2].a.temp04[mvuplive]);
          mvuplive = mvuplive + 1;

          if (battlerc[t2].a.temp04[t1].status < Tstatus.dead) {
            switch (battlerc[t2].a.temp04[t1].status) {
              case Tstatus.afraid:
                tryheal(10 * battlerc[t2].b.hitPoints.diceCount);
                break;

              case Tstatus.asleep:
                tryheal(20 * battlerc[t2].b.hitPoints.diceCount);
                break;

              case Tstatus.plyze:
                tryheal(7 * battlerc[t2].b.hitPoints.diceCount);
                break;

              default:
                break;
            }

            battlerc[t2].a.temp04[t1].hpleft =
              battlerc[t2].a.temp04[t1].hpleft + battlerc[t2].b.healingPerTurn;
            t1 = t1 + 1;
          }
        }

        battlerc[t2].a.alivecnt = t1;
      }
    }

    for (t1 = 1; t1 <= 3; t1++) {
      for (t2 = t1 + 1; t2 <= 4; t2++) {
        if ((battlerc[t1].a.alivecnt === 0) && (battlerc[t2].a.alivecnt > 0)) {
          const enemyrc: ITenemy2 = battlerc[t1];

          battlerc[t1] = battlerc[t2];
          battlerc[t2] = enemyrc;
        }
      }
    }

    t2 = 0;

    for (t1 = 1; t1 <= 4; t1++) {
      if (battlerc[t1].a.alivecnt > 0) {
        t2 = t1;
      }
    }

    cvar.donefigh = (t2 === 0);
  }

  /** HEALPRTY. Poison and regeneration, one round in four, and the fight's hit points written back. */
  async function healprty(): Promise<void> {
    t2 = 0;

    for (t1 = 0; t1 <= (g.partycnt - 1); t1++) {
      if (battlerc[0].a.temp04[t1].status < Tstatus.dead) {
        if ((random() % 4) === 2) {
          battlerc[0].a.temp04[t1].hpleft = battlerc[0].a.temp04[t1].hpleft
              + g.charactr[t1].healingPerTurn
              - g.charactr[t1].lostLocation[0];
        }

        if (battlerc[0].a.temp04[t1].hpleft > g.charactr[t1].maximumHitPoints) {
          battlerc[0].a.temp04[t1].hpleft = g.charactr[t1].maximumHitPoints;
        }

        if (battlerc[0].a.temp04[t1].hpleft <= 0) {
          battlerc[0].a.temp04[t1].status = Tstatus.dead;
          battlerc[0].a.temp04[t1].hpleft = 0;
          rt().display.mvcursor(1, 12);
          printstr(g.charactr[t1].name);
          printstr(' JUST DIED!');
          await pause2();
          rt().display.hires.clrrect(1, 12, 38, 1);
        }

        switch (battlerc[0].a.temp04[t1].status) {
          case Tstatus.asleep:
            tryheal(10 * g.charactr[t1].level);
            break;

          case Tstatus.afraid:
            tryheal(5 * g.charactr[t1].level);
            break;

          default:
            break;
        }
      }
    }

    for (t1 = 0; t1 <= (g.partycnt - 1); t1++) {
      g.charactr[t1].hitPoints = battlerc[0].a.temp04[t1].hpleft;
      g.charactr[t1].status = battlerc[0].a.temp04[t1].status;
    }
  }

  /** HEALHEAR. A round nearer being able to speak again, for anyone a silence was cast on. */
  function healhear(): void {
    /**
     * DECINAUD. The loop counts the group's living but the subscript is ALIVECNT rather than X, so
     * what it really does is count one slot down by however many of them there are - the slot past
     * the living, which nothing else uses. Kept as it is, and it is the only place in the game that
     * counts INAUDCNT down, so nothing silenced in a fight ever gets its voice back: HEALENMY copies
     * the count along with the rest of the record when it closes the group's ranks up.
     */
    function decinaud(groupi: number, alivecnt: number): void {
      for (let x: number = 0; x <= (alivecnt - 1); x++) {
        if (battlerc[groupi].a.temp04[alivecnt].inaudcnt > 0) {
          battlerc[groupi].a.temp04[alivecnt].inaudcnt =
            battlerc[groupi].a.temp04[alivecnt].inaudcnt - 1;
        }
      }
    }

    // Group four is not among them, which is the original's own omission.
    decinaud(0, g.partycnt);
    decinaud(1, battlerc[1].a.alivecnt);
    decinaud(2, battlerc[2].a.alivecnt);
    decinaud(3, battlerc[3].a.alivecnt);
  }

  healenmy();
  await healprty();
  healhear();
}


/** DSPENEMY. The four group lines down the right of the screen, and what the party are up against. */
function dspenemy(): void {
  g.enstreng = 0;

  for (let enmygri: number = 1; enmygri <= 4; enmygri++) {
    rt().display.hires.clrrect(13, enmygri, 26, 1);

    if (battlerc[enmygri].a.alivecnt > 0) {
      let enmygrok: number = 0;

      for (let enmyind: number = 0; enmyind <= (battlerc[enmygri].a.alivecnt - 1); enmyind++) {
        if (battlerc[enmygri].a.temp04[enmyind].status === Tstatus.ok) {
          enmygrok = enmygrok + 1;
        }
      }

      g.enstreng = g.enstreng + (enmygrok * battlerc[enmygri].b.hitPoints.diceCount);
      rt().display.mvcursor(13, enmygri);
      printnum(enmygri, 1);
      printstr(') ');
      printnum(battlerc[enmygri].a.alivecnt, 1);
      printstr(' ');

      if (battlerc[enmygri].a.identifi) {
        if (battlerc[enmygri].a.alivecnt > 1) {
          printstr(battlerc[enmygri].b.plural);
        } else {
          printstr(battlerc[enmygri].b.name);
        }
      } else if (battlerc[enmygri].a.alivecnt > 1) {
        printstr(battlerc[enmygri].b.unidentifiedPlural);
      } else {
        printstr(battlerc[enmygri].b.unidentifiedName);
      }

      printstr(' (');
      printnum(enmygrok, 1);
      printchr(')');
    }
  }
}


/**
 * DSPPARTY. The party list along the bottom, which is also where the party get sorted: back into
 * the order they went in in, and then with the dead and the dying pushed to the end so the ones
 * still standing are the ones the monsters reach.
 */
function dspparty(): void {
  let tempxyz: number = 0;
  let partyi: number = 0;
  let statusok: boolean = false;

  function prstatus(): void {
    statusok = statusok || (g.charactr[partyi].status < Tstatus.dead);

    if (g.charactr[partyi].status === Tstatus.ok) {
      if (g.charactr[partyi].lostLocation[0] > 0) {
        printstr('POISON');
      } else {
        printnum(g.charactr[partyi].maximumHitPoints, 4);
      }
    } else {
      printstr(g.scntoc.statusNames[g.charactr[partyi].status]);
    }
  }

  /** SWAP2CHR. Two of the party change places, with everything that is being kept about them. */
  function swap2chr(x: number, y: number): void {
    const tempchar: ICharacter = g.charactr[x];

    g.charactr[x] = g.charactr[y];
    g.charactr[y] = tempchar;

    g.llbase04 = g.chardisk[x];
    g.chardisk[x] = g.chardisk[y];
    g.chardisk[y] = g.llbase04;

    const tempx: boolean = drained[x];

    drained[x] = drained[y];
    drained[y] = tempx;

    // Slot six of the party's TEMP04 is nobody, so the original borrows it as the spare.
    copytemp04(battlerc[0].a.temp04[6], battlerc[0].a.temp04[x]);
    copytemp04(battlerc[0].a.temp04[x], battlerc[0].a.temp04[y]);
    copytemp04(battlerc[0].a.temp04[y], battlerc[0].a.temp04[6]);
  }

  for (partyi = 0; partyi <= (g.partycnt - 2); partyi++) {
    for (tempxyz = partyi + 1; tempxyz <= (g.partycnt - 1); tempxyz++) {
      if (prebator[partyi] === g.chardisk[tempxyz]) {
        swap2chr(partyi, tempxyz);
      }
    }
  }

  for (partyi = 0; partyi <= (g.partycnt - 2); partyi++) {
    for (tempxyz = partyi + 1; tempxyz <= (g.partycnt - 1); tempxyz++) {
      if (g.charactr[partyi].status > g.charactr[tempxyz].status) {
        swap2chr(partyi, tempxyz);
      }
    }
  }

  g.base12 = 0;
  battlerc[0].a.alivecnt = 0;

  for (partyi = 0; partyi <= (g.partycnt - 1); partyi++) {
    if (g.charactr[partyi].status === Tstatus.ok) {
      g.base12 = g.base12 + g.charactr[partyi].level;
    }

    if (g.charactr[partyi].status < Tstatus.dead) {
      battlerc[0].a.alivecnt = battlerc[0].a.alivecnt + 1;
    }
  }

  rt().display.hires.clrrect(1, 17, 38, 6);
  statusok = false;

  for (partyi = 0; partyi <= (g.partycnt - 1); partyi++) {
    // Working out what they are up against is how they recognise it: the cleverest and the most
    // pious are the likeliest, and it is one group at random that they place rather than this one.
    if ((random() % 99) < (g.charactr[partyi].attributes[Tattrib.iq]
                           + g.charactr[partyi].attributes[Tattrib.piety]
                           + g.charactr[partyi].level)) {
      battlerc[(random() % 4) + 1].a.identifi = true;
    }

    rt().display.mvcursor(1, 17 + partyi);
    printnum(partyi + 1, 1);
    printstr(' ');
    printstr(g.charactr[partyi].name);
    rt().display.mvcursor(19, 17 + partyi);
    printstr(g.scntoc.alignmentNames[g.charactr[partyi].alignment].substring(0, 1));
    printchr('-');
    printstr(g.scntoc.classNames[g.charactr[partyi].characterClass].substring(0, 3));
    g.llbase04 = g.charactr[partyi].armourClass
        - g.acmod2
        - battlerc[0].a.temp04[partyi].armorcl;

    if (g.llbase04 >= 0) {
      printnum(g.llbase04, 3);
    } else if (g.llbase04 > -10) {
      printstr(' -');
      printnum(Math.abs(g.llbase04), 1);
    } else {
      printstr(' LO');
    }

    printnum(g.charactr[partyi].hitPoints, 5);
    tempxyz = g.charactr[partyi].healingPerTurn - g.charactr[partyi].lostLocation[0];

    if (tempxyz === 0) {
      printchr(' ');
    } else if (tempxyz < 0) {
      printchr('-');
    } else {
      printchr('+');
    }

    prstatus();
  }

  if (!statusok) {
    exit('COMBAT');
  }
}


/** SEGMENT PROCEDURE CUTIL. One round's worth of bookkeeping and orders, up to the blows. */
export async function cutil(): Promise<void> {
  await withExit('CUTIL', async (): Promise<void> => {
    await heal();
    dspparty();
    dspenemy();

    if (cvar.donefigh) {
      exit('CUTIL');
    }

    await enattack();
    await caction();
    cvar.surprise = 0;
  });
}
