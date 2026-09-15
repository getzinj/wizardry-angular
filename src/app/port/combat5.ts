// Wiz1B.DSK/COMBAT5.TEXT.txt - SWINGASW, which is everything that is not a spell: claws, swords,
// breath, a call for help, a monster losing its nerve, and a priest dispelling the undead. Then
// MELEE, which plays the round out in ten passes, and last the COMBAT segment's own body, which is
// where the original puts it too.

import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { rt } from '../runtime/runtime';
import type { IHitPointRoll, IMonster } from '../data/layout/wiz-types';
import { castaspe } from './combat4';
import { cutil } from './combat3';
import type { ITemp04 } from './combat';
import { battlerc, cinit, cvar, drained } from './combat';
import { Tclass, Tstatus, Xgoto, g } from './wiz';
import { chr, pause1, printnum, printstr, random, write } from './wiz2';


/**
 * SEGMENT PROCEDURE SWINGASW. One blow, from whoever is acting, at whoever they settled on.
 *
 * MELEE's four variables come in as parameters: they are the attacker's group and place in it, who
 * they are aiming at, and what they are doing. Neither this nor CASTASPE changes any of them.
 */
async function swingasw(attackty: number,
                        batg: number,
                        bati: number,
                        victim: number): Promise<void> {
  function armattk(): void {
    switch (random() % 5) {
      case 0: printstr('SWINGS'); break;
      case 1: printstr('THRUSTS'); break;
      case 2: printstr('STABS'); break;
      case 3: printstr('SLASHES'); break;
      case 4: printstr('CHOPS'); break;
      default: break;
    }
  }

  function prname(groupi: number, charx: number): void {
    if (groupi === 0) {
      printstr(g.charactr[charx].name);
    } else if (battlerc[groupi].a.identifi) {
      printstr(battlerc[groupi].b.name);
    } else {
      printstr(battlerc[groupi].b.unidentifiedName);
    }

    printstr(' ');
  }

  /** UNAFFECT. Damage, as CASTASPE's own does it; this copy is also what breath goes through. */
  async function unaffect(groupi: number, chari: number, hitdam: number): Promise<void> {
    await withExit('UNAFFECT', async (): Promise<void> => {
      let damage: number = hitdam;

      rt().display.hires.clrrect(1, 12, 38, 3);

      if (battlerc[groupi].a.temp04[chari].status >= Tstatus.dead) {
        exit('UNAFFECT');
      }

      rt().display.mvcursor(1, 12);
      prname(groupi, chari);

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

        const one: ITemp04 = battlerc[groupi].a.temp04[chari];

        one.hpleft = one.hpleft - damage;

        if (one.hpleft <= 0) {
          one.hpleft = 0;
          one.status = Tstatus.dead;
          rt().display.mvcursor(1, 14);
          prname(groupi, chari);
          printstr('IS SLAIN!');
        }
      }

      await pause1();
    });
  }

  /** CALCHP. A hit-point roll, which is where both hit points and damage come from. */
  function calchp(ahprec: IHitPointRoll): number {
    const roll: IHitPointRoll = { ...ahprec };
    let hitpts: number = 0;

    while (roll.diceCount > 0) {
      hitpts = hitpts + (random() % roll.diceSides) + 1;
      roll.diceCount = roll.diceCount - 1;
    }

    return hitpts + roll.bonus;
  }

  /**
   * DOBREATH. Half of what the monster has left, at everyone, with a saving throw and whatever the
   * party are wearing against that kind of breath each halving it again.
   */
  async function dobreath(): Promise<void> {
    printstr('BREATHES!');

    for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
      if (battlerc[0].a.temp04[charx].status < Tstatus.dead) {
        rt().display.hires.clrrect(1, 12, 38, 3);
        rt().display.mvcursor(1, 12);

        let hitdam: number = Math.trunc(battlerc[batg].a.temp04[bati].hpleft / 2);

        if ((random() % 20) >= g.charactr[charx].skills[3]) {
          hitdam = Math.trunc((hitdam + 1) / 2);
        }

        // A row of WEPVSTY3 is seven bits in a word and the breath type is the subscript, so a
        // scenario with a breath type past the seventh read the word's unused bits, which are clear.
        const resists: readonly number[] = g.charactr[charx].bonusVersusType3[1];
        const breathe: number = battlerc[batg].b.breathes;

        if ((breathe < resists.length) && (resists[breathe] !== 0)) {
          hitdam = Math.trunc((hitdam + 1) / 2);
        }

        await unaffect(0, charx, hitdam);
      }
    }
  }

  async function dofight(): Promise<void> {
    /** DAM2ME. A monster's turn at one of the party. */
    async function dam2me(): Promise<void> {
      await withExit('DAM2ME', async (): Promise<void> => {
        let myvictim: number = 0;

        /** CASEDAMG. What else a hit does, beyond the damage: poison, paralysis, stone, a level. */
        async function casedamg(): Promise<void> {
          /** DRAINLEV. A level off the victim, and the hit points that went with it. */
          async function drainlev(): Promise<void> {
            await withExit('DRAINLEV', async (): Promise<void> => {
              if (g.charactr[myvictim].bonusVersusType3[1][4] !== 0) {
                exit('DRAINLEV');
              }

              g.charactr[myvictim].level =
                g.charactr[myvictim].level - battlerc[batg].b.levelDrain;
              rt().display.mvcursor(1, 14);
              rt().display.hires.clrrect(1, 14, 38, 1);
              printnum(battlerc[batg].b.levelDrain, 2);

              if (battlerc[batg].b.levelDrain === 1) {
                printstr(' LEVEL');
              } else {
                printstr(' LEVELS');
              }

              printstr(' ARE DRAINED!');

              if (g.charactr[myvictim].level < 1) {
                g.charactr[myvictim].level = 0;
                battlerc[0].a.temp04[myvictim].hpleft = 0;
                battlerc[0].a.temp04[myvictim].status = Tstatus.lost;
              } else {
                g.charactr[myvictim].maximumHitPoints =
                  Math.trunc(g.charactr[myvictim].maximumHitPoints
                             / g.charactr[myvictim].maximumLevel)
                  * g.charactr[myvictim].level;
                g.charactr[myvictim].maximumLevel = g.charactr[myvictim].level;

                if (g.charactr[myvictim].hitPoints > g.charactr[myvictim].maximumHitPoints) {
                  g.charactr[myvictim].hitPoints = g.charactr[myvictim].maximumHitPoints;
                }

                drained[myvictim] = true;
              }

              await pause1();
            });
          }

          /**
           * RESULT. The luck that gets them out of it, then what it leaves them as. The fourth kind
           * is a critical hit, which also has to get past the monster's own level.
           */
          async function result(attk0123: number,
                                stonflag: number,
                                poisston: number,
                                damstr: string): Promise<void> {
            await withExit('RESULT', async (): Promise<void> => {
              if ((random() % 20) > g.charactr[myvictim].skills[stonflag]) {
                exit('RESULT');
              }

              if (attk0123 === 3) {
                let chancbad: number = battlerc[batg].b.hitPoints.diceCount * 2;

                if (chancbad > 50) {
                  chancbad = 50;
                }

                if ((random() % 100) > chancbad) {
                  exit('RESULT');
                }
              }

              if (poisston > 0) {
                if (g.charactr[myvictim].bonusVersusType3[1][poisston] !== 0) {
                  exit('RESULT');
                }
              }

              if (g.charactr[myvictim].status >= Tstatus.dead) {
                exit('RESULT');
              }

              rt().display.hires.clrrect(1, 14, 38, 1);
              rt().display.mvcursor(1, 14);
              prname(0, myvictim);
              printstr('IS ');
              printstr(damstr);

              switch (attk0123) {
                case 0:
                  if (battlerc[0].a.temp04[myvictim].status < Tstatus.stoned) {
                    battlerc[0].a.temp04[myvictim].status = Tstatus.stoned;
                  }
                  break;

                case 1:
                  g.charactr[myvictim].lostLocation[0] = 1;
                  break;

                case 2:
                  if (battlerc[0].a.temp04[myvictim].status < Tstatus.plyze) {
                    battlerc[0].a.temp04[myvictim].status = Tstatus.plyze;
                  }
                  break;

                case 3:
                  battlerc[0].a.temp04[myvictim].status = Tstatus.dead;
                  battlerc[0].a.temp04[myvictim].hpleft = 0;
                  break;

                default:
                  break;
              }

              await pause1();
            });
          }

          const what: IMonster = battlerc[batg].b;

          if (what.properties[1] !== 0) {
            await result(1, 0, 3, 'POISONED');
          }

          if (what.properties[2] !== 0) {
            await result(2, 0, 0, 'PARALYZED');
          }

          if (what.properties[0] !== 0) {
            await result(0, 1, 5, 'STONED');
          }

          if (what.levelDrain > 0) {
            await drainlev();
          }

          if (what.properties[3] !== 0) {
            await result(3, 0, 0, 'CRITICALLY HIT');
          }
        }

        /** ATTKSTRG. What the attack is called, which depends on what the monster is. */
        function attkstrg(): void {
          function ripbitcl(): void {
            switch (random() % 5) {
              case 0: printstr('TEARS'); break;
              case 1: printstr('RIPS'); break;
              case 2: printstr('GNAWS'); break;
              case 3: printstr('BITES'); break;
              case 4: printstr('CLAWS'); break;
              default: break;
            }
          }

          function armrip(): void {
            if ((random() % 2) === 1) {
              ripbitcl();
            } else {
              armattk();
            }
          }

          switch (battlerc[batg].b.monsterClass) {
            case 0: case 1: case 2: case 3: case 4: case 5: case 10: case 11:
              armattk();
              break;

            case 6: case 8: case 12: case 13:
              ripbitcl();
              break;

            case 7: case 9:
              armrip();
              break;

            default:
              break;
          }
        }

        if (battlerc[0].a.temp04[victim].status >= Tstatus.dead) {
          exit('DAM2ME');
        }

        prname(batg, bati);
        attkstrg();
        printstr(' AT');
        rt().display.mvcursor(1, 12);
        printstr(g.charactr[victim].name);
        myvictim = victim;

        if (battlerc[0].a.temp04[myvictim].status < Tstatus.dead) {
          // The last term is the monster at the victim's own place in the attacker's group, which
          // is not the attacker: a party of six and a group of nine make it a real reading either
          // way, and it is what the original does.
          let hpcalcpc: number = 20
              - g.charactr[myvictim].armourClass
              - battlerc[batg].b.hitPoints.diceCount
              + g.acmod2
              + battlerc[0].a.temp04[myvictim].armorcl
              + (2 * ((battlerc[batg].a.temp04[myvictim].spellhsh === 0) ? 1 : 0));

          if (hpcalcpc < 1) {
            hpcalcpc = 1;
          } else if (hpcalcpc > 19) {
            hpcalcpc = 19;
          }

          let hpdamage: number = 0;
          let hitscnt: number = 0;

          rt().display.mvcursor(1, 13);

          for (let recsi: number = 1; recsi <= battlerc[batg].b.attackCount; recsi++) {
            if ((random() % 20) >= hpcalcpc) {
              hpdamage = hpdamage + calchp(battlerc[batg].b.attacks[recsi - 1]);
              hitscnt = hitscnt + 1;
            }
          }

          if (battlerc[0].a.temp04[myvictim].status === Tstatus.asleep) {
            hpdamage = hpdamage * 2;
          }

          if (hpdamage === 0) {
            printstr('AND MISSES!');
          } else {
            printstr('AND HITS ');
            printnum(hitscnt, 3);
            printstr(' TIMES FOR ');
            printnum(hpdamage, 3);
            printstr(' DAMAGE');
            await casedamg();
          }

          battlerc[0].a.temp04[myvictim].hpleft =
            battlerc[0].a.temp04[myvictim].hpleft - hpdamage;

          if (battlerc[0].a.temp04[myvictim].hpleft <= 0) {
            rt().display.hires.clrrect(1, 14, 38, 1);
            rt().display.mvcursor(1, 14);
            printstr(g.charactr[myvictim].name);
            printstr(' IS SLAIN!');
            battlerc[0].a.temp04[myvictim].hpleft = 0;

            if (battlerc[0].a.temp04[myvictim].status < Tstatus.dead) {
              battlerc[0].a.temp04[myvictim].status = Tstatus.dead;
            }
          }
        }
      });
    }

    /** DAM2ENMY. One of the party having a swing, at one monster of the group they chose. */
    async function dam2enmy(): Promise<void> {
      // An emptied group would make this a division by zero, which the original trapped on and
      // stopped the program for. Only MAHAMAN destroying every monster mid-round can do it.
      const singlex: number = bati % battlerc[victim].a.alivecnt;

      if (battlerc[victim].a.temp04[singlex].status < Tstatus.dead) {
        prname(batg, bati);
        armattk();
        printstr(' AT A');
        rt().display.mvcursor(1, 12);
        prname(victim, bati);

        let hpcalcpc: number = 21
            - battlerc[victim].b.armourClass
            - g.charactr[bati].hitPointsMethod
            + battlerc[victim].a.temp04[singlex].armorcl
            - (3 * victim);

        if (hpcalcpc < 1) {
          hpcalcpc = 1;
        } else if (hpcalcpc > 19) {
          hpcalcpc = 19;
        }

        let hpdamage: number = 0;

        rt().display.mvcursor(1, 13);

        let hitscnt: number = 0;

        for (let tempx: number = 1; tempx <= g.charactr[bati].swings; tempx++) {
          if ((random() % 20) >= hpcalcpc) {
            hpdamage = hpdamage + calchp(g.charactr[bati].damage);
            hitscnt = hitscnt + 1;
          }
        }

        if (battlerc[victim].a.temp04[singlex].status === Tstatus.asleep) {
          hpdamage = 2 * hpdamage;
        }

        if (g.charactr[bati].bonusVersusType[battlerc[victim].b.monsterClass] !== 0) {
          hpdamage = 2 * hpdamage;
        }

        if (hpdamage === 0) {
          printstr('AND MISSES');
        } else {
          printstr('AND HITS ');
          printnum(hitscnt, 3);
          printstr(' TIMES FOR ');
          printnum(hpdamage, 3);
          printstr(' DAMAGE!');
        }

        battlerc[victim].a.temp04[singlex].hpleft =
          battlerc[victim].a.temp04[singlex].hpleft - hpdamage;

        if (g.charactr[bati].criticalHits && (hpdamage > 0)) {
          let tempx: number = g.charactr[bati].level * 2;

          if (tempx > 50) {
            tempx = 50;
          }

          if ((random() % 100) < tempx) {
            if ((random() % 35) > (battlerc[victim].b.hitPoints.diceCount + 10)) {
              rt().display.mvcursor(1, 14);
              printstr('A CRITICAL HIT!');

              // The source line is WRITE of a string holding three bell characters themselves,
              // which anything that swallows control bytes shows as an empty string.
              write(chr(7), chr(7), chr(7));
              battlerc[victim].a.temp04[singlex].hpleft = 0;
              await pause1();
              rt().display.hires.clrrect(1, 14, 38, 1);
            }
          }
        }

        if (battlerc[victim].a.temp04[singlex].hpleft <= 0) {
          rt().display.mvcursor(1, 14);
          prname(0, bati);
          printstr('KILLS ONE!');
          battlerc[victim].a.temp04[singlex].hpleft = 0;
          battlerc[victim].a.temp04[singlex].status = Tstatus.dead;
        }
      }
    }

    if (batg === 0) {
      await dam2enmy();
    } else {
      await dam2me();
    }
  }

  /** YELLHELP. Another of its kind arrives, unless there are nine of them already. */
  function yellhelp(): void {
    withExitSync('YELLHELP', (): void => {
      function nonecome(): void {
        printstr('BUT NONE COMES!');
        exit('YELLHELP');
      }

      printstr('CALLS FOR HELP!');
      rt().display.mvcursor(1, 12);

      if (battlerc[batg].a.alivecnt === 9) {
        nonecome();
      }

      if ((random() % 200) > (10 * battlerc[batg].b.hitPoints.diceCount)) {
        nonecome();
      }

      printstr('AND IS HEARD!');

      const yhtemp2: number = battlerc[batg].a.alivecnt;

      battlerc[batg].a.alivecnt = yhtemp2 + 1;
      battlerc[batg].a.enmycnt = battlerc[batg].a.enmycnt + 1;

      const one: ITemp04 = battlerc[batg].a.temp04[yhtemp2];

      one.agility = -1;
      one.spellhsh = 0;
      one.inaudcnt = battlerc[batg].a.temp04[bati].inaudcnt;
      one.armorcl = 0;
      one.hpleft = calchp(battlerc[batg].b.hitPoints);
      one.status = Tstatus.ok;
    });
  }

  /** DORUN. It leaves, which counts as dead for everything except the experience it is worth. */
  function dorun(): void {
    printstr('FLEES!');
    battlerc[batg].a.enmycnt = battlerc[batg].a.enmycnt - 1;
    battlerc[batg].a.temp04[bati].status = Tstatus.dead;
    battlerc[batg].a.temp04[bati].hpleft = 0;
  }

  /** DODISPEL. A priest turning the undead, which kills outright whatever it works on. */
  function dodispel(): void {
    printstr('DISPELLS!');

    let dispcalc: number = 50
        + (5 * g.charactr[bati].level)
        - (10 * battlerc[victim].b.hitPoints.diceCount);

    switch (g.charactr[bati].characterClass) {
      case Tclass.lord: dispcalc = dispcalc - 40; break;
      case Tclass.bishop: dispcalc = dispcalc - 20; break;
      default: break;
    }

    let displcnt: number = 0;

    for (let charx: number = 0; charx <= (battlerc[victim].a.alivecnt - 1); charx++) {
      if (battlerc[victim].a.temp04[charx].status === Tstatus.ok) {
        if ((random() % 100) < dispcalc) {
          if (battlerc[victim].b.monsterClass === 10) {
            displcnt = displcnt + 1;
            battlerc[victim].a.enmycnt = battlerc[victim].a.enmycnt - 1;
            battlerc[victim].a.temp04[charx].status = Tstatus.dead;
            battlerc[victim].a.temp04[charx].hpleft = 0;
          }
        }
      }
    }

    rt().display.mvcursor(1, 12);

    if (displcnt === 0) {
      printstr('TO NO AVAIL!');
    } else if (displcnt === 1) {
      printstr('1 DISSOLVES!');
    } else {
      printnum(displcnt, 1);
      printstr(' DISSOLVE!');
    }
  }

  if (attackty < -1) {
    prname(batg, bati);
  }

  switch (attackty) {
    case -5: dodispel(); break;
    case -4: yellhelp(); break;
    case -3: await dobreath(); break;
    case -2: dorun(); break;
    case -1: await dofight(); break;
    default: break;
  }
}


/**
 * SEGMENT PROCEDURE MELEE. The round happens here, in ten passes over everybody: the quickest act
 * on the first pass and the slowest on the tenth, and anyone whose agility came out as -1 - asleep,
 * parrying, or beaten to it - never acts at all.
 */
async function melee(): Promise<void> {
  let victim: number = 0;
  let attackty: number = 0;
  let bati: number = 0;
  let batg: number = 0;
  let agilelev: number = 0;

  for (agilelev = 1; agilelev <= 10; agilelev++) {
    for (batg = 0; batg <= 4; batg++) {
      // Pascal works out a FOR loop's bound once, so one that arrives part way through the pass -
      // YELLHELP brings another of its kind in - is not in this one. It could not act in any case,
      // since it arrives with an agility of -1.
      const alivecnt: number = battlerc[batg].a.alivecnt;

      for (bati = 0; bati <= (alivecnt - 1); bati++) {
        if (battlerc[batg].a.temp04[bati].status === Tstatus.ok) {
          if (battlerc[batg].a.temp04[bati].agility === agilelev) {
            victim = battlerc[batg].a.temp04[bati].victim;
            attackty = battlerc[batg].a.temp04[bati].spellhsh;
            rt().display.mvcursor(1, 11);

            if ((attackty >= -5) && (attackty < 0)) {
              await swingasw(attackty, batg, bati, victim);
            } else if (attackty > 0) {
              await castaspe(batg, bati);
            }

            if (attackty !== 0) {
              await pause1();
              rt().display.hires.clrrect(1, 11, 38, 4);
            }
          }
        }
      }
    }
  }
}


/**
 * SEGMENT PROCEDURE COMBAT. Rounds until one side is done with, then the result written down.
 *
 * XGOTO is set to XREWARD before the first round, so any way out of here other than running away,
 * walking away from a friendly group, or a spell that moves the party goes on to REWARDS.
 */
export async function combat(): Promise<void> {
  await withExit('COMBAT', async (): Promise<void> => {
    cvar.donefigh = false;
    cvar.cinitfl1 = 0;
    await cinit();
    g.xgoto = Xgoto.xreward;

    do {
      await cutil();

      if (!cvar.donefigh) {
        await melee();
      }
    } while (!cvar.donefigh);

    cvar.cinitfl1 = 2;
    await cinit();
  });
}
