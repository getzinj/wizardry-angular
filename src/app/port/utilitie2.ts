// Wiz1B.DSK/UTILITIE2.TEXT.txt - EQUIPCHR and the three ways in to it.
//
// EQUIPCHR is where a character's numbers come from. Nothing is stored: armour class, swings,
// to-hit, damage, thief skills and the bonuses against particular kinds of monster are all thrown
// away and worked out again from the class, the level, the race, the six scores and whatever is
// being carried. It runs on the way into the maze and after anything that could change any of
// that, which is why a character's sheet is always right and never has to be kept in step.
//
// EQUIPALL says which of the two jobs it is doing: TRUE re-computes from what is already equipped
// (the whole party, on the way into the maze), FALSE asks the player what to equip, one slot at a
// time, and lets cursed items refuse to come off.

import { Zone, object } from '../data/layout/wiz-types';
import type { ICharacter, IObject } from '../data/layout/wiz-types';
import { exit, withExit } from '../runtime/pascal-exit';
import { disk } from '../runtime/runtime';
import type { ITwizlong } from './wiz';
import { CRETURN, Talign, Tattrib, Tclass, Tobjtype, Trace, Tstatus, Xgoto, blankchar, g }
  from './wiz';
import { addlongs, chr, getkey, gotoxy, graphics, newlong, ord, random, write, writeln }
  from './wiz2';

const POSSESSION_SLOTS: number = 8;
const SKILL_COUNT: number = 5;
const WEAPON_TYPES: number = 14;
const WEAPON_CLASSES: number = 7;

/** EQUIPALL. Segment state in the original, because EQUIP6 and EQUIP1 set it and EQUIPCHR reads it. */
let equipall: boolean = false;


/** EQUIPCHR. */
export async function equipchr(chari: number): Promise<void> {
  const who: ICharacter = g.charactr[chari];

  let unarmed: boolean = false;
  let canuse: boolean[] = new Array<boolean>(7).fill(false);
  let tempx: number = 0;
  let possi: number = 0;
  let posscnt: number = 0;
  let obji: Tobjtype = Tobjtype.weapon;

  /** OBJLIST. Which possession slot each line of the menu below stands for, one-based both ends. */
  const objlist: number[] = new Array<number>(POSSESSION_SLOTS + 1).fill(0);
  // Declared but not read until something fills it, as the original's local TOBJREC is.
  let objectr!: IObject;

  function readobject(index: number): void {
    objectr = disk().read(Zone.object, index, object);
  }

  /**
   * NORMPOW. What everything carried gives whether or not it is equipped: which slots can be
   * filled at all, the best healing on offer, and the bonuses against monster kinds, which are
   * gathered together rather than taken from any one item.
   */
  function normpow(): void {
    canuse = new Array<boolean>(7).fill(false);

    for (let possx: number = 1; possx <= who.possessions.count; possx++) {
      readobject(who.possessions.items[possx - 1].objectIndex);

      if (objectr.usableByClass[who.characterClass] !== 0) {
        canuse[objectr.objectType] = true;
      }

      if (who.healingPerTurn < objectr.healingPerTurn) {
        who.healingPerTurn = objectr.healingPerTurn;
      }

      for (let index: number = 0; index <= (WEAPON_TYPES - 1); index++) {
        who.bonusVersusType2[0][index] = who.bonusVersusType2[0][index] | objectr.bonusVersusType2[index];
      }

      for (let index: number = 0; index <= (WEAPON_CLASSES - 1); index++) {
        who.bonusVersusType3[0][index] = who.bonusVersusType3[0][index] | objectr.bonusVersusType3[index];
      }
    }
  }

  /**
   * ARMORPOW. What one equipped item does. An item of the wrong alignment turns on its owner:
   * it makes them worse instead of better, and it will not come off again.
   */
  function armorpow(charx: number, possx: number, objid: number): void {
    const holder: ICharacter = g.charactr[charx];

    unarmed = false;
    readobject(objid);
    holder.possessions.items[possx - 1].cursed = objectr.cursed;

    if ((objectr.alignment === Talign.unalign) || (objectr.alignment === holder.alignment)) {
      if (objectr.extraSwings > holder.swings) {
        holder.swings = objectr.extraSwings;
      }

      holder.armourClass = holder.armourClass - objectr.armourModifier;
      holder.hitPointsMethod = holder.hitPointsMethod + objectr.hitModifier;

      if (objectr.objectType === Tobjtype.weapon) {
        g.llbase04 = holder.damage.bonus;
        holder.damage = { ...objectr.damage };
        holder.damage.bonus = holder.damage.bonus + g.llbase04;
        holder.criticalHits = holder.criticalHits || objectr.criticalHits;
        holder.bonusVersusType = [ ...objectr.bonusVersusType ];
      }
    } else {
      holder.hitPointsMethod = holder.hitPointsMethod - 1;
      holder.armourClass = holder.armourClass + 1;
      holder.criticalHits = false;
      holder.possessions.items[possx - 1].cursed = true;
    }
  }

  /** ARM4CHAR. Re-applies whatever is already equipped. */
  function arm4char(): void {
    for (let possx: number = 1; possx <= who.possessions.count; possx++) {
      if (who.possessions.items[possx - 1].equipped) {
        armorpow(chari, possx, who.possessions.items[possx - 1].objectIndex);
      }
    }
  }

  /** UPLCKSKL. Thief skills: a lower number is better, and this is the only thing that lowers one. */
  function uplckskl(lssub: number, lsmodamt: number): void {
    let amount: number = who.skills[lssub] - lsmodamt;

    if (amount < 1) {
      amount = 1;
    }

    who.skills[lssub] = amount;
  }

  /** INITSTUF. Forgets last time's bonuses, so they are gathered fresh rather than accumulated. */
  function initstuf(): void {
    for (let x: number = 0; x <= (WEAPON_TYPES - 1); x++) {
      who.bonusVersusType2[0][x] = 0;
      who.bonusVersusType2[1][x] = 0;
      who.bonusVersusType[x] = 0;
    }

    for (let y: number = 0; y <= (WEAPON_CLASSES - 1); y++) {
      who.bonusVersusType3[0][y] = 0;
      who.bonusVersusType3[1][y] = 0;
    }
  }

  tempx = (20 - Math.trunc(who.level / 5)) - Math.trunc(who.attributes[Tattrib.luck] / 6);

  if (tempx < 1) {
    tempx = 1;
  }

  for (let lucki: number = 0; lucki <= (SKILL_COUNT - 1); lucki++) {
    who.skills[lucki] = tempx;
  }

  switch (who.characterClass) {
    case Tclass.fighter: uplckskl(0, 3); break;
    case Tclass.mage:    uplckskl(4, 3); break;
    case Tclass.priest:  uplckskl(1, 3); break;
    case Tclass.thief:   uplckskl(3, 3); break;

    case Tclass.bishop:
      uplckskl(2, 2);
      uplckskl(4, 2);
      uplckskl(1, 2);
      break;

    case Tclass.samurai:
      uplckskl(0, 2);
      uplckskl(4, 2);
      break;

    case Tclass.lord:
      uplckskl(0, 2);
      uplckskl(1, 2);
      break;

    case Tclass.ninja:
      uplckskl(0, 3);
      uplckskl(1, 2);
      uplckskl(2, 4);
      uplckskl(3, 3);
      uplckskl(4, 2);
      break;

    default: break;
  }

  switch (who.race) {
    case Trace.human:  uplckskl(0, 1); break;
    case Trace.elf:    uplckskl(2, 2); break;
    case Trace.dwarf:  uplckskl(3, 4); break;
    case Trace.gnome:  uplckskl(1, 2); break;
    case Trace.hobbit: uplckskl(4, 3); break;
    default: break;
  }

  if (!equipall) {
    for (tempx = 1; tempx <= POSSESSION_SLOTS; tempx++) {
      who.possessions.items[tempx - 1].equipped = false;
    }
  }

  if ((who.characterClass === Tclass.priest) || (who.characterClass === Tclass.fighter)
      || (who.characterClass >= Tclass.samurai)) {
    who.hitPointsMethod = 2 + Math.trunc(who.level / 3);
  } else {
    who.hitPointsMethod = Math.trunc(who.level / 5);
  }

  who.damage = { diceCount: 2, diceSides: 2, bonus: 0 };

  if (who.attributes[Tattrib.strength] > 15) {
    who.hitPointsMethod = who.hitPointsMethod + who.attributes[Tattrib.strength] - 15;
    who.damage.bonus = who.attributes[Tattrib.strength] - 15;
  } else if (who.attributes[Tattrib.strength] < 6) {
    who.hitPointsMethod = who.hitPointsMethod + who.attributes[Tattrib.strength] - 6;
  }

  who.healingPerTurn = 0;
  who.criticalHits = who.characterClass === Tclass.ninja;
  who.swings = 1;

  if (who.characterClass === Tclass.ninja) {
    who.damage.diceSides = 4;
  }

  who.armourClass = 10;

  if ((who.characterClass === Tclass.fighter) || (who.characterClass >= Tclass.samurai)) {
    who.swings = who.swings + Math.trunc(who.level / 5) + ((who.characterClass === Tclass.ninja) ? 1 : 0);
  }

  if (who.swings > 10) {
    who.swings = 10;
  }


  /**
   * CHSPCPOW. Everything carried with a power of its own is offered, one after another - being
   * equipped has nothing to do with it, only having an object number at all. Saying
   * yes can raise or lower a score, change the character's class, age or unage them, hand them
   * fifty thousand in gold or in experience, kill them outright, heal the party, or destroy the
   * item and leave something else in its place.
   */
  async function chspcpow(): Promise<void> {

    /** SPCPOWER. */
    async function spcpower(): Promise<void> {
      let spctemp: number = 0;

      // FILLCHAR to zero and then MID := 5, which in a TWIZLONG's four-digit groups is fifty
      // thousand.
      const gold50k: ITwizlong = newlong(0, 5, 0);

      /**
       * SPC1TO12. Walks the attribute enumeration ATTR2MOD steps along from STRENGTH and moves
       * that score by MODAMT. The guard is on the NEW value, so what it stops is a score leaving
       * 3..18: eighteen cannot be raised and three cannot be lowered. It does not stop one coming
       * back the other way - ATTRIB holds 0..18, and a two raised by one becomes a three, which
       * the guard lets through.
       */
      function spc1to12(attr2mod_: number, modamt: number): void {
        let attr2mod: number = attr2mod_;
        let attrx: Tattrib = Tattrib.strength;

        while (attr2mod > 1) {
          attrx = attrx + 1;
          attr2mod = attr2mod - 1;
        }

        spctemp = who.attributes[attrx] + modamt;

        if ((spctemp > 2) && (spctemp < 19)) {
          who.attributes[attrx] = spctemp;
        }
      }

      write(chr(12));
      writeln('WILL YOU INVOKE THE SPECIAL POWER OF');
      write('YOUR ');

      if (who.possessions.items[possi - 1].identified) {
        write(objectr.name);
      } else {
        write(objectr.unidentifiedName);
      }

      write(' (Y/N) ? >');

      do {
        await getkey();
      } while ((g.inchar !== 'Y') && (g.inchar !== 'N'));

      if (g.inchar === 'N') {
        return;
      }

      // The item is replaced before the power is used, and by the object the item names rather
      // than by anything the power decides.
      if ((random() % 100) < objectr.changeChance) {
        who.possessions.items[possi - 1].objectIndex = objectr.changesTo;
      }

      if (objectr.special < 7) {
        spc1to12(objectr.special, 1);
      } else if (objectr.special < 13) {
        spc1to12(objectr.special - 6, -1);
      } else if (objectr.special === 13) {
        if (who.age > 1040) {
          who.age = who.age - 52;
        }
      } else if (objectr.special === 14) {
        who.age = who.age + 52;
      } else if (objectr.special === 15) {
        who.characterClass = Tclass.samurai;
      } else if (objectr.special === 16) {
        who.characterClass = Tclass.lord;
      } else if (objectr.special === 17) {
        who.characterClass = Tclass.ninja;
      } else if (objectr.special === 18) {
        addlongs(who.gold, gold50k);
      } else if (objectr.special === 19) {
        addlongs(who.experience, gold50k);
      } else if (objectr.special === 20) {
        who.status = Tstatus.lost;
      } else if (objectr.special === 21) {
        who.status = Tstatus.ok;
        who.hitPoints = who.maximumHitPoints;
        who.lostLocation[0] = 0;
      } else if (objectr.special === 22) {
        who.maximumHitPoints = who.maximumHitPoints + 1;
      } else if (objectr.special === 23) {
        // The original's own comment marks this bound as a bug: it runs to PARTYCNT rather than
        // PARTYCNT - 1, so with a full party of six it reaches CHARACTR[ 6], one past the end.
        // What lies there is not scratch - SCNTOC is declared immediately after CHARACTR, so the
        // stray write lands in the scenario's table of contents. Reaching past the array here
        // would throw instead, so the slot past the last is one of its own, healed and dropped.
        // Which of SCNTOC's words the original hit is not something a decoded record can say.
        for (spctemp = 0; spctemp <= g.partycnt; spctemp++) {
          const healed: ICharacter = g.charactr[spctemp] ?? blankchar();

          healed.hitPoints = healed.maximumHitPoints;
        }
      }
    }

    for (possi = 1; possi <= who.possessions.count; possi++) {
      if (who.possessions.items[possi - 1].objectIndex > 0) {
        readobject(who.possessions.items[possi - 1].objectIndex);

        if (objectr.special > 0) {
          await spcpower();
        }
      }
    }
  }


  /**
   * DOEQUIP. One slot's worth of choosing. Everything of that kind the character can use is
   * listed, and a cursed one among them takes the choice away: it goes back on whatever is picked,
   * and nothing is asked at all.
   */
  async function doequip(): Promise<void> {
    await withExit('DOEQUIP', async (): Promise<void> => {

      /** EQUIPONE. This UNTIL is a real AND, so it does keep asking until the number is one of the listed. */
      async function equipone(): Promise<void> {
        await withExit('EQUIPONE', async (): Promise<void> => {
          do {
            gotoxy(0, 15);
            write(chr(11));
            write('WHICH ONE ([RET] FOR NONE) ? >');
            await getkey();

            if (g.inchar === chr(CRETURN)) {
              exit('EQUIPONE');
            }

            possi = ord(g.inchar) - ord('0');
          } while (!((possi > 0) && (possi <= posscnt)));

          who.possessions.items[objlist[possi] - 1].equipped = true;
          armorpow(chari, objlist[possi], who.possessions.items[objlist[possi] - 1].objectIndex);
        });
      }

      /** CURSBELL. Each letter followed by two bells, so the word arrives ringing. */
      function cursbell(cursstr: string): void {
        for (let x: number = 1; x <= cursstr.length; x++) {
          write(cursstr.substring(x - 1, x));
          write(chr(7));
          write(chr(7));
        }
      }

      if (!canuse[obji]) {
        exit('DOEQUIP');
      }

      write(chr(12));
      write('SELECT ');

      if (obji === Tobjtype.weapon) {
        write('WEAPON');
      } else if (obji === Tobjtype.armor) {
        write('ARMOR');
      } else if (obji === Tobjtype.shield) {
        write('SHIELD');
      } else if (obji === Tobjtype.helmet) {
        write('HELMET');
      } else if (obji === Tobjtype.gauntlet) {
        write('GAUNTLETS');
      } else if (obji === Tobjtype.misc) {
        write('MISC. ITEM');
      }

      write(' FOR ');
      writeln(who.name);
      writeln();
      writeln();
      posscnt = 0;

      for (possi = 1; possi <= who.possessions.count; possi++) {
        if (who.possessions.items[possi - 1].objectIndex > 0) {
          readobject(who.possessions.items[possi - 1].objectIndex);

          if ((objectr.objectType === obji) &&
              (objectr.usableByClass[who.characterClass] !== 0)) {
            posscnt = posscnt + 1;
            objlist[posscnt] = possi;
            write([ ' ', 10 ]);
            write([ posscnt, 1 ]);
            write(')');

            if (who.possessions.items[possi - 1].cursed) {
              write('-');
            } else if (who.possessions.items[possi - 1].identified) {
              write(' ');
            } else {
              write('?');
            }

            if (who.possessions.items[possi - 1].identified) {
              writeln(objectr.name);
            } else {
              writeln(objectr.unidentifiedName);
            }
          }
        }
      }

      // The same scan twice, and the second is not the first over again: ARMORPOW, which EQUIPONE
      // calls on whatever was picked, writes that slot's CURSED from the object record, and writes
      // it TRUE outright when the thing's alignment fights the character's. So picking an
      // unidentified cursed item, or one of the wrong alignment, turns the answer from no to yes
      // between the two scans - and then this runs ARMORPOW on that same slot a SECOND time, so
      // its armour class, hit modifier and swings all land twice. That is the original's
      // behaviour, and the reason the scan is written out again rather than the answer kept.
      //
      // A cursed one found by the first scan means no choice was offered at all, and that one goes
      // back on regardless.
      tempx = 0;

      for (possi = 1; possi <= posscnt; possi++) {
        if (who.possessions.items[objlist[possi] - 1].cursed) {
          tempx = possi;
        }
      }

      if (tempx === 0) {
        await equipone();
      }

      tempx = 0;

      for (possi = 1; possi <= posscnt; possi++) {
        if (who.possessions.items[objlist[possi] - 1].cursed) {
          tempx = possi;
        }
      }

      if (tempx > 0) {
        gotoxy(7, 23);
        cursbell('** CURSED **');
        who.possessions.items[objlist[tempx] - 1].equipped = true;
        armorpow(chari, objlist[tempx], who.possessions.items[objlist[tempx] - 1].objectIndex);
      }
    });
  }


  initstuf();
  normpow();
  unarmed = true;

  if (equipall) {
    arm4char();
  } else {
    // WEAPON through GAUNTLET, then MISC on its own. SPECIAL sits between them in the enumeration
    // and is stepped over, so nothing of that kind is ever offered for a slot.
    for (obji = Tobjtype.weapon; obji <= Tobjtype.gauntlet; obji++) {
      await doequip();
    }

    obji = Tobjtype.misc;
    await doequip();
    await chspcpow();
  }

  if (who.characterClass === Tclass.ninja) {
    if (unarmed) {
      who.armourClass = (who.armourClass - Math.trunc(who.level / 3)) - 2;
    }
  }
}


/** EQUIP6. Everybody, from what they already have on, and then on to wherever they were going. */
export async function equip6(): Promise<void> {
  equipall = true;

  for (let partyx: number = 0; partyx <= (g.partycnt - 1); partyx++) {
    await equipchr(partyx);
  }

  if (g.xgoto === Xgoto.xequip6) {
    g.xgoto = Xgoto.xinspct2;
  } else {
    g.xgoto = Xgoto.xrunner;
    graphics();
  }
}


/** EQUIP1. One character, choosing what to put on, from the camp's equip screen. */
export async function equip1(charx: number): Promise<void> {
  equipall = false;
  await equipchr(charx);
  g.xgoto = Xgoto.xbck2cmp;
  g.llbase04 = charx;
}


/**
 * REORDER. A new marching order, which decides who is in reach of what.
 *
 * LIST is indexed by character and holds the place they are being moved to, 99 until they are
 * picked. The last member is never asked for: whoever is left keeps 99, which sorts them to the
 * back, and then they are named without ever having been chosen.
 */
export async function reorder(): Promise<void> {
  await withExit('REORDER', async (): Promise<void> => {
    const list: number[] = new Array<number>(6).fill(99);

    g.xgoto = Xgoto.xinspct2;

    if (g.partycnt < 2) {
      exit('REORDER');
    }

    gotoxy(0, 11);
    write(chr(11), [ 'REORDERING', 25 ]);

    for (let partyx: number = 0; partyx <= (g.partycnt - 1); partyx++) {
      list[partyx] = 99;
      gotoxy(0, 13 + partyx);
      write([ partyx + 1, 1 ], ')');
    }

    for (let partyx: number = 0; partyx <= (g.partycnt - 2); partyx++) {
      let done: boolean = false;
      let partynum: number = 0;

      do {
        done = false;
        gotoxy(1, 13 + partyx);
        write('   ');
        gotoxy(1, 13 + partyx);
        write('>>');
        await getkey();
        partynum = ord(g.inchar) - ord('1');

        if ((partynum >= 0) && (partynum < g.partycnt)) {
          if (list[partynum] === 99) {
            list[partynum] = partyx;
            done = true;
          }
        }
      } while (!done);

      gotoxy(1, 13 + partyx);
      write(') ', g.charactr[partynum].name);
    }

    for (let partyx: number = 0; partyx <= (g.partycnt - 2); partyx++) {
      for (let partynum: number = partyx + 1; partynum <= (g.partycnt - 1); partynum++) {
        if (list[partynum] < list[partyx]) {
          const charrec: ICharacter = g.charactr[partyx];

          g.charactr[partyx] = g.charactr[partynum];
          g.charactr[partynum] = charrec;

          let switch_: number = g.chardisk[partyx];

          g.chardisk[partyx] = g.chardisk[partynum];
          g.chardisk[partynum] = switch_;

          switch_ = list[partyx];
          list[partyx] = list[partynum];
          list[partynum] = switch_;
        }
      }
    }

    gotoxy(1, 13 + g.partycnt - 1);
    write(') ', g.charactr[g.partycnt - 1].name);
  });
}

