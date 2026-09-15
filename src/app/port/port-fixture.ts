// What the segment tests need to stand a game up: a scenario disk with a roster on it, a runtime
// around it, and a way to hand keys over one at a time.
//
// Keys cannot always be queued in advance. UNITCLEAR( 1) at the top of the tavern's loop throws
// away everything typed ahead, so a test that queues its whole script loses the rest of it the
// moment the game reaches one. Handing each key over once the game is actually waiting for it is
// what a player does anyway.

import { BLOCK_SIZE } from '../data/dsk/dsk-image';
import { Zone, character, scenarioToc } from '../data/layout/wiz-types';
import type { ICharacter } from '../data/layout/wiz-types';
import { ScenarioDisk } from '../data/scenario-disk';
import { SCENARIO_BLOCKS, messageFileBytes, SCENARIO_FIRST_BLOCK, buildScenarioDisk } from '../data/scenario-fixture';
import type { IClock } from '../runtime/clock';
import { InstantClock } from '../runtime/clock';
import { createRuntime, rt, setRuntime } from '../runtime/runtime';
import type { Xgoto} from './wiz';
import { Direction, Talign, Tstatus, blankchar, g, resetglobals } from './wiz';

export const RETURN: string = '\r';
export const ESCAPE: string = '\x1B';

/** TIMEDLAY as INITGAME sets it. */
const STARTING_DELAY: number = 2000;


export function flush(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 0);
  });
}


function scenarioBytes(): Uint8Array {
  const image: Uint8Array = buildScenarioDisk('A TEST SCENARIO');
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;

  return image.slice(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE));
}


/** Somebody who could walk into the tavern: alive, level one, and with no password. */
export function somebody(name: string, alignment: Talign = Talign.good): ICharacter {
  const who: ICharacter = blankchar();

  who.name = name;
  who.password = '';
  who.status = Tstatus.ok;
  who.level = 1;
  who.alignment = alignment;
  who.hitPoints = 8;
  who.maximumHitPoints = 8;
  who.armourClass = 10;

  return who;
}


/** A disk whose roster holds these people, every slot after them marked LOST, which means free. */
export function rosterOf(...people: readonly ICharacter[]): ScenarioDisk {
  const scenario: ScenarioDisk = new ScenarioDisk(scenarioBytes(), messageFileBytes());

  for (let index: number = 0; index < scenario.recordCount(Zone.character); index++) {
    let slot: ICharacter;

    if (index < people.length) {
      slot = people[index];
    } else {
      slot = blankchar();
      slot.status = Tstatus.lost;
    }

    scenario.write(Zone.character, index, character, slot);
  }

  scenario.changed = false;

  return scenario;
}


/** Starts the machine on this disk as INITGAME leaves it, and puts the player where `xgoto` says. */
export function boot(scenario: ScenarioDisk, xgoto: Xgoto): void {
  setRuntime(createRuntime(scenario, 1, undefined, new InstantClock()));
  resetglobals();

  // The rest of what INITGAME sets, so a test starts where the game would rather than where a
  // fresh set of globals happens to leave it.
  g.timedlay = STARTING_DELAY;
  g.mazex = 0;
  g.mazey = 0;
  g.mazelev = 0;
  g.partycnt = 0;
  g.directio = Direction.north;
  g.acmod2 = 0;

  g.xgoto = xgoto;
  g.scntoc = scenario.read(Zone.toc, 0, scenarioToc);
}


/** The clock the booted machine waits on, which never does: what the game asked it for is on it. */
export function clock(): InstantClock {
  const waited: IClock = rt().clock;

  if (waited instanceof InstantClock) {
    return waited;
  } else {
    throw new Error('clock(): the machine was not started by boot()');
  }
}


/** Queues keys all at once, for a segment that never flushes the type-ahead buffer. */
export function press(keys: string): void {
  for (const key of keys) {
    rt().keyboard.push(key);
  }
}


/**
 * Starts a segment and waits until it is asking for a key, so the screen can be looked at while
 * it is still on. Hand the returned promise a key and await it to let the segment finish.
 */
export async function waitAtPrompt(segment: () => Promise<void>): Promise<{ running: Promise<void> }> {
  let finished: boolean = false;

  const running: Promise<void> = segment().finally((): void => {
    finished = true;
  });

  while (!finished && !rt().keyboard.waiting) {
    await flush();
  }

  return { running };
}


/**
 * Runs a segment, hands over `before`, and reads the screen while the next prompt is still
 * waiting, then hands over `then` and lets the segment finish.
 */
export async function screenAfter(segment: () => Promise<void>,
                                  before: readonly string[],
                                  then: readonly string[]): Promise<string> {
  let finished: boolean = false;

  const running: Promise<void> = segment().finally((): void => {
    finished = true;
  });

  for (const key of before) {
    while (!finished && !rt().keyboard.waiting) {
      await flush();
    }

    rt().keyboard.push(key);
  }

  while (!finished && !rt().keyboard.waiting) {
    await flush();
  }

  const screen: string = rt().display.text.toString();

  for (const key of then) {
    while (!finished && !rt().keyboard.waiting) {
      await flush();
    }

    if (!finished) {
      rt().keyboard.push(key);
    }
  }

  await running;

  return screen;
}


/** Runs a segment, handing over each key once the game is waiting for one. */
export async function play(segment: () => Promise<void>, keys: readonly string[]): Promise<void> {
  let finished: boolean = false;

  const running: Promise<void> = segment().finally((): void => {
    finished = true;
  });

  for (const key of keys) {
    while (!finished && !rt().keyboard.waiting) {
      await flush();
    }

    if (finished) {
      break;
    }

    rt().keyboard.push(key);
  }

  await running;
}
