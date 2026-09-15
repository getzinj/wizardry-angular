// Wiz1B.DSK/COMBAT.TEXT.txt - the fight: the spell numbers, the record a fight is kept in, and
// CINIT, which either sets a fight up or writes down what came of it.
//
// COMBAT is the biggest segment in the game and the original spreads it over five files, so this
// port keeps the same five: CUTIL's procedures in combat2 and combat3, MELEE's in combat4 and
// combat5, and - as in the original - the COMBAT segment's own body at the end of combat5.
//
// A fight is five groups in one array. Group 0 is the party and groups 1 to 4 are the monsters,
// which is what lets MELEE run one loop over attackers without caring which side they are on.

import type { IHitPointRoll, IMonster } from '../data/layout/wiz-types';
import { Zone, monster } from '../data/layout/wiz-types';
import { word } from '../data/layout/ucsd-layout';
import { exit, withExit } from '../runtime/pascal-exit';
import { disk, rt } from '../runtime/runtime';
import type { ITwizlong } from './wiz';
import { PARTY_MAXIMUM, Talign, Tstatus, Xgoto, g } from './wiz';
import { chr, clearpic, getkey, printstr, random, write } from './wiz2';

// The spell names as numbers. A spell is cast by typing its name, which GETSPELL reduces to one of
// these; the same numbers are what the scenario disk holds in SPELLHSH, and what a monster's
// attack is recorded as. CALFO and KANDI do not match their own names, so neither can be cast in
// combat - the original's comments give the numbers the names really hash to.
export const HALITO: number = 4178;
export const MOGREF: number = 2409;
export const KATINO: number = 3983;
export const DUMAPIC: number = 3245;

export const DILTO: number = 3340;
export const SOPIC: number = 1953;

export const MAHALITO: number = 6181;
export const MOLITO: number = 4731;

export const MORLIS: number = 4744;
export const DALTO: number = 3180;
export const LAHALITO: number = 6156;

export const MAMORLIS: number = 7525;
export const MAKANITO: number = 6612;
export const MADALTO: number = 4925;

export const LAKANITO: number = 6587;
export const ZILWAN: number = 4573;
export const MASOPIC: number = 3990;
export const HAMAN: number = 1562;

export const MALOR: number = 3128;
export const MAHAMAN: number = 2597;

/** TILTOWAIT, which UCSD shortens to eight significant characters. */
export const TILTOWAI: number = 11157;

export const KALKI: number = 1449;
export const DIOS: number = 2301;
export const BADIOS: number = 3675;
export const MILWA: number = 2889;
export const PORFIC: number = 2287;

export const MATU: number = 3139;
export const CALFO: number = 0; // 1717
export const MANIFO: number = 2619;
export const MONTINO: number = 5970;

export const LOMILWA: number = 5333;
export const DIALKO: number = 2718;
export const LATUMAPI: number = 6491;
export const BAMATU: number = 5169;

export const DIAL: number = 761;
export const BADIAL: number = 1253;
export const LATUMOFI: number = 9463;
export const MAPORFIC: number = 4322;

export const DIALMA: number = 1614;
export const BADIALMA: number = 2446;
export const LITOKAN: number = 4396;
export const KANDI: number = 1185; // 1885
export const DI: number = 180;
export const BADI: number = 382;

export const LORTO: number = 4296;
export const MADI: number = 547;
export const MABADI: number = 759;
export const LOKTOFEI: number = 8330;

export const MALIKTO: number = 5514;
export const KADORTO: number = 6673;

/** Groups in a fight, counting the party as group 0. */
export const GROUP_COUNT: number = 5;

/**
 * TEMP04 is ARRAY[ 0..8], nine being as many monsters as a group can hold, but three places index
 * it one past the living: MAMORLIS's MODAC, MAKANITO, and DECINAUD's own bug. With range checking
 * off, a group of nine put that tenth slot exactly where B begins, which is the monster's
 * unidentified name - so MAKANITO on a group of nine garbles the name DSPENEMY prints for them.
 * Here there is a tenth slot for it to land in instead, and the name stays as it was.
 */
const TEMP04_SLOTS: number = 10;

/** A picture is a block of the scenario, and ten bytes of it are one row of seventy pixels. */
const PICTURE_SIZE: number = 512;
const PICTURE_BYTES_PER_ROW: number = 10;

/** Rows of the screen a monster picture covers. */
const PICTURE_FIRST_ROW: number = 23;
const PICTURE_LAST_ROW: number = 72;


/** TENEMY2.A.TEMP04's element: what one combatant is doing this round, and what it costs them. */
export interface ITemp04 {
  victim: number;

  /**
   * What they are doing: a spell's number, 0 for nothing, or one of the negative codes MELEE
   * dispatches on - -1 fight, -2 flee, -3 breathe, -4 call for help, -5 dispell.
   */
  spellhsh: number;

  /** Which of MELEE's ten passes they act on; -1 means they do not act at all. */
  agility: number;

  hpleft: number;

  /** What spells have done to their armour class this fight, added to the character's own. */
  armorcl: number;

  /** Rounds left unable to speak, so unable to cast. */
  inaudcnt: number;

  status: Tstatus;
}


/** TENEMY2: one side of the fight. A is how they are doing, B is what they are. */
export interface ITenemy2 {
  a: {
    identifi: boolean;

    /** How many of them are still in the fight, dead ones at the end of TEMP04 included. */
    alivecnt: number;

    /** How many there were to start with, which is what REWARDS pays experience for. */
    enmycnt: number;

    enemyid: number;
    temp04: ITemp04[];
  };

  /** The monster record, straight off the disk. Group 0 is the party and has no use for it. */
  b: IMonster;
}


/** TBATRSLT: what COMBAT leaves behind for REWARDS. */
export interface ITbatrslt {
  enmycnt: number[];
  enmyid: number[];
  drained: boolean[];
}


function blanktemp04(): ITemp04 {
  return {
    victim: 0,
    spellhsh: 0,
    agility: 0,
    hpleft: 0,
    armorcl: 0,
    inaudcnt: 0,
    status: Tstatus.ok,
  };
}


export function blankmonster(): IMonster {
  return monster.read(new Uint8Array(monster.size), 0);
}


function blankenemy2(): ITenemy2 {
  return {
    a: {
      identifi: false,
      alivecnt: 0,
      enmycnt: 0,
      enemyid: 0,
      temp04: Array.from({ length: TEMP04_SLOTS }, blanktemp04),
    },
    b: blankmonster(),
  };
}


/**
 * COMBAT's own variables, which its other four files assign to. A module cannot assign to a name
 * it imported, so the ones that are not arrays live in here.
 */
export const cvar: { cinitfl1: number; surprise: number; donefigh: boolean } = {
  cinitfl1: 0,
  surprise: 0,
  donefigh: false,
};

/** Which roster slot each of the party came from when the fight started, so DSPPARTY can undo the
 *  sorting it does and hand REWARDS the party in the order it was in. */
export const prebator: number[] = new Array<number>(PARTY_MAXIMUM).fill(0);

/** Who has had a level taken off them, which REWARDS gives back at the cost of the experience. */
export const drained: boolean[] = new Array<boolean>(PARTY_MAXIMUM).fill(false);

export const battlerc: ITenemy2[] = Array.from({ length: GROUP_COUNT }, blankenemy2);

/**
 * The hand-off to REWARDS. The original wrote this over the top of the disk cache and REWARDS2
 * read it back out of there - GIVEEXP's MOVELEFT( IOCACHE, BATRESLT, SIZEOF( TBATRSLT)) at
 * REWARDS2.TEXT.txt:193 - because two segments are never in memory together and the cache was the
 * only buffer they both knew about. There is no cache here, so it is simply left here.
 */
export const batreslt: ITbatrslt = {
  enmycnt: [0, 0, 0, 0, 0],
  enmyid: [0, 0, 0, 0, 0],
  drained: new Array<boolean>(PARTY_MAXIMUM).fill(false),
};


/** A record assignment between TEMP04 slots, which in Pascal copies the fields. */
export function copytemp04(into: ITemp04, from: ITemp04): void {
  Object.assign(into, from);
}


/**
 * CALC1 is declared TWIZLONG and passed where a THPREC is wanted. Both are three words, so the
 * three fields line up: LOW is the dice count, MID the range and HIGH the minimum.
 */
function longasroll(long: ITwizlong): IHitPointRoll {
  return { diceCount: long.low, diceSides: long.mid, bonus: long.high };
}


/** Puts the segment's variables back, for a test that wants a known starting point. */
export function resetcombat(): void {
  cvar.cinitfl1 = 0;
  cvar.surprise = 0;
  cvar.donefigh = false;
  prebator.fill(0);
  drained.fill(false);

  for (let groupi: number = 0; groupi < GROUP_COUNT; groupi++) {
    battlerc[groupi] = blankenemy2();
  }
}


/**
 * ENEMYPIC. Fifty rows of ten bytes dropped straight into video memory, which is why a picture is
 * stored as a block rather than as a record of fields.
 *
 * The original is handed the offset GETREC returned - 512 * (PIC MOD 2), two pictures to a block
 * pair - and walks along the cache from there, and what it tests for being negative is that offset
 * rather than PIC. So it rings the bell and shows the first picture only for an odd negative PIC;
 * an even negative one comes out as offset zero and is read from a block pair in front of the zone,
 * which is a disk read this port has nothing to match. The index is tested here instead, so both
 * land on the first picture, and a record that is not there is never asked for.
 */
function enemypic(pic: number): void {
  clearpic();

  let enemyid: number = pic;

  if (enemyid < 0) {
    enemyid = 0;
    write(chr(7));
  }

  const picture: Uint8Array = disk().readRecord(Zone.picture, enemyid, PICTURE_SIZE);
  let at: number = 0;

  for (let picline: number = PICTURE_FIRST_ROW; picline <= PICTURE_LAST_ROW; picline++) {
    rt().display.hires.blitPictureRow(picline, picture, at, PICTURE_BYTES_PER_ROW);
    at = at + PICTURE_BYTES_PER_ROW;
  }
}


/** SVREWARD. The fight is over: wake anyone asleep or afraid, and write down who was fought. */
function svreward(): void {
  for (let x: number = 0; x <= (g.partycnt - 1); x++) {
    if ((g.charactr[x].status === Tstatus.asleep) || (g.charactr[x].status === Tstatus.afraid)) {
      g.charactr[x].status = Tstatus.ok;
    }
  }

  // The original reads the table of contents here for the sake of the read: it puts a known pair
  // in the cache and writes out whatever was still dirty, before the cache is written over with
  // the battle result. What is left of it is the two bytes it copied into LLBASE04, which are the
  // length of GAMENAME and its first character.
  g.llbase04 = disk().read(Zone.toc, 0, word());

  for (let x: number = 0; x < drained.length; x++) {
    batreslt.drained[x] = drained[x];
  }

  for (let x: number = 1; x <= 4; x++) {
    batreslt.enmyid[x] = battlerc[x].a.enemyid;
    batreslt.enmycnt[x] = battlerc[x].a.enmycnt;
  }
}


/** INITATTK. Everything a new fight needs: who is in it, how many, and who saw whom first. */
async function initattk(): Promise<void> {
  let charx: number = 0;
  let groupi: number = 0;

  /**
   * ENEMYCNT. The hit-point roll, used for hit points and for how many of them there are. The
   * count goes through LLBASE04 rather than a local, and it is left there.
   */
  function enemycnt(hprec: IHitPointRoll): number {
    const roll: IHitPointRoll = { ...hprec };

    g.llbase04 = roll.bonus;

    while (roll.diceCount > 0) {
      g.llbase04 = g.llbase04 + (random() % roll.diceSides) + 1;
      roll.diceCount = roll.diceCount - 1;
    }

    return g.llbase04;
  }

  function initgrup(): void {
    /**
     * ENGROUPS. Reads a monster, and then may read the monster it keeps company with into the next
     * group along, up to four groups deep. A monster whose UNIQUE has run down to nothing stands
     * aside for the one named in ENMYTEAM, which is how the uniques are used up.
     */
    function engroups(enmyi: number, enmygrup: number): void {
      let which: number = enmyi;

      do {
        battlerc[enmygrup].b = disk().read(Zone.monster, which, monster);

        if (battlerc[enmygrup].b.unique === 0) {
          which = battlerc[enmygrup].b.friends;
        }
      } while (battlerc[enmygrup].b.unique === 0);

      battlerc[enmygrup].a.enemyid = which;

      if (enmygrup < 4) {
        if (battlerc[enmygrup].b.friends >= 0) {
          if (enmygrup <= g.mazelev) {
            if ((random() % 100) < battlerc[enmygrup].b.friendsPercent) {
              engroups(battlerc[enmygrup].b.friends, enmygrup + 1);
            }
          }
        }
      }
    }

    for (groupi = 1; groupi <= 4; groupi++) {
      battlerc[groupi].a.enmycnt = 0;
      battlerc[groupi].a.alivecnt = 0;
      battlerc[groupi].a.enemyid = -1;
    }

    engroups(g.enemyinx, 1);

    g.enemyinx = battlerc[1].a.enemyid;
    enemypic(battlerc[1].b.picture);

    for (groupi = 1; groupi <= 4; groupi++) {
      if (battlerc[groupi].a.enemyid !== -1) {
        battlerc[groupi].a.enmycnt = enemycnt(longasroll(battlerc[groupi].b.groupRoll));

        if (battlerc[groupi].a.enmycnt > (4 + g.mazelev)) {
          battlerc[groupi].a.enmycnt = 4 + g.mazelev;
        }

        if (battlerc[groupi].a.enmycnt > 9) {
          battlerc[groupi].a.enmycnt = 9;
        }

        if (battlerc[groupi].a.enmycnt < 1) {
          battlerc[groupi].a.enmycnt = 1;
        }

        battlerc[groupi].a.alivecnt = battlerc[groupi].a.enmycnt;
        battlerc[groupi].a.identifi = false;

        for (charx = 0; charx <= (battlerc[groupi].a.enmycnt - 1); charx++) {
          const one: ITemp04 = battlerc[groupi].a.temp04[charx];

          one.armorcl = 0;
          one.inaudcnt = 0;
          one.hpleft = enemycnt(battlerc[groupi].b.hitPoints);
          one.status = Tstatus.ok;
        }
      }
    }
  }

  /** INTPARTY. The party joins the fight as group 0, each of them carrying their own state in. */
  function intparty(): void {
    battlerc[0].a.enmycnt = g.partycnt;
    battlerc[0].a.alivecnt = g.partycnt;

    for (charx = 0; charx <= (g.partycnt - 1); charx++) {
      const one: ITemp04 = battlerc[0].a.temp04[charx];

      one.armorcl = 0;
      one.inaudcnt = 0;
      one.hpleft = g.charactr[charx].hitPoints;
      one.status = g.charactr[charx].status;

      // Row 0 of each of these is what the character's equipment gives them and row 1 is what
      // counts in the fight, which spells and broken items then change without touching row 0.
      g.charactr[charx].bonusVersusType3[1] = [...g.charactr[charx].bonusVersusType3[0]];
      g.charactr[charx].bonusVersusType2[1] = [...g.charactr[charx].bonusVersusType2[0]];
    }
  }

  /**
   * FRIENDLY. Some monsters would rather not fight, and a party with anyone good in it is offered
   * the choice. Walking away from a fight you could have had is what turns a good character evil.
   */
  async function friendly(): Promise<void> {
    await withExit('FRIENDLY', async (): Promise<void> => {
      let goodleav: boolean = false;
      let index: number = 0;

      for (index = 0; index <= (g.partycnt - 1); index++) {
        goodleav = goodleav || (g.charactr[index].alignment === Talign.good);
      }

      if (!goodleav) {
        exit('FRIENDLY');
      }

      const zero99: number = random() % 100;

      index = 50;

      switch (battlerc[1].b.monsterClass) {
        case 0: index = 60; break;
        case 1: index = 55; break;
        case 2: index = 65; break;
        case 3: index = 53; break;
        case 4: index = 80; break;

        case 7: index = 75; break;
        default: break;
      }

      if ((zero99 > index) || (zero99 < 50)) {
        exit('FRIENDLY');
      }

      for (index = 1; index <= 4; index++) {
        battlerc[index].a.identifi = true;
      }

      rt().display.hires.clrrect(1, 11, 38, 4);
      rt().display.mvcursor(1, 11);
      printstr('A FRIENDLY GROUP OF ');
      printstr(battlerc[1].b.plural);
      printstr('.');
      rt().display.mvcursor(1, 12);
      printstr('THEY HAIL YOU IN WELCOME!');
      rt().display.mvcursor(1, 14);
      printstr('YOU MAY F)IGHT OR L)EAVE IN PEACE.');
      cvar.surprise = 0;

      do {
        await getkey();
      } while ((g.inchar !== 'F') && (g.inchar !== 'L'));

      if (g.inchar === 'L') {
        g.xgoto = Xgoto.xrunner;
        exit('COMBAT');
      }

      for (index = 0; index <= (g.partycnt - 1); index++) {
        if (g.charactr[index].alignment === Talign.good) {
          if ((random() % 2000) === 565) {
            g.charactr[index].alignment = Talign.evil;
          }
        }
      }
    });
  }

  rt().display.hires.clrrect(13, 1, 26, 4);
  rt().display.hires.clrrect(13, 6, 26, 4);
  rt().display.hires.clrrect(1, 11, 38, 4);
  initgrup();
  intparty();
  drained.fill(false);

  for (g.llbase04 = 0; g.llbase04 <= (g.partycnt - 1); g.llbase04++) {
    prebator[g.llbase04] = g.chardisk[g.llbase04];
  }

  if ((random() % 100) > 80) {
    cvar.surprise = 1;
  } else if ((random() % 100) > 80) {
    cvar.surprise = 2;
  } else {
    cvar.surprise = 0;
  }

  await friendly();
}


/** CINIT. Called twice: once to start the fight, and once to write down how it went. */
export async function cinit(): Promise<void> {
  if (cvar.cinitfl1 === 0) {
    await initattk();
  } else {
    svreward();
  }
}
