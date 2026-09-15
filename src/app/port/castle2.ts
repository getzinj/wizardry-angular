// Wiz1C.DSK/CASTLE2.TEXT.txt - the rest of the castle segment: the Adventurer's Inn, and the
// market square that everything else hangs off.
//
// The inn is where levels are made. Resting costs gold and heals a point at a time; when the
// resting is over the character's experience is checked against the table on the disk and, if it
// is enough, they gain a level, roll new hit points, try to learn spells, and age - and the same
// roll that ages them can kill them outright.

import { Zone, experienceTable } from '../data/layout/wiz-types';
import type { ICharacter, IExperienceTable } from '../data/layout/wiz-types';
import type { IWizardryLong } from '../data/layout/ucsd-layout';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { disk } from '../runtime/runtime';
import { CRETURN, Tattrib, Tclass, Tstatus, Xgoto, g, setspelgrp, spelgrp } from './wiz';
import {
  addlongs, chr, copylong, getcharx, getkey, gotoxy, keyavail, newlong, ord, pause, prntlong,
  random, sublongs, testlong, textmode, unitclear, write, writeln
} from './wiz2';
import { charinfo, dspparty, dsptitle, gilgamsh, goboltac, gotemple } from './castle';

const STABLES: number = 65;
const COTS: number = 66;
const ECONOMY: number = 67;
const MERCHANT: number = 68;
const ROYAL: number = 69;

const SPELL_GROUPS: number = 7;

/** The empty loop between one hit point healing and the next, so the player can watch. */
const HEAL_PASSES: number = 500;


/** ADVNTINN. */
async function advntinn(): Promise<void> {
  await withExit('ADVNTINN', async (): Promise<void> => {
    let partyx: number = 0;

    async function getwho(): Promise<void> {
      dsptitle('INN');
      gotoxy(0, 13);
      write(chr(11));
      partyx = await getcharx(false, 'WHO WILL STAY');

      if (partyx < 0) {
        exit('ADVNTINN');
      }
    }

    function innmenu(): void {
      gotoxy(0, 13);
      write(chr(11), '   WELCOME ', g.charactr[partyx].name);
      writeln('. WE HAVE:');
      writeln();
      writeln('[A] THE STABLES (FREE!)');
      writeln('[B] COTS. 10 GP/WEEK.');
      writeln('[C] ECONOMY ROOMS. 50 GP/WEEK.');
      writeln('[D] MERCHANT SUITES. 200 GP/WEEK.');
      writeln('[E] ROYAL SUITES. 500 GP/WEEK.');
      write('    OR [RETURN] TO LEAVE');
    }

    /** SETSPELS. How many spells of each group the character may cast, from level and from books. */
    function setspels(): void {
      const who: ICharacter = g.charactr[partyx];

      function splperlv(spelgrps: number[], levelmod: number, levmod2: number): void {
        withExitSync('SPLPERLV', (): void => {
          let spellcnt: number = who.level - levelmod;

          if (spellcnt <= 0) {
            exit('SPLPERLV');
          }

          let spgrpi: number = 1;

          while ((spgrpi >= 1) && (spgrpi <= SPELL_GROUPS) && (spellcnt > 0)) {
            if (spellcnt > spelgrp(spelgrps, spgrpi)) {
              setspelgrp(spelgrps, spgrpi, spellcnt);
            }

            spgrpi = spgrpi + 1;
            spellcnt = spellcnt - levmod2;
          }

          for (spgrpi = 1; spgrpi <= SPELL_GROUPS; spgrpi++) {
            if (spelgrp(spelgrps, spgrpi) > 9) {
              setspelgrp(spelgrps, spgrpi, 9);
            }
          }
        });
      }

      function nwpriest(mod1: number, mod2: number): void {
        splperlv(who.priestSpellSlots, mod1, mod2);
      }

      function nwmage(mod1: number, mod2: number): void {
        splperlv(who.mageSpellSlots, mod1, mod2);
      }

      function minspcnt(splgrps: number[], groupi: number, lowindx: number, highindx: number): void {
        let spelknow: number = 0;

        for (let spelli: number = lowindx; spelli <= highindx; spelli++) {
          if (who.spellsKnown[spelli] !== 0) {
            spelknow = spelknow + 1;
          }
        }

        setspelgrp(splgrps, groupi, spelknow);
      }

      function minmag(): void {
        minspcnt(who.mageSpellSlots, 1, 1, 4);
        minspcnt(who.mageSpellSlots, 2, 5, 6);
        minspcnt(who.mageSpellSlots, 3, 7, 8);
        minspcnt(who.mageSpellSlots, 4, 9, 11);
        minspcnt(who.mageSpellSlots, 5, 12, 14);
        minspcnt(who.mageSpellSlots, 6, 15, 18);
        minspcnt(who.mageSpellSlots, 7, 19, 21);
      }

      function minpri(): void {
        minspcnt(who.priestSpellSlots, 1, 22, 26);
        minspcnt(who.priestSpellSlots, 2, 27, 30);
        minspcnt(who.priestSpellSlots, 3, 31, 34);
        minspcnt(who.priestSpellSlots, 4, 35, 38);
        minspcnt(who.priestSpellSlots, 5, 39, 44);
        minspcnt(who.priestSpellSlots, 6, 45, 48);

        // Spells 49 and 50, the second of which is one past the end of the array as declared.
        minspcnt(who.priestSpellSlots, 7, 49, 50);
      }

      minpri();
      minmag();

      switch (who.characterClass) {
        case Tclass.priest:  nwpriest(0, 2); break;
        case Tclass.mage:    nwmage(0, 2); break;
        case Tclass.bishop:
          nwpriest(3, 4);
          nwmage(0, 4);
          break;
        case Tclass.lord:    nwpriest(3, 2); break;
        case Tclass.samurai: nwmage(3, 3); break;
        default: break;
      }
    }

    /** CHNEWLEV. Has the character earned a level, and what happens to them if they have. */
    function chnewlev(): void {
      const who: ICharacter = g.charactr[partyx];
      const exp2next: IExperienceTable = disk().read(Zone.experience, 0, experienceTable);

      function madelev(): void {
        function morehp(): number {
          let hitpts: number = 0;

          switch (who.characterClass) {
            case Tclass.fighter:
            case Tclass.lord:     hitpts = random() % 10; break;
            case Tclass.priest:
            case Tclass.samurai:  hitpts = random() % 8; break;
            case Tclass.thief:
            case Tclass.bishop:
            case Tclass.ninja:    hitpts = random() % 6; break;
            case Tclass.mage:     hitpts = random() % 4; break;
            default: break;
          }

          hitpts = hitpts + 1;

          switch (who.attributes[Tattrib.vitality]) {
            case 3:  hitpts = hitpts - 2; break;
            case 4:
            case 5:  hitpts = hitpts - 1; break;
            case 16: hitpts = hitpts + 1; break;
            case 17: hitpts = hitpts + 2; break;
            case 18: hitpts = hitpts + 3; break;
            default: break;
          }

          if (hitpts < 1) {
            hitpts = 1;
          }

          return hitpts;
        }

        function trylearn(): void {
          let iqpiety: Tattrib = Tattrib.iq;
          let learned: boolean = false;

          function try2lrn(lowindx: number, highindx: number): void {
            let splknown: boolean = false;

            for (let spelli: number = lowindx; spelli <= highindx; spelli++) {
              splknown = splknown || (who.spellsKnown[spelli] !== 0);
            }

            for (let spelli: number = lowindx; spelli <= highindx; spelli++) {
              if (who.spellsKnown[spelli] === 0) {
                if (((random() % 30) < who.attributes[iqpiety]) || !splknown) {
                  learned = true;
                  splknown = true;
                  who.spellsKnown[spelli] = 1;
                }
              }
            }
          }

          function trymage(): void {
            iqpiety = Tattrib.iq;

            if (spelgrp(who.mageSpellSlots, 1) > 0) { try2lrn(1, 4); }
            if (spelgrp(who.mageSpellSlots, 2) > 0) { try2lrn(5, 6); }
            if (spelgrp(who.mageSpellSlots, 3) > 0) { try2lrn(7, 8); }
            if (spelgrp(who.mageSpellSlots, 4) > 0) { try2lrn(9, 11); }
            if (spelgrp(who.mageSpellSlots, 5) > 0) { try2lrn(12, 14); }
            if (spelgrp(who.mageSpellSlots, 6) > 0) { try2lrn(15, 18); }
            if (spelgrp(who.mageSpellSlots, 7) > 0) { try2lrn(19, 21); }
          }

          function trypri(): void {
            iqpiety = Tattrib.piety;

            if (spelgrp(who.priestSpellSlots, 1) > 0) { try2lrn(22, 26); }
            if (spelgrp(who.priestSpellSlots, 2) > 0) { try2lrn(27, 30); }
            if (spelgrp(who.priestSpellSlots, 3) > 0) { try2lrn(31, 34); }
            if (spelgrp(who.priestSpellSlots, 4) > 0) { try2lrn(35, 38); }
            if (spelgrp(who.priestSpellSlots, 5) > 0) { try2lrn(39, 44); }
            if (spelgrp(who.priestSpellSlots, 6) > 0) { try2lrn(45, 48); }
            if (spelgrp(who.priestSpellSlots, 7) > 0) { try2lrn(49, 50); }
          }

          learned = false;
          trymage();
          trypri();

          if (learned) {
            writeln('YOU LEARNED NEW SPELLS!!!!');
          }

          setspels();
        }

        /** GAINLOST. Every score is tested; age decides whether it is a gain or a loss. */
        function gainlost(): void {
          withExitSync('GAINLOST', (): void => {
            function prattrib(attribx: Tattrib): void {
              switch (attribx) {
                case Tattrib.strength: writeln('STRENGTH'); break;
                case Tattrib.iq:       writeln('I.Q.'); break;
                case Tattrib.piety:    writeln('PIETY'); break;
                case Tattrib.vitality: writeln('VITALITY'); break;
                case Tattrib.agility:  writeln('AGILITY'); break;
                case Tattrib.luck:     writeln('LUCK'); break;
                default: break;
              }
            }

            function oldage(): void {
              write('** YOU HAVE DIED OF OLD AGE **');
              writeln();
              who.status = Tstatus.lost;
              who.hitPoints = 0;
              exit('GAINLOST');
            }

            for (let attribx: Tattrib = Tattrib.strength; attribx <= Tattrib.luck; attribx++) {
              if ((random() % 4) !== 0) {
                let attrval: number = who.attributes[attribx];

                if ((random() % 130) < Math.trunc(who.age / 52)) {
                  // UCSD Pascal evaluates both operands of AND, so the second draw happens even
                  // for a score that is not already eighteen.
                  const maxed: boolean = attrval === 18;
                  const spared: boolean = (random() % 6) !== 4;

                  if (maxed && spared) {
                    // Nothing: a maxed score usually survives.
                  } else {
                    attrval = attrval - 1;
                    write('YOU LOST ');
                    prattrib(attribx);

                    if (attribx === Tattrib.vitality) {
                      if (attrval === 2) {
                        oldage();
                      }
                    }
                  }
                } else if (attrval !== 18) {
                  attrval = attrval + 1;
                  write('YOU GAINED ');
                  prattrib(attribx);
                }

                who.attributes[attribx] = attrval;
              }
            }
          });
        }

        write('YOU MADE A LEVEL!');
        writeln();
        who.level = who.level + 1;

        if (who.level > who.maximumLevel) {
          who.maximumLevel = who.level;
        }

        setspels();
        trylearn();
        gainlost();

        let newhpmax: number = 0;

        for (let charlev: number = 1; charlev <= who.level; charlev++) {
          newhpmax = newhpmax + morehp();
        }

        if (who.characterClass === Tclass.samurai) {
          newhpmax = newhpmax + morehp();
        }

        if (newhpmax <= who.maximumHitPoints) {
          newhpmax = who.maximumHitPoints + 1;
        }

        who.maximumHitPoints = newhpmax;
      }

      let expnxtlv: IWizardryLong;

      if (who.level <= 12) {
        expnxtlv = copylong(exp2next[who.characterClass][who.level]);
      } else {
        expnxtlv = copylong(exp2next[who.characterClass][12]);

        for (let biglev: number = 13; biglev <= who.level; biglev++) {
          addlongs(expnxtlv, exp2next[who.characterClass][0]);
        }
      }

      if (testlong(expnxtlv, who.experience) <= 0) {
        madelev();
      } else {
        write('YOU NEED ');
        sublongs(expnxtlv, who.experience);
        prntlong(expnxtlv);
        writeln(' MORE');
        writeln('EXPERIENCE POINTS TO MAKE LEVEL');
      }
    }

    /** TAKENAP. Heals a point at a time until the gold runs out, the hits fill up, or a key. */
    async function takenap(hpadd: number, goldamt: number): Promise<void> {
      const who: ICharacter = g.charactr[partyx];
      const gold4nap: IWizardryLong = newlong(goldamt, 0, 0);

      async function healhp(): Promise<void> {
        gotoxy(0, 13);
        who.hitPoints = who.hitPoints + hpadd;

        if (who.hitPoints > who.maximumHitPoints) {
          who.hitPoints = who.maximumHitPoints;
        }

        sublongs(who.gold, gold4nap);
        write(who.name);
        writeln(' IS HEALING UP');
        writeln();
        writeln();
        write('         HIT POINTS (', who.hitPoints, '/', who.maximumHitPoints, ')');
        writeln();
        writeln();
        write('               GOLD  ');
        prntlong(who.gold);
        gotoxy(41, 10);
        await pause(HEAL_PASSES);
      }

      gotoxy(0, 13);
      write(chr(11));

      if (goldamt > 0) {
        while ((testlong(who.gold, gold4nap) >= 0)
            && (who.hitPoints < who.maximumHitPoints) && !keyavail()) {
          await healhp();
        }
      } else {
        write(who.name);
        writeln(' IS NAPPING');
      }

      if (keyavail()) {
        gotoxy(41, 0);
        await getkey();
      }

      gotoxy(0, 13);
      write(chr(11));
      chnewlev();
      setspels();
      gotoxy(0, 23);
      write('PRESS [RETURN] TO LEAVE');
      gotoxy(41, 0);

      do {
        await getkey();
      } while (g.inchar !== chr(CRETURN));

      g.inchar = chr(0);
    }

    for (;;) {
      await getwho();

      if (g.charactr[partyx].status === Tstatus.ok) {
        do {
          unitclear();
          innmenu();
          gotoxy(41, 0);
          await getkey();

          switch (ord(g.inchar)) {
            case STABLES:  await takenap(0, 0); break;
            case COTS:     await takenap(1, 10); break;
            case ECONOMY:  await takenap(3, 50); break;
            case MERCHANT: await takenap(7, 200); break;
            case ROYAL:    await takenap(10, 500); break;
            default: break;
          }

          charinfo(partyx);
        } while (!((g.inchar === chr(CRETURN)) || (g.charactr[partyx].status !== Tstatus.ok)));
      }
    }
  });
}


function extcastl(): void {
  dsptitle('EXIT');
  g.xgoto = Xgoto.xedgtown;
  exit('CASTLE');
}


function p010a26(): void {
  gotoxy(0, 13);
  write(chr(11), [ ' ', 13 ]);
  writeln('YOU MAY GO TO:');
  writeln();
  writeln("THE A)DVENTURER'S INN, G)ILGAMESH'");
  writeln("TAVERN, B)OLTAC'S TRADING POST, THE");
  writeln('TEMPLE OF C)ANT, OR THE E)DGE OF TOWN.');
}


/** SEGMENT PROCEDURE CASTLE. */
export async function castle(): Promise<void> {
  await withExit('CASTLE', async (): Promise<void> => {
    g.acmod2 = 0;
    g.light = 0;
    g.chstalrm = 0;
    g.attk012 = 0;
    g.fizzles = 0;
    textmode();

    if (g.xgoto2 !== Xgoto.xboltac) {
      dspparty('');
    }

    g.xgoto2 = Xgoto.xgilgams;

    if (g.xgoto === Xgoto.xgilgams) {
      await gilgamsh();
    }

    for (;;) {
      dsptitle('MARKET');
      p010a26();

      do {
        do {
          gotoxy(41, 0);
          await getkey();
        } while (!((g.inchar === 'A') || (g.inchar === 'G') || (g.inchar === 'B')
                || (g.inchar === 'C') || (g.inchar === 'E')));
      } while (!((g.partycnt > 0) || (g.inchar === 'E') || (g.inchar === 'G')));

      switch (g.inchar) {
        case 'G': await gilgamsh(); break;
        case 'A': await advntinn(); break;
        case 'C': gotemple(); break;
        case 'B': goboltac(); break;
        case 'E': extcastl(); break;
        default: break;
      }
    }
  });
}
