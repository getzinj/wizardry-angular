import { beforeEach, describe, expect, it } from 'vitest';

import type { ICharacter } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import { PICTURE_PATTERN } from '../data/scenario-fixture';
import { hiresRowOffset } from '../runtime/apple-hires.constants';
import { rt } from '../runtime/runtime';
import { HALITO, batreslt, battlerc, resetcombat } from './combat';
import { resetcastaspe } from './combat4';
import { combat } from './combat5';
import { boot, clock, flush, play, rosterOf, somebody } from './port-fixture';
import { resetrunner } from './runner2';
import { Talign, Tclass, Tspel012, Tstatus, Xgoto, g } from './wiz';
import { MILLISECONDS_PER_LOOP } from './wiz2';
import { segment } from './wizardry';

/** Rows of the screen a monster picture covers, and the ten bytes of each that it fills. */
const PICTURE_FIRST_ROW: number = 23;
const PICTURE_LAST_ROW: number = 72;
const PICTURE_BYTES_PER_ROW: number = 10;

/** Keys a test will hand over before giving up on the fight ever ending. */
const PATIENCE: number = 400;


/**
 * Somebody who can take a monster on: enough hit points to survive the rolls going against them,
 * and a weapon. Evil, so the friendly-group offer - which is made to parties with anyone good in
 * them - is out of the way.
 */
function brawler(name: string): ICharacter {
  const who: ICharacter = somebody(name, Talign.evil);

  who.characterClass = Tclass.fighter;
  who.level = 3;
  who.maximumLevel = 3;
  who.hitPoints = 50;
  who.maximumHitPoints = 50;
  who.swings = 1;
  who.damage = { diceCount: 1, diceSides: 6, bonus: 0 };

  return who;
}


/** A party on the first level of the maze, with something in front of them. */
function aFight(...party: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...party);

  boot(scenario, Xgoto.xcombat);
  resetcombat();
  resetcastaspe();
  resetrunner();

  g.partycnt = party.length;
  g.mazelev = 1;
  g.enemyinx = 0;

  party.forEach((who: ICharacter, index: number): void => {
    g.charactr[index] = who;
    g.chardisk[index] = index;
  });

  return scenario;
}


/**
 * Fights, answering every prompt from the same short script over and over. A round asks each of the
 * party what they are doing and then asks for a return to set them going, so the script is what one
 * round needs; how many rounds it takes is up to the dice.
 */
async function fight(script: readonly string[]): Promise<void> {
  let finished: boolean = false;
  let keys: number = 0;

  const running: Promise<void> = combat().finally((): void => {
    finished = true;
  });

  while (!finished) {
    await flush();

    if (!finished && rt().keyboard.waiting) {
      if (keys >= PATIENCE) {
        throw new Error('the fight is not ending');
      }

      rt().keyboard.push(script[keys % script.length]);
      keys = keys + 1;
    }
  }

  await running;
}


/** How many of the waits the fight asked for were a full PAUSE1, which is how long a blow is held. */
function blowsHeld(): number {
  return clock().requested
      .filter((milliseconds: number): boolean => milliseconds === (g.timedlay + 1) * MILLISECONDS_PER_LOOP)
      .length;
}


function pictureInk(): number {
  const screen: Uint8Array = rt().display.hires.bytes;
  let ink: number = 0;

  for (let row: number = PICTURE_FIRST_ROW; row <= PICTURE_LAST_ROW; row++) {
    const base: number = hiresRowOffset(row);

    for (let byte: number = 1; byte <= PICTURE_BYTES_PER_ROW; byte++) {
      if (screen[base + byte] === PICTURE_PATTERN) {
        ink = ink + 1;
      }
    }
  }

  return ink;
}


describe('a fight fought to the end', (): void => {
  beforeEach(async (): Promise<void> => {
    aFight(brawler('CONAN'));
    await fight([ 'F', '\r' ]);
  });

  it('leaves nothing standing in the first group', (): void => {
    expect(battlerc[1].a.alivecnt).toBe(0);
  });

  it('sends the party on to the rewards', (): void => {
    expect(g.xgoto).toBe(Xgoto.xreward);
  });

  it('says which monster was fought, for the experience', (): void => {
    expect(batreslt.enmyid[1]).toBe(0);
  });

  it('says how many of them there were, for the experience', (): void => {
    expect(batreslt.enmycnt[1]).toBe(1);
  });

  it('writes the hit points the fight left them with back to the character', (): void => {
    expect(g.charactr[0].hitPoints).toBe(battlerc[0].a.temp04[0].hpleft);
  });

  it('shows the monster, by copying its picture into the view', (): void => {
    expect(pictureInk()).toBe((1 + PICTURE_LAST_ROW - PICTURE_FIRST_ROW) * PICTURE_BYTES_PER_ROW);
  });

  // Not an exact count: GETKEY stirs the random number by how long the player took, so a fight
  // takes a different number of blows every run. What is fixed is that MELEE is the only thing
  // pausing in a fight this plain, so taking its pause out takes this to zero.
  it('holds each blow on the screen for a loop of TIMEDLAY passes', (): void => {
    expect(blowsHeld()).toBeGreaterThan(0);
  });
});


describe('a fight with a corpse in the party', (): void => {
  beforeEach(async (): Promise<void> => {
    const dead: ICharacter = brawler('BORIS');

    dead.status = Tstatus.dead;
    dead.hitPoints = 0;

    aFight(dead, brawler('CONAN'));
    await fight([ 'F', '\r' ]);
  });

  it('moves the dead to the back, so the monsters reach the living first', (): void => {
    expect(g.charactr[0].name).toBe('CONAN');
  });

  it('keeps which roster slot each of them came from with them', (): void => {
    expect(g.chardisk[0]).toBe(1);
  });

  it('counts only the living as being in the fight', (): void => {
    expect(battlerc[0].a.alivecnt).toBe(1);
  });
});


describe('running away', (): void => {
  beforeEach(async (): Promise<void> => {
    aFight(brawler('CONAN'));
    await fight([ 'R' ]);
  });

  it('goes to the rewards by the other door, which pays nothing', (): void => {
    expect(g.xgoto).toBe(Xgoto.xreward2);
  });

  it('leaves no monsters behind to be paid for', (): void => {
    expect(batreslt.enmycnt[1]).toBe(0);
  });
});


describe('casting a spell by name', (): void => {
  // The scenario disk holds each spell's name already reduced to a number, and what it is aimed at.
  // Nothing in the game holds the names themselves: what is typed is reduced the same way and the
  // two numbers are compared, so a spell is known to the game only by arithmetic.
  const SLOT: number = 5;

  beforeEach(async (): Promise<void> => {
    const mage: ICharacter = brawler('GANDALF');

    mage.spellsKnown[SLOT] = 1;
    mage.mageSpellSlots[0] = 1;

    aFight(mage);
    g.scntoc.spellHash[SLOT] = HALITO;
    g.scntoc.spellGroup[SLOT] = 1;
    g.scntoc.spellTarget[SLOT] = Tspel012.group;

    await fight([ 'S', 'H', 'A', 'L', 'I', 'T', 'O', '\r', '\r' ]);
  });

  it('finds the spell that was typed and spends a slot of its group', (): void => {
    expect(g.charactr[0].mageSpellSlots[0]).toBe(0);
  });

  it('burns the monster the spell was aimed at', (): void => {
    expect(battlerc[1].a.temp04[0].status).toBe(Tstatus.dead);
  });

  it('ends the fight, since nothing is left', (): void => {
    expect(g.xgoto).toBe(Xgoto.xreward);
  });
});


describe('a wandering monster in the maze', (): void => {
  /** Walks into the maze and takes one step with the alarm from a chest still ringing. */
  async function alarmed(): Promise<void> {
    const who: ICharacter = brawler('CONAN');

    who.inMaze = true;

    const scenario: ScenarioDisk = rosterOf(who);

    boot(scenario, Xgoto.xedgtown);
    g.partycnt = 1;
    g.charactr[0] = who;
    g.chardisk[0] = 0;
    resetrunner();
    resetcombat();

    // The Edge of Town, the maze being built, the party being equipped, the camp, and the equipping
    // on the way out of it: five segments before RUNNER has the party standing in the maze.
    await play(segment, [ 'M' ]);
    await play(segment, []);
    await play(segment, []);
    await play(segment, [ 'L' ]);
    await play(segment, []);

    g.chstalrm = 1;
    await play(segment, []);
  }

  beforeEach(async (): Promise<void> => {
    await alarmed();
  });

  it('hands the party over to the fight', (): void => {
    expect(g.xgoto).toBe(Xgoto.xcombat);
  });

  it('picks a monster off the level it is on', (): void => {
    expect(g.enemyinx).toBe(0);
  });

  it('says the party walked into it, so nothing is left behind afterwards', (): void => {
    expect(g.attk012).toBe(2);
  });

  it('marks the fight as one they could not avoid', (): void => {
    expect(g.encb4run).toBe(true);
  });
});
