import { beforeEach, describe, expect, it } from 'vitest';

import type { ICharacter, IMonster } from '../data/layout/wiz-types';
import { Zone, monster } from '../data/layout/wiz-types';
import type { ScenarioDisk } from '../data/scenario-disk';
import {
  CHEST_PATTERN, ITEM_REWARD, PICTURE_PATTERN, UNIQUE_MONSTER, UNIQUE_REMAINING,
} from '../data/scenario-fixture';
import { hiresRowOffset } from '../runtime/apple-hires.constants';
import { rt } from '../runtime/runtime';
import { batreslt, resetcombat } from './combat';
import { boot, flush, play, rosterOf, somebody, waitAtPrompt } from './port-fixture';
import { resetrewards } from './rewards';
import { rewards } from './rewards2';
import { resetrunner } from './runner2';
import { Talign, Tattrib, Tstatus, Xgoto, g } from './wiz';
import { segment } from './wizardry';
import { testlong } from './wiz2';
import type { ITwizlong } from './wiz';

/** Keys a test will hand over before giving up on the rewards ever being handed out. */
const PATIENCE: number = 200;

/** Which reward record each made-up reward is: see stockTheRewards. */
const GOLD_ONLY: number = 0;
const TRAPLESS_CHEST: number = 1;
const NEEDLED_CHEST: number = 2;
const ALARMED_CHEST: number = 3;


function somebodyWhoLived(name: string): ICharacter {
  const who: ICharacter = somebody(name, Talign.evil);

  who.level = 3;
  who.maximumLevel = 3;
  who.hitPoints = 50;
  who.maximumHitPoints = 50;
  who.attributes[Tattrib.agility] = 18;

  return who;
}


/**
 * A party standing over a monster they have just killed, with the battle result COMBAT would have
 * left behind. Which reward is paid out is the monster's REWARD1 or REWARD2, and which of those is
 * read depends on how the fight started.
 */
function afterAFight(theReward: number, ...party: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = rosterOf(...party);

  boot(scenario, Xgoto.xreward);
  resetcombat();
  resetrewards();
  resetrunner();

  g.partycnt = party.length;
  g.mazelev = 1;
  g.enemyinx = 0;
  g.attk012 = 0;

  // RUNMAIN leaves this set every turn, and it is where the party come back to.
  g.xgoto2 = Xgoto.xrunner;

  party.forEach((who: ICharacter, index: number): void => {
    g.charactr[index] = who;
    g.chardisk[index] = index;
  });

  const slain: IMonster = scenario.read(Zone.monster, 0, monster);

  slain.reward1 = theReward;
  slain.reward2 = theReward;
  scenario.write(Zone.monster, 0, monster, slain);

  batreslt.enmyid[1] = 0;
  batreslt.enmycnt[1] = 1;
  batreslt.enmyid[2] = -1;
  batreslt.enmyid[3] = -1;
  batreslt.enmyid[4] = -1;
  batreslt.drained.fill(false);

  return scenario;
}


/** Runs something, answering every prompt from the same short script over and over. */
async function drive(run: () => Promise<void>, script: readonly string[]): Promise<void> {
  let finished: boolean = false;
  let keys: number = 0;

  const running: Promise<void> = run().finally((): void => {
    finished = true;
  });

  while (!finished) {
    await flush();

    if (!finished && rt().keyboard.waiting) {
      if (keys >= PATIENCE) {
        throw new Error('this is never finishing');
      }

      rt().keyboard.push(script[keys % script.length]);
      keys = keys + 1;
    }
  }

  await running;
}


/** Collects the rewards, answering every prompt from the same short script over and over. */
function collect(script: readonly string[]): Promise<void> {
  return drive(rewards, script);
}


function isZero(amount: ITwizlong): boolean {
  return (amount.low === 0) && (amount.mid === 0) && (amount.high === 0);
}


/** Bytes of the picture window holding one of the made-up disk's picture patterns. */
function patternInk(pattern: number): number {
  const screen: Uint8Array = rt().display.hires.bytes;
  let ink: number = 0;

  for (let row: number = 23; row <= 72; row++) {
    const base: number = hiresRowOffset(row);

    for (let byte: number = 1; byte <= 10; byte++) {
      if (screen[base + byte] === pattern) {
        ink = ink + 1;
      }
    }
  }

  return ink;
}


describe('winning a fight that left no chest', (): void => {
  beforeEach(async (): Promise<void> => {
    afterAFight(GOLD_ONLY, somebodyWhoLived('CONAN'));
    await collect([ '\r' ]);
  });

  it('pays the survivor their share of the gold', (): void => {
    expect(isZero(g.charactr[0].gold)).toBe(false);
  });

  it('pays the survivor the experience for what was killed', (): void => {
    expect(isZero(g.charactr[0].experience)).toBe(false);
  });

  it('sends the party back into the maze', (): void => {
    expect(g.xgoto).toBe(Xgoto.xrunner);
  });

});


describe('killing one of the monsters there are only so many of', (): void => {
  let scenario: ScenarioDisk;

  beforeEach(async (): Promise<void> => {
    scenario = afterAFight(GOLD_ONLY, somebodyWhoLived('CONAN'));
    g.enemyinx = UNIQUE_MONSTER;
    batreslt.enmyid[1] = UNIQUE_MONSTER;
    await collect([ '\r' ]);
  });

  it('counts it down on the disk, so the next fight finds one fewer', (): void => {
    expect(scenario.read(Zone.monster, UNIQUE_MONSTER, monster).unique)
      .toBe(UNIQUE_REMAINING - 1);
  });

  it('leaves the ones there is no end of alone', (): void => {
    expect(scenario.read(Zone.monster, 0, monster).unique).toBe(-1);
  });
});


describe('the experience for a fight', (): void => {
  it('is shared out, so two survivors each get half of what one would', async (): Promise<void> => {
    afterAFight(GOLD_ONLY, somebodyWhoLived('CONAN'));
    await collect([ '\r' ]);

    const alone: ITwizlong = { ...g.charactr[0].experience };

    afterAFight(GOLD_ONLY, somebodyWhoLived('CONAN'), somebodyWhoLived('BORIS'));
    await collect([ '\r' ]);

    expect(testlong(g.charactr[0].experience, alone)).toBe(-1);
  });
});


describe('a chest with nothing on it', (): void => {
  beforeEach(async (): Promise<void> => {
    afterAFight(TRAPLESS_CHEST, somebodyWhoLived('CONAN'));
    await collect([ 'O', '1' ]);
  });

  it('opens to whoever was named and pays out', (): void => {
    expect(isZero(g.charactr[0].gold)).toBe(false);
  });

  it('leaves nobody any the worse for it', (): void => {
    expect(g.charactr[0].lostLocation[0]).toBe(0);
  });

  it('puts the treasure on the screen once the chest is dealt with', (): void => {
    expect(patternInk(PICTURE_PATTERN)).toBeGreaterThan(0);
  });
});


describe('the chest itself', (): void => {
  it('is on the screen while the party are being asked what to do with it',
     async (): Promise<void> => {
       afterAFight(TRAPLESS_CHEST, somebodyWhoLived('CONAN'));

       const { running }: { running: Promise<void> } = await waitAtPrompt(rewards);
       const chest: number = patternInk(CHEST_PATTERN);

       rt().keyboard.push('L');
       await running;

       expect(chest).toBeGreaterThan(0);
     });
});


describe('leaving a chest alone', (): void => {
  beforeEach(async (): Promise<void> => {
    afterAFight(TRAPLESS_CHEST, somebodyWhoLived('CONAN'));
    await collect([ 'L' ]);
  });

  it('pays nothing, since the gold was inside it', (): void => {
    expect(isZero(g.charactr[0].gold)).toBe(true);
  });

  it('still pays the experience, which was settled before the chest', (): void => {
    expect(isZero(g.charactr[0].experience)).toBe(false);
  });

  it('still sends the party back into the maze', (): void => {
    expect(g.xgoto).toBe(Xgoto.xrunner);
  });
});


describe('opening a chest with a poison needle on it', (): void => {
  beforeEach(async (): Promise<void> => {
    afterAFight(NEEDLED_CHEST, somebodyWhoLived('CONAN'));

    // Ten levels down, the roll that decides whether a chest is trapped at all cannot come out
    // above it, so the needle is always there.
    g.mazelev = 10;
    await collect([ 'O', '1' ]);
  });

  it('poisons whoever opened it', (): void => {
    expect(g.charactr[0].lostLocation[0]).toBe(1);
  });

  it('still pays out, since a sprung trap is the end of the chest rather than the rewards',
     (): void => {
       expect(isZero(g.charactr[0].gold)).toBe(false);
     });
});


describe('setting off the alarm on a chest', (): void => {
  beforeEach(async (): Promise<void> => {
    afterAFight(ALARMED_CHEST, somebodyWhoLived('CONAN'));
    g.mazelev = 10;
    await collect([ 'O', '1' ]);
  });

  it('leaves the alarm ringing, so something finds the party where they stand', (): void => {
    expect(g.chstalrm).toBe(1);
  });

  it('pays nothing: the alarm abandons the rest of the rewards', (): void => {
    expect(isZero(g.charactr[0].gold)).toBe(true);
  });
});


describe('running away from a fight', (): void => {
  beforeEach(async (): Promise<void> => {
    afterAFight(GOLD_ONLY, somebodyWhoLived('CONAN'));
    g.xgoto = Xgoto.xreward2;
    g.chstalrm = 1;
    await collect([ '\r' ]);
  });

  it('pays no gold, since nothing was won', (): void => {
    expect(isZero(g.charactr[0].gold)).toBe(true);
  });

  it('pays no experience either', (): void => {
    expect(isZero(g.charactr[0].experience)).toBe(true);
  });

  it('leaves a chest alarm ringing, which only the other way out puts off', (): void => {
    expect(g.chstalrm).toBe(1);
  });

  it('goes by way of a scenario message', (): void => {
    expect(g.xgoto).toBe(Xgoto.xscnmsg);
  });
});


describe('a character a monster drained a level from', (): void => {
  beforeEach(async (): Promise<void> => {
    const drained: ICharacter = somebodyWhoLived('CONAN');

    // Combat took the level off already; what REWARDS does is take the experience with it.
    drained.experience.low = 9000;
    afterAFight(GOLD_ONLY, drained);
    batreslt.drained[0] = true;
    await collect([ '\r' ]);
  });

  it('is put back to what the level below them is worth', (): void => {
    // The made-up table charges a thousand a level, so a level-three character drops to two
    // thousand, plus the one point the original adds and whatever the fight paid.
    expect(g.charactr[0].experience.low).toBeGreaterThan(2000);
  });

  it('loses the experience they had beyond it', (): void => {
    expect(g.charactr[0].experience.low).toBeLessThan(9000);
  });
});


describe('a party that did not survive the fight', (): void => {
  beforeEach(async (): Promise<void> => {
    const corpse: ICharacter = somebodyWhoLived('CONAN');

    corpse.status = Tstatus.dead;
    corpse.hitPoints = 0;
    afterAFight(GOLD_ONLY, corpse);
    await collect([ '\r' ]);
  });

  it('is taken to the cemetery rather than paid', (): void => {
    expect(g.xgoto).toBe(Xgoto.xcemetry);
  });
});


describe('a reward that is an item rather than gold', (): void => {
  beforeEach(async (): Promise<void> => {
    afterAFight(ITEM_REWARD, somebodyWhoLived('CONAN'));
    await collect([ '\r' ]);
  });

  it('puts the item in the finder\'s hands', (): void => {
    expect(g.charactr[0].possessions.count).toBe(1);
  });

  it('leaves it unidentified, so what it is has to be found out', (): void => {
    expect(g.charactr[0].possessions.items[0].identified).toBe(false);
  });
});


describe('the trampoline', (): void => {
  it('hands a won fight to the rewards', async (): Promise<void> => {
    afterAFight(GOLD_ONLY, somebodyWhoLived('CONAN'));
    await play(segment, [ '\r' ]);

    expect(isZero(g.charactr[0].gold)).toBe(false);
  });
});


describe('a fight in the maze, from the first step to the last', (): void => {
  it('walks out, is set upon, fights, is paid, and ends up back in the maze',
     async (): Promise<void> => {
       const who: ICharacter = somebodyWhoLived('CONAN');

       who.inMaze = true;
       who.swings = 1;
       who.damage = { diceCount: 1, diceSides: 6, bonus: 0 };

       const scenario: ScenarioDisk = rosterOf(who);

       boot(scenario, Xgoto.xedgtown);
       resetcombat();
       resetrewards();
       resetrunner();
       g.partycnt = 1;
       g.charactr[0] = who;
       g.chardisk[0] = 0;

       const slain: IMonster = scenario.read(Zone.monster, 0, monster);

       slain.reward1 = GOLD_ONLY;
       slain.reward2 = GOLD_ONLY;
       scenario.write(Zone.monster, 0, monster, slain);

       // The Edge of Town, the maze being built, the equipping, the camp, and the equipping on the
       // way out of it, and then the maze itself with a chest's alarm still ringing.
       await play(segment, [ 'M' ]);
       await play(segment, []);
       await play(segment, []);
       await play(segment, [ 'L' ]);
       await play(segment, []);
       g.chstalrm = 1;
       await play(segment, []);

       expect(g.xgoto).toBe(Xgoto.xcombat);

       await drive(segment, [ 'F', '\r' ]);

       expect(g.xgoto).toBe(Xgoto.xreward);

       await drive(segment, [ '\r' ]);

       expect([ g.xgoto, g.chstalrm, isZero(g.charactr[0].gold) ])
         .toEqual([ Xgoto.xrunner, 0, false ]);
     });
});
