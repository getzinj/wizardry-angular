import type { ScenarioDisk } from '../data/scenario-disk';
import type { IClock } from './clock';
import { Clock } from './clock';
import { Display } from './display';
import { Keyboard } from './keyboard';
import { Random } from './random';

// The machine the ported game runs on.
//
// The original's globals were global, and reaching them through one object rather than through a
// chain of parameters is what lets each ported procedure keep the shape it had. This holds the
// hardware; port/wiz.ts holds the program's own variables.

export interface IRuntime {
  readonly display: Display;
  readonly keyboard: Keyboard;
  readonly random: Random;
  readonly clock: IClock;

  /** The scenario disk in drive 1, which the game both reads and writes. */
  disk: ScenarioDisk | null;
}


export function createRuntime(disk: ScenarioDisk | null = null,
                              seed?: number,
                              display: Display = new Display(),
                              clock: IClock = new Clock()): IRuntime {
  const random: Random = new Random(seed ?? 1);

  return {
    display,
    keyboard: new Keyboard(random),
    random,
    clock,
    disk,
  };
}


let current: IRuntime | null = null;


export function setRuntime(runtime: IRuntime | null): void {
  current = runtime;
}


/** The running machine. Every ported procedure reaches its hardware through this. */
export function rt(): IRuntime {
  if (current == null) {
    throw new Error('no runtime: call setRuntime before running any ported code');
  } else {
    return current;
  }
}


/** The scenario disk, which the game assumes is in the drive by the time it reads a record. */
export function disk(): ScenarioDisk {
  const mounted: ScenarioDisk | null = rt().disk;

  if (mounted == null) {
    throw new Error('no scenario disk is mounted');
  } else {
    return mounted;
  }
}
