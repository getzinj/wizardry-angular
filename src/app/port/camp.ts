// Wiz1C.DSK/CAMP.TEXT.txt - the character sheet's own screens: the spell counts, the item list, the
// camp spells, and the two things that can be done to an item there.
//
// INSPECT is declared here and its body is in camp2, after the last of its nested procedures and
// before CAMPMEN2, which is where the original puts it; the nested procedures are split across the
// two files the same way. What the sheet offers is
// everything a party does between fights, so most of this file is the spells.

import type { ICharacter, IObject } from '../data/layout/wiz-types';
import { Zone, object } from '../data/layout/wiz-types';
import { exit, withExit, withExitSync } from '../runtime/pascal-exit';
import { disk } from '../runtime/runtime';
// The original redeclares all fifty spell numbers here and then tests fourteen of them, which are
// the ones that do anything outside a fight. These are the same numbers COMBAT holds.
import {
  DI, DIAL, DIALKO, DIALMA, DIOS, DUMAPIC, KADORTO, KANDI, LATUMOFI, LOMILWA, MADI, MALOR, MAPORFIC,
  MILWA,
} from './combat';
import { Tattrib, Tobjtype, Tstatus, Xgoto, g, setspelgrp, spelgrp } from './wiz';
import {
  centstr, chr, getcharx, getkey, getline, gotoxy, int16, ord, pause2, random, write, writeln,
} from './wiz2';

/** Items a character can carry, which is also the length of the caches below. */
const POSSESSION_SLOTS: number = 8;


/**
 * CAMP's own variables.
 *
 * The four arrays are a cache of what each item slot holds, so redrawing the sheet costs no disk
 * reads: a slot is read only where the object number in it has changed. OBJIDS is set to -1, which
 * is no object, wherever the cache must not be trusted - on entering the segment and before each
 * character chosen off the party list. The original writes that loop out in full in both places;
 * here it is the one function below.
 */
export const objids: number[] = new Array<number>(POSSESSION_SLOTS).fill(-1);

/** Each slot's name twice: as it reads unidentified, and as it reads once it is known. */
export const objnames: string[][] =
  Array.from({ length: POSSESSION_SLOTS }, (): string[] => [ '', '' ]);

export const cursedxx: boolean[] = new Array<boolean>(POSSESSION_SLOTS).fill(false);
export const canuse: boolean[] = new Array<boolean>(POSSESSION_SLOTS).fill(false);

/**
 * Which of the party is being looked at, and whether the sheet wants redrawing. A module cannot
 * assign to a name it imported, so the two that camp2 writes live in here.
 */
export const campvar: { campchar: number; dispstat: boolean } = {
  campchar: 0,
  dispstat: true,
};


/** The loop the segment and the party list both run to say that no slot's name is to be trusted. */
export function clrobjids(): void {
  for (let obji: number = 1; obji <= POSSESSION_SLOTS; obji++) {
    objids[obji - 1] = -1;
  }
}


/** AASTRAA. The line along the bottom that says how something turned out. */
export async function aastraa(astra: string): Promise<void> {
  await centstr(`** ${ astra } **`);
}


/** DSPSPELS. The two rows of spell counts, one per group, mage above priest. */
export function dspspels(): void {
  const who: ICharacter = g.charactr[campvar.campchar];

  gotoxy(0, 9);
  write([ ' ', 7 ]);
  write(' MAGE ');

  for (let indx: number = 1; indx <= 7; indx++) {
    write(spelgrp(who.mageSpellSlots, indx));

    if (indx < 7) {
      write('/');
    }
  }

  writeln();
  write([ ' ', 6 ]);
  write('PRIEST ');

  for (let indx: number = 1; indx <= 7; indx++) {
    write(spelgrp(who.priestSpellSlots, indx));

    if (indx < 7) {
      write('/');
    }
  }
}


/** DSPITEMS. What they are carrying, two to a row, each marked with what can be done with it. */
export function dspitems(): void {
  withExitSync('DSPITEMS', (): void => {
    const who: ICharacter = g.charactr[campvar.campchar];

    gotoxy(0, 12);
    write('*=EQUIP, -=CURSED, ?=UNKNOWN, #=UNUSABLE');

    for (let itemx: number = 14; itemx <= 17; itemx++) {
      gotoxy(0, itemx);
      write(chr(29));
    }

    if (who.possessions.count === 0) {
      exit('DSPITEMS');
    }

    for (let itemx: number = 1; itemx <= who.possessions.count; itemx++) {
      const held: ICharacter['possessions']['items'][number] = who.possessions.items[itemx - 1];

      gotoxy(20 - (20 * (itemx % 2)), 14 + Math.trunc((itemx - 1) / 2));

      if (objids[itemx - 1] !== held.objectIndex) {
        const objectr: IObject = disk().read(Zone.object, held.objectIndex, object);

        objids[itemx - 1] = held.objectIndex;
        objnames[itemx - 1][1] = objectr.name;
        objnames[itemx - 1][0] = objectr.unidentifiedName;
        canuse[itemx - 1] = objectr.usableByClass[who.characterClass] !== 0;
        cursedxx[itemx - 1] = objectr.cursed;
      }

      write([ itemx, 1 ]);
      write(')');

      if (held.equipped) {
        write(cursedxx[itemx - 1] ? '-' : '*');
      } else if (held.identified) {
        write(canuse[itemx - 1] ? ' ' : '#');
      } else {
        write('?');
      }

      write(objnames[itemx - 1][held.identified ? 1 : 0]);
    }
  });
}


/**
 * CASTSPEL. A spell out of camp, by name or out of an item. Only the ones that do something outside
 * a fight are here; anything else, including every mage attack spell, falls through to "WHAT?".
 *
 * The hash of what was typed is written at column 41, past the right-hand edge of the forty-column
 * screen, so on this text screen it goes nowhere and what looks like a debugging aid left in shows
 * nothing. Whether the Apple's own GOTOXY clamped X instead, putting it at column 39, is not
 * settled by the source; every other GOTOXY(41, ...) in the game writes nothing, so this is the
 * only place it could tell.
 */
export async function castspel(spelhash: number): Promise<void> {
  await withExit('CASTSPEL', async (): Promise<void> => {
    // CASTSPEL's own USEITEM is a boolean saying the spell came out of an item rather than a spell
    // book. It shadows the procedure of the same name here, which the original never does: Pascal
    // puts a name in scope only from its declaration onwards, and PROCEDURE USEITEM is declared
    // after CASTSPEL, so inside CASTSPEL there is nothing there to shadow. Same behaviour either
    // way; only the reason the name resolves to the boolean differs.
    let useitem: boolean = false;
    let healme: number = 0;
    let spelhash_: number = spelhash;

    async function exitcast(exitstr: string): Promise<void> {
      await aastraa(exitstr);
      dspspels();
      exit('CASTSPEL');
    }

    /** HEALWHO. Which of the party it is aimed at; a bare return abandons the spell. */
    async function healwho(): Promise<void> {
      healme = await getcharx(true, 'CAST ON WHO');

      if (healme === -1) {
        await exitcast('NOT IN THE PARTY');
      }
    }

    /** CHKSPCNT. Whether they know it and have a slot left, which an item pays for instead. */
    async function chkspcnt(priestgr: number, spellidx: number): Promise<void> {
      await withExit('CHKSPCNT', async (): Promise<void> => {
        if (useitem) {
          exit('CHKSPCNT');
        }

        const who: ICharacter = g.charactr[campvar.campchar];

        if ((spelgrp(who.priestSpellSlots, priestgr) <= 0) || (who.spellsKnown[spellidx] === 0)) {
          await exitcast('YOU CANT CAST IT');
        }
      });
    }

    /** DECPRIEST. The slot is spent here rather than where the spell is worked out. */
    async function decpriest(priestgr: number): Promise<void> {
      if (!useitem) {
        const who: ICharacter = g.charactr[campvar.campchar];

        setspelgrp(who.priestSpellSlots, priestgr, spelgrp(who.priestSpellSlots, priestgr) - 1);
      }

      if (g.fizzles > 0) {
        await exitcast('SPELL HAS NO EFFECT');
      }
    }

    /** DOHEAL. The four healing spells, and MADI, which is told apart by a count of -1. */
    async function doheal(hptries: number,
                          maxhptry: number,
                          priestgr: number,
                          spellidx: number): Promise<void> {
      let tries: number = hptries;
      let hphealed: number = 0;

      await chkspcnt(priestgr, spellidx);
      await healwho();
      await decpriest(priestgr);

      const healed: ICharacter = g.charactr[healme];

      if (tries === -1) {
        hphealed = healed.maximumHitPoints;
        healed.lostLocation[0] = 0;

        if (healed.status < Tstatus.dead) {
          healed.status = Tstatus.ok;
        }
      } else {
        while (tries > 0) {
          hphealed = hphealed + (random() % maxhptry) + 1;
          tries = tries - 1;
        }
      }

      healed.hitPoints = healed.hitPoints + hphealed;

      if (healed.hitPoints > healed.maximumHitPoints) {
        healed.hitPoints = healed.maximumHitPoints;
      }

      gotoxy(0, 23);
      write('CURED ', hphealed, ' HP - NOW ', healed.hitPoints, '/', healed.maximumHitPoints);
      gotoxy(41, 0);
      await pause2();
      dspspels();
      exit('CASTSPEL');
    }

    /** DOKANDI. KANDI finds whoever was left behind, which UTILITIE does and then comes back. */
    async function dokandi(): Promise<void> {
      await chkspcnt(5, 42);
      await decpriest(5);
      campvar.dispstat = true;
      g.llbase04 = campvar.campchar;
      g.base12 = Xgoto.xcastle;
      g.xgoto = Xgoto.xcampstf;
      exit('CAMP');
    }

    /**
     * DODIKADO. DI and KADORTO, the two that raise the dead. Either costs the one raised a point of
     * vitality, and running out of it is the end of them; failing makes them worse than they were.
     */
    async function dodikado(dikadoxx: number): Promise<void> {
      async function dikadort(): Promise<void> {
        const raised: ICharacter = g.charactr[healme];

        if ((random() % 100) <= (4 * raised.attributes[Tattrib.vitality])) {
          raised.status = Tstatus.ok;

          if (dikadoxx === 5) {
            raised.hitPoints = 1;
          } else {
            raised.hitPoints = raised.maximumHitPoints;
          }

          if (raised.attributes[Tattrib.vitality] === 3) {
            raised.status = Tstatus.lost;
          } else {
            raised.attributes[Tattrib.vitality] = raised.attributes[Tattrib.vitality] - 1;
          }
        }

        if (raised.status === Tstatus.ok) {
          await exitcast('EXCELSIOR');
        } else {
          // A step further down the list: dead becomes ashes, and ashes lost. A character of vitality
          // three raised by a spell that works is set to OK and then to LOST, which fails the test
          // above, so this steps one past the end of TSTATUS. The original has range checking off
          // and does the same, so the value is left to run out of the enum here too.
          raised.status = raised.status + 1;
          await exitcast('OOPPS!');
        }
      }

      if (dikadoxx === 5) {
        await chkspcnt(dikadoxx, 43);
      } else {
        await chkspcnt(dikadoxx, 50);
      }

      await healwho();
      await decpriest(dikadoxx);

      const raised: ICharacter = g.charactr[healme];

      if (dikadoxx === 5) {
        if (raised.status === Tstatus.dead) {
          await dikadort();
        } else if (raised.status === Tstatus.ashes) {
          await exitcast('"KADORTO" NEEDED');
        }
      } else if ((raised.status === Tstatus.dead) || (raised.status === Tstatus.ashes)) {
        await dikadort();
      } else if (raised.status === Tstatus.lost) {
        await exitcast('LOST');
      }

      await exitcast('NOT DEAD');
    }

    /** DODUMAPI. DUMAPIC says where the party are standing, which UTILITIE draws. */
    async function dodumapi(): Promise<void> {
      const who: ICharacter = g.charactr[campvar.campchar];

      if (!useitem) {
        if ((spelgrp(who.mageSpellSlots, 1) === 0) || (who.spellsKnown[4] === 0)) {
          await exitcast('YOU CANT CAST IT');
        }
      }

      if (g.fizzles > 0) {
        await exitcast('SPELL FAILS');
      }

      if (!useitem) {
        setspelgrp(who.mageSpellSlots, 1, spelgrp(who.mageSpellSlots, 1) - 1);
      }

      g.llbase04 = campvar.campchar;
      g.base12 = Xgoto.xgilgams;
      g.xgoto = Xgoto.xcampstf;
      exit('CAMP');
    }

    /** DOMALOR. MALOR out of camp, which is the one that asks where to go. */
    async function domalor(): Promise<void> {
      const who: ICharacter = g.charactr[campvar.campchar];

      if (!useitem) {
        if ((spelgrp(who.mageSpellSlots, 7) === 0) || (who.spellsKnown[19] === 0)) {
          await exitcast('YOU CANT CAST IT');
        }
      }

      if (g.fizzles > 0) {
        await exitcast('SPELL FAILS');
      }

      if (!useitem) {
        setspelgrp(who.mageSpellSlots, 7, spelgrp(who.mageSpellSlots, 7) - 1);
      }

      g.llbase04 = campvar.campchar;
      g.base12 = Xgoto.xinspect;
      g.xgoto = Xgoto.xcampstf;
      exit('CAMP');
    }

    campvar.dispstat = false;
    useitem = spelhash_ > 0;

    if (spelhash_ === -1) {
      gotoxy(0, 18);
      write(chr(11));
      write([ 'WHAT SPELL ? >', 24 ]);

      const spelname: string = await getline();

      spelhash_ = spelname.length;

      for (let spelli: number = 1; spelli <= spelname.length; spelli++) {
        const hashcalc: number = ord(spelname[spelli - 1]) - 64;

        spelhash_ = int16(spelhash_ + (hashcalc * hashcalc * spelli));
      }
    }

    gotoxy(41, 0);
    write([ spelhash_, 6 ], ' ');

    if (spelhash_ === DIOS) {
      await doheal(1, 8, 1, 23);
    } else if (spelhash_ === MILWA) {
      await chkspcnt(1, 25);
      await decpriest(1);
      g.light = 15 + (random() % 15);
    } else if (spelhash_ === DUMAPIC) {
      await dodumapi();
    } else if (spelhash_ === KANDI) {
      await dokandi();
    } else if (spelhash_ === LOMILWA) {
      await chkspcnt(3, 31);
      await decpriest(3);
      g.light = 32000;
    } else if (spelhash_ === LATUMOFI) {
      await chkspcnt(4, 37);
      await healwho();
      await decpriest(4);
      g.charactr[healme].lostLocation[0] = 0;
    } else if (spelhash_ === DIALKO) {
      await chkspcnt(3, 32);
      await healwho();
      await decpriest(3);

      if ((g.charactr[healme].status === Tstatus.plyze)
          || (g.charactr[healme].status === Tstatus.asleep)) {
        g.charactr[healme].status = Tstatus.ok;
      }
    } else if (spelhash_ === DIAL) {
      await doheal(2, 8, 4, 35);
    } else if (spelhash_ === MAPORFIC) {
      await chkspcnt(4, 38);
      await decpriest(4);
      g.acmod2 = 2;
    } else if (spelhash_ === DIALMA) {
      await doheal(3, 8, 5, 39);
    } else if (spelhash_ === DI) {
      await dodikado(5);
    } else if (spelhash_ === MADI) {
      await doheal(-1, -1, 6, 46);
    } else if (spelhash_ === KADORTO) {
      await dodikado(7);
    } else if (spelhash_ === MALOR) {
      await domalor();
    } else {
      await exitcast('WHAT?');
    }

    await exitcast('DONE!');
  });
}


/** USEITEM. An item with a spell in it, which casts that spell and may be used up doing it. */
export async function useitem(): Promise<void> {
  await withExit('USEITEM', async (): Promise<void> => {
    let itemx: number = 0;

    async function exituse(exitstr: string): Promise<void> {
      await aastraa(exitstr);
      exit('USEITEM');
    }

    campvar.dispstat = false;

    do {
      gotoxy(0, 18);
      write(chr(11));
      write('USE ITEM (0=EXIT) ? >');
      await getkey();
      writeln();
      itemx = ord(g.inchar) - ord('0');

      if (itemx === 0) {
        exit('USEITEM');
      }
    } while (!((itemx > 0) && (itemx <= g.charactr[campvar.campchar].possessions.count)));

    const held: ICharacter['possessions']['items'][number] =
      g.charactr[campvar.campchar].possessions.items[itemx - 1];
    const theitem: IObject = disk().read(Zone.object, held.objectIndex, object);

    if (theitem.spellPower === 0) {
      await exituse('POWERLESS');
    }

    if (theitem.objectType !== Tobjtype.special) {
      if (!held.equipped) {
        await exituse('NOT EQUIPPED');
      }
    }

    if ((random() % 100) < theitem.changeChance) {
      held.objectIndex = theitem.changesTo;
    }

    await castspel(g.scntoc.spellHash[theitem.spellPower]);
  });
}


/** DROPITEM. Thrown away for good: there is no floor to pick it up off again. */
export async function dropitem(): Promise<void> {
  await withExit('DROPITEM', async (): Promise<void> => {
    let possi: number = 0;

    async function exitdrop(exitstr: string): Promise<void> {
      await aastraa(exitstr);
      exit('DROPITEM');
    }

    campvar.dispstat = false;

    do {
      gotoxy(0, 18);
      write(chr(11));
      write('DROP ITEM (0=EXIT) ? >');
      await getkey();
      possi = ord(g.inchar) - ord('0');

      if (possi === 0) {
        exit('DROPITEM');
      }
    } while (!((possi > 0) && (possi <= g.charactr[campvar.campchar].possessions.count)));

    const carried: ICharacter['possessions'] = g.charactr[campvar.campchar].possessions;

    if (carried.items[possi - 1].cursed) {
      await exitdrop('CURSED');
    }

    if (carried.items[possi - 1].equipped) {
      await exitdrop('EQUIPPED');
    }

    // The slots above it move down one. A record assignment in Pascal copies the fields, so the
    // slot objects themselves stay where they are.
    for (let possx: number = possi + 1; possx <= carried.count; possx++) {
      Object.assign(carried.items[possx - 2], carried.items[possx - 1]);
    }

    carried.count = carried.count - 1;
    dspitems();
    await exitdrop('DROPPED');
  });
}


/** Puts the segment's variables back, for a test that wants a known starting point. */
export function resetcamp(): void {
  objids.fill(-1);
  cursedxx.fill(false);
  canuse.fill(false);

  for (const names of objnames) {
    names[0] = '';
    names[1] = '';
  }

  campvar.campchar = 0;
  campvar.dispstat = true;
}
