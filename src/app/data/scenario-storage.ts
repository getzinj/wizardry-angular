import type { IScenarioFiles } from './scenario-import';

// The master scenario: the disk the player imported, kept untouched.
//
// Save disks are copies of it (see save-disks.ts); this is the one they are copied from, which is
// why importing a disk and starting a game are separate steps.
//
// The game's data belongs to whoever owns the game, so it is never bundled with the app and never
// sent anywhere. Importing is a one-off: the files are kept locally so the player is not asked for
// the disk again on this machine, and clearing them asks for it afresh.

import { SCENARIO_STORE, runTransaction } from './local-database';

const RECORD_KEY: string = 'master';


/**
 * The scenario this browser has already been given, or null if none. Storage being unavailable,
 * as it is in a private window, is treated as having none rather than as an error: the player can
 * still import a disk and play, they will just be asked again next time.
 */
export async function loadStoredScenario(): Promise<IScenarioFiles | null> {
  try {
    return await runTransaction<IScenarioFiles | undefined>(SCENARIO_STORE, 'readonly',
      (store: IDBObjectStore): IDBRequest<IScenarioFiles | undefined> => store.get(RECORD_KEY)) ?? null;
  } catch {
    return null;
  }
}


/** Keeps the imported scenario for next time. Failing to is not worth interrupting the player for. */
export async function storeScenario(files: IScenarioFiles): Promise<void> {
  try {
    await runTransaction<IDBValidKey>(SCENARIO_STORE, 'readwrite',
      (store: IDBObjectStore): IDBRequest<IDBValidKey> => store.put(files, RECORD_KEY));
  } catch {
    // Playing without remembering the disk is better than refusing to play.
  }
}


export async function forgetScenario(): Promise<void> {
  try {
    await runTransaction<undefined>(SCENARIO_STORE, 'readwrite',
      (store: IDBObjectStore): IDBRequest<undefined> => store.delete(RECORD_KEY));
  } catch {
    // Nothing to do: the player can only have been asked to import again.
  }
}
