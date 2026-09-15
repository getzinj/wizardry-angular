// Wiz1C.DSK/RUNNER2.TEXT.txt - walking the maze.
//
// RUNMAIN is the loop the player spends most of the game in: draw the view, see what the square
// they are standing on does, roll for a wandering monster, let the poison and the healing tick,
// then wait for a key. DRAWMAZE itself is in runner.ts, where it was already ported.
//
// The roll for a wandering monster draws twice whatever the answer, because UCSD Pascal evaluates
// every operand of AND and OR, and the numbers drawn here decide what the rest of the game rolls
// afterwards.

import { MAZE_SIZE, SquareKind, Wall, Zone, maze } from '../data/layout/wiz-types';
import type { ICharacter, IMaze } from '../data/layout/wiz-types';
import { exit, withExit } from '../runtime/pascal-exit';
import { rt } from '../runtime/runtime';
import { getrec, putrec } from './diskio';
import { drawmaze } from './runner';
import { CRETURN, Direction, Tattrib, Tstatus, Xgoto, g } from './wiz';
import {
  chr, clearpic, getkey, getstr, graphics, ord, pause2, printchr, printnum, printstr, random, write
} from './wiz2';

// Segment-level VARs.
let quickplt: boolean = false;
let initturn: boolean = false;
let needdrmz: boolean = false;
let mazelevel: IMaze;

/** The key that makes a kicked door count towards a fixed encounter, as RUNMAIN tests for it. */
const KICK_KEY: number = 75;


/** READMAZE. */
async function readmaze(): Promise<void> {
  mazelevel = await getrec(Zone.maze, g.mazelev - 1, maze);
}


/** PRSTATS. The party list, sorted so whoever is worst off sinks to the bottom. */
function prstats(): void {
  let anyalive: boolean = false;

  function prstatus(charx: number): void {
    const who: ICharacter = g.charactr[charx];

    if (who.status === Tstatus.ok) {
      anyalive = true;

      if (who.lostLocation[0] === 0) {
        printnum(who.maximumHitPoints, 4);
      } else {
        printstr('POISON');
      }
    } else {
      printstr(g.scntoc.statusNames[who.status]);
    }
  }

  for (let charx: number = 0; charx <= (g.partycnt - 2); charx++) {
    for (let tempx: number = charx + 1; tempx <= (g.partycnt - 1); tempx++) {
      if (g.charactr[charx].status > g.charactr[tempx].status) {
        const charrec: ICharacter = g.charactr[charx];

        g.charactr[charx] = g.charactr[tempx];
        g.charactr[tempx] = charrec;

        const save1: number = g.chardisk[charx];

        g.chardisk[charx] = g.chardisk[tempx];
        g.chardisk[tempx] = save1;
      }
    }
  }

  rt().display.hires.clrrect(1, 17, 38, 6);
  anyalive = false;

  for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
    const who: ICharacter = g.charactr[charx];

    rt().display.mvcursor(1, 17 + charx);
    printnum(charx + 1, 1);
    printstr(' ');
    printstr(who.name);
    rt().display.mvcursor(19, 17 + charx);
    printstr(g.scntoc.alignmentNames[who.alignment].substring(0, 1));
    printchr('-');
    printstr(g.scntoc.classNames[who.characterClass].substring(0, 3));
    g.llbase04 = who.armourClass - g.acmod2;

    if (g.llbase04 >= 0) {
      printnum(g.llbase04, 3);
    } else if (g.llbase04 > -10) {
      printstr(' -');
      printnum(Math.abs(g.llbase04), 1);
    } else {
      printstr(' LO');
    }

    if (who.status >= Tstatus.dead) {
      who.hitPoints = 0;
    }

    printnum(who.hitPoints, 5);

    const tempx: number = who.healingPerTurn - who.lostLocation[0];

    if (tempx === 0) {
      printchr(' ');
    } else if (tempx < 0) {
      printchr('-');
    } else {
      printchr('+');
    }

    prstatus(charx);
  }

  if (!anyalive) {
    g.xgoto = Xgoto.xcemetry;
    exit('RUNNER');
  }
}


/** UPDATEHP. Poison and healing, one roll in four, and whoever runs out of hit points dies here. */
async function updatehp(): Promise<void> {
  for (let charx: number = 0; charx <= (g.partycnt - 1); charx++) {
    const who: ICharacter = g.charactr[charx];

    if ((random() % 4) === 2) {
      who.hitPoints = who.hitPoints - who.lostLocation[0] + who.healingPerTurn;
    }

    if (who.hitPoints <= 0) {
      who.lostLocation[0] = 0;

      if (who.status < Tstatus.dead) {
        rt().display.mvcursor(1, 11);
        printstr(who.name);
        printstr(' DIED');
        await pause2();
        rt().display.hires.clrrect(1, 11, 38, 1);
        who.hitPoints = 0;
        who.status = Tstatus.dead;
        prstats();
      }
    } else if (who.hitPoints > who.maximumHitPoints) {
      who.hitPoints = who.maximumHitPoints;
    }
  }
}


/** CLROOMFG. Walking into a room clears the wandering monsters out of the whole of it. */
function clroomfg(xloop: number, yloop: number): void {
  const atx: number = ((xloop + MAZE_SIZE) % MAZE_SIZE);
  const aty: number = ((yloop + MAZE_SIZE) % MAZE_SIZE);

  if (!g.fightmap[atx][aty]) {
    return;
  } else {
    g.fightmap[atx][aty] = false;

    if (mazelevel.northWalls[atx][aty] === Wall.open) { clroomfg(atx, aty + 1); }
    if (mazelevel.eastWalls[atx][aty] === Wall.open) { clroomfg(atx + 1, aty); }
    if (mazelevel.southWalls[atx][aty] === Wall.open) { clroomfg(atx, aty - 1); }
    if (mazelevel.westWalls[atx][aty] === Wall.open) { clroomfg(atx - 1, aty); }
  }
}


function draw(): void {
  drawmaze(rt().display.hires, mazelevel, g, rt().random, quickplt);
}


/** RUNMAIN. */
async function runmain(): Promise<void> {
  function exitrun(mazelvl: number): void {
    g.mazelev = mazelvl;
    clearpic();
    g.xgoto = Xgoto.xnewmaze;
    exit('RUNNER');
  }

  /** SPECSQAR. What the square underfoot does, if it does anything. */
  async function specsqar(): Promise<void> {
    let sqtype: number = 0;

    function spindir(): void {
      g.directio = rt().random.modulo(4) as Direction;
      draw();
    }

    function quietxfr(): void {
      g.mazex = mazelevel.argument2[sqtype];
      g.mazey = mazelevel.argument1[sqtype];

      if (g.mazelev !== mazelevel.argument0[sqtype]) {
        exitrun(mazelevel.argument0[sqtype]);
      }
    }

    function achute(): void {
      printstr('A CHUTE!');
      quietxfr();
    }

    async function stairsyn(): Promise<void> {
      printstr('STAIRS GOING ');

      if (g.mazelev > mazelevel.argument0[sqtype]) {
        printstr('UP.');
      } else {
        printstr('DOWN.');
      }

      rt().display.mvcursor(1, 12);
      printstr('TAKE THEM (Y/N) ?');

      do {
        await getkey();
      } while (!((g.inchar === 'Y') || (g.inchar === 'N')));

      if (g.inchar === 'Y') {
        quietxfr();
      }
    }

    function verydark(): void {
      rt().display.mvcursor(2, 5);
      printstr("IT'S VERY");
      rt().display.mvcursor(2, 6);
      printstr('DARK HERE');
      g.light = 0;
    }

    async function rockwatr(): Promise<void> {
      write(chr(7));
      await pause2();

      for (let partyi: number = 0; partyi <= (g.partycnt - 1); partyi++) {
        const who: ICharacter = g.charactr[partyi];

        if (who.status < Tstatus.dead) {
          if (((random() % 25) + g.mazelev) > who.attributes[Tattrib.agility]) {
            let hpdam: number = mazelevel.argument0[sqtype];

            for (let hptimes: number = 1; hptimes <= mazelevel.argument2[sqtype]; hptimes++) {
              hpdam = hpdam + (random() % mazelevel.argument1[sqtype]) + 1;
            }

            who.hitPoints = who.hitPoints - hpdam;

            if (who.hitPoints < 0) {
              who.hitPoints = 0;
              who.status = Tstatus.dead;
              rt().display.hires.clrrect(1, 11, 38, 1);
              rt().display.mvcursor(1, 11);
              printstr(who.name);
              printstr(' DIED');
              await pause2();
            }
          }
        }
      }

      prstats();
    }

    async function apit(): Promise<void> {
      printstr('A PIT!');
      await rockwatr();
    }

    async function ouch(): Promise<void> {
      printstr('OUCH!');
      await rockwatr();
    }

    function doscnmsg(): void {
      g.llbase04 = sqtype;
      g.xgoto = Xgoto.xscnmsg;
      g.xgoto2 = Xgoto.xrunner;
      exit('RUNNER');
    }

    /** CHENCOUN. A fixed encounter, which is used up once it has been fought. */
    async function chencoun(): Promise<void> {
      await withExit('CHENCOUN', async (): Promise<void> => {
        if (mazelevel.argument0[sqtype] === 0) {
          exit('CHENCOUN');
        }

        if (!g.fightmap[g.mazex][g.mazey]) {
          exit('CHENCOUN');
        }

        rt().display.mvcursor(14, 12);
        printstr('AN ENCOUNTER');
        g.encb4run = false;
        g.attk012 = 2;
        g.xgoto = Xgoto.xcombat;
        g.enemyinx = mazelevel.argument2[sqtype];

        if (mazelevel.argument1[sqtype] > 1) {
          g.enemyinx = g.enemyinx + rt().random.modulo(mazelevel.argument1[sqtype]);
        }

        if (mazelevel.argument0[sqtype] > 0) {
          mazelevel.argument0[sqtype] = mazelevel.argument0[sqtype] - 1;

          if (mazelevel.argument0[sqtype] === 0) {
            mazelevel.squareKind[sqtype] = SquareKind.normal;
          }

          await putrec(Zone.maze, g.mazelev - 1, maze, mazelevel);
        }

        exit('RUNNER');
      });
    }

    /** BUTTONS. A lift, more or less: pick a letter and be taken to that level. */
    async function buttons(): Promise<void> {
      await withExit('BUTTONS', async (): Promise<void> => {
        const minbut: number = mazelevel.argument2[sqtype];
        const maxbut: number = mazelevel.argument1[sqtype];

        printstr('THERE ARE BUTTONS ON THE WALL');
        rt().display.mvcursor(1, 12);
        printstr('MARKED A THROUGH ');
        printchr(chr(ord('A') + maxbut - minbut));
        printchr('.');
        rt().display.mvcursor(1, 14);
        printstr('PRESS ONE (OR RETURN TO LEAVE THEM)');

        do {
          await getkey();
        } while (!((g.inchar === chr(CRETURN))
                || ((g.inchar >= 'A') && (g.inchar <= chr(ord('A') + maxbut - minbut)))));

        rt().display.hires.clrrect(1, 11, 38, 4);

        if (g.inchar === chr(CRETURN)) {
          exit('BUTTONS');
        }

        if (mazelevel.argument0[sqtype] > 0) {
          g.mazex = rt().random.modulo(MAZE_SIZE);
          g.mazey = rt().random.modulo(MAZE_SIZE);
        }

        exitrun(minbut + ord(g.inchar) - ord('A'));
      });
    }

    rt().display.hires.clrrect(1, 11, 38, 4);
    rt().display.mvcursor(1, 11);
    sqtype = mazelevel.squareTag[g.mazex][g.mazey];
    g.fizzles = 0;
    needdrmz = true;

    switch (mazelevel.squareKind[sqtype]) {
      case SquareKind.fizzle:
        g.fizzles = 1;
        break;

      case SquareKind.rockWater:
        g.mazelev = -99;
        g.xgoto = Xgoto.xnewmaze;
        exit('RUNNER');
        break;

      case SquareKind.buttons:
        await buttons();
        break;

      case SquareKind.stairs:
        if (initturn) {
          await stairsyn();
        }

        break;

      case SquareKind.pit:
        if (initturn) {
          await apit();
        }

        break;

      case SquareKind.ouch:
        await ouch();
        break;

      case SquareKind.chute:
        achute();
        break;

      case SquareKind.spinner:
        if (initturn) {
          spindir();
        }

        break;

      case SquareKind.transfer:
        quietxfr();
        break;

      case SquareKind.dark:
        verydark();
        break;

      case SquareKind.message:
        doscnmsg();
        break;

      case SquareKind.encounter:
        await chencoun();
        break;

      default:
        break;
    }
  }

  function movefrwd(): void {
    needdrmz = true;
    initturn = true;
    g.savex = g.mazex;
    g.savey = g.mazey;
    g.savelev = g.mazelev;

    switch (g.directio) {
      case Direction.north: g.mazey = g.mazey + 1; break;
      case Direction.east:  g.mazex = g.mazex + 1; break;
      case Direction.south: g.mazey = g.mazey - 1; break;
      case Direction.west:  g.mazex = g.mazex - 1; break;
      default: break;
    }

    g.mazey = (g.mazey + MAZE_SIZE) % MAZE_SIZE;
    g.mazex = (g.mazex + MAZE_SIZE) % MAZE_SIZE;
  }

  function bumpwall(): void {
    rt().display.hires.clrrect(4, 3, 5, 1);
    rt().display.mvcursor(4, 3);
    printstr('OUCH!');
    write(chr(7));
  }

  function wallahead(): Wall {
    switch (g.directio) {
      case Direction.north: return mazelevel.northWalls[g.mazex][g.mazey];
      case Direction.east:  return mazelevel.eastWalls[g.mazex][g.mazey];
      case Direction.south: return mazelevel.southWalls[g.mazex][g.mazey];
      default:              return mazelevel.westWalls[g.mazex][g.mazey];
    }
  }

  function forwrd(): void {
    if (wallahead() === Wall.open) {
      movefrwd();
    }

    if (!initturn) {
      bumpwall();
    }
  }

  /** KICK. A door is not a wall, so kicking gets through one - and wakes what is behind it. */
  function kick(): void {
    if (wallahead() !== Wall.wall) {
      movefrwd();
    }

    if (!initturn) {
      bumpwall();
    }
  }

  function doturn(leftrigh: number): void {
    needdrmz = true;
    g.directio = ((g.directio + leftrigh) % 4) as Direction;
  }

  /** SETTIME. T) changes TIMEDLAY, which is how long each message in a fight is left on the screen. */
  async function settime(): Promise<void> {
    await withExit('SETTIME', async (): Promise<void> => {
      function exittime(): void {
        rt().display.hires.clrrect(1, 13, 38, 1);
        exit('SETTIME');
      }

      rt().display.mvcursor(1, 13);
      printstr('NEW DELAY (1-5000) >');

      const timestr: string = await getstr(21, 13);
      let timeval: number = 0;

      if (timestr.length > 4) {
        exittime();
      }

      for (g.llbase04 = 1; g.llbase04 <= timestr.length; g.llbase04++) {
        const digit: string = timestr[g.llbase04 - 1];

        if ((digit >= '0') && (digit <= '9')) {
          timeval = (10 * timeval) + ord(digit) - ord('0');
        } else {
          exittime();
        }
      }

      if ((timeval > 0) && (timeval <= 5000)) {
        g.timedlay = timeval;
      }

      exittime();
    });
  }

  function quikplot(): void {
    rt().display.mvcursor(1, 13);
    printstr('QUICK PLOT ');
    quickplt = !quickplt;
    printstr(quickplt ? 'ON' : 'OFF');
    draw();
    rt().display.hires.clrrect(1, 13, 38, 1);
  }

  function runinit(): void {
    rt().display.hires.clrrect(13, 1, 26, 4);
    rt().display.hires.clrrect(13, 6, 26, 4);
    rt().display.mvcursor(13, 1);
    printstr('F)ORWARD  C)AMP    S)TATUS');
    rt().display.mvcursor(13, 2);
    printstr('L)EFT     Q)UICK   A<-W->D');
    rt().display.mvcursor(13, 3);
    printstr('R)IGHT    T)IME    CLUSTER');
    rt().display.mvcursor(13, 4);
    printstr('K)ICK     I)NSPECT');
    rt().display.mvcursor(13, 7);
    printstr('SPELLS :');
    graphics();
    prstats();
    needdrmz = true;
    initturn = true;
  }

  runinit();

  for (;;) {
    rt().display.mvcursor(22, 7);
    printstr((g.light > 0) ? 'LIGHT' : '     ');
    rt().display.mvcursor(22, 8);
    printstr((g.acmod2 > 0) ? 'PROTECT' : '       ');

    if (needdrmz) {
      draw();
    }

    if (mazelevel.squareKind[mazelevel.squareTag[g.mazex][g.mazey]] !== SquareKind.normal) {
      if (g.xgoto2 !== Xgoto.xscnmsg) {
        if (initturn) {
          await specsqar();
        }
      }
    }

    if (g.xgoto2 !== Xgoto.xscnmsg) {
      if (initturn) {
        rt().display.hires.clrrect(1, 11, 38, 4);
      }
    }

    g.xgoto2 = Xgoto.xrunner;
    needdrmz = false;

    // UCSD Pascal evaluates every operand, so both of these draws happen on every single step
    // whatever the answer turns out to be. AND binds tighter than OR, so this is
    // (wandering OR alarmed OR walked-here) OR ((first step AND kicked AND a fight waits) AND one
    // in eight).
    const wandering: boolean = (random() % 99) === 35;
    const alarmed: boolean = g.chstalrm === 1;
    const walkedhere: boolean = g.fightmap[g.mazex][g.mazey];
    const kickedin: boolean = initturn && (g.inchar === chr(KICK_KEY))
        && (mazelevel.fights[g.mazex][g.mazey] === 1);
    const unlucky: boolean = (random() % 8) === 3;

    if (wandering || alarmed || walkedhere || (kickedin && unlucky)) {
      encountr();
    }

    if (initturn) {
      await updatehp();
    }

    initturn = false;

    await getkey();

    switch (g.inchar) {
      case 'F': case 'W': forwrd(); break;
      case 'A': case 'L': doturn(3); break;
      case 'D': case 'R': doturn(1); break;
      case 'K': kick(); break;
      case 'S': prstats(); break;
      case 'T': await settime(); break;
      case 'Q': quikplot(); break;

      case 'C':
        g.xgoto = Xgoto.xinspct2;
        write(chr(12));
        exit('RUNNER');
        break;

      case 'I':
        g.xgoto = Xgoto.xinsarea;
        write(chr(12));
        exit('RUNNER');
        break;

      default:
        break;
    }
  }
}


/**
 * ENCOUNTR. A wandering monster. Which one is rolled out of the level's own three bands: the first
 * band is the usual one and each further roll of a one in four moves up a band, and then within the
 * band a run of rolls against PERCWORS pushes the monster number along by MULTWORS each time. So a
 * level can hold anything from its own depth, and occasionally something from far deeper.
 *
 * ATTK012 says how the fight starts, which REWARDS uses to decide what is left behind: 2 where the
 * party walked into it or set an alarm off, 1 where they found a fixed encounter they had not been
 * through, and 0 otherwise. It never returns - the fight is a segment of its own.
 */
function encountr(): void {
  g.encb4run = true;
  rt().display.hires.clrrect(1, 11, 38, 4);
  rt().display.mvcursor(14, 12);
  printstr('AN ENCOUNTER');

  let enctype: number = 1;

  while (((random() % 4) === 2) && (enctype < 3)) {
    enctype = enctype + 1;
  }

  const band: IMaze['encounterTable'][number] = mazelevel.encounterTable[enctype - 1];
  let enccalc: number = 0;

  while (((random() % 100) < band.worsePercent) && (enccalc < band.worseStep)) {
    enccalc = enccalc + 1;
  }

  const enemyi: number = band.weakest + (random() % band.range) + (band.worseMultiplier * enccalc);

  if (g.chstalrm === 1) {
    g.attk012 = 2;
  } else if (mazelevel.fights[g.mazex][g.mazey] === 1) {
    if (g.fightmap[g.mazex][g.mazey]) {
      g.attk012 = 2;
    } else {
      g.attk012 = 1;
    }
  } else {
    g.attk012 = 0;
  }

  g.enemyinx = enemyi;
  g.xgoto = Xgoto.xcombat;
  exit('RUNNER');
}


/** SEGMENT PROCEDURE RUNNER. */
export async function runner(): Promise<void> {
  await withExit('RUNNER', async (): Promise<void> => {
    quickplt = false;
    await readmaze();
    clroomfg(g.mazex, g.mazey);

    for (;;) {
      await runmain();
    }
  });
}


/** Puts the segment's own variables back, for a test that wants a known starting point. */
export function resetrunner(): void {
  quickplt = false;
  initturn = false;
  needdrmz = false;
}
