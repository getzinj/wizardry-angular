/**
 * Where a player has got to in the business of getting the game running.
 *
 * Wizardry shipped on two floppies and expected you to make a third. The boot disk started the
 * machine, the scenario disk held the game, and the manual told you to copy the scenario disk and
 * play on the copy, because your characters were written onto whichever disk was in the drive.
 * None of that is guessable from a file picker, so the steps are named on screen and this says
 * which one the player is on.
 */
export enum StartupStep {
  /** Nothing imported yet: the app has no scenario to copy. */
  scenarioDisk,

  /** A master is in hand, but there is no copy to play on. */
  characterDisk,

  /** There is a disk on the shelf that has never been in the drive. */
  play,

  /** They have played. Nothing left to explain. */
  done,
}


/** What the app knows about the player's progress, which is all the step depends on. */
export interface IStartupProgress {
  readonly hasMaster: boolean;
  readonly diskCount: number;
  readonly everPlayed: boolean;
}


export function currentStep(progress: IStartupProgress): StartupStep {
  if (!progress.hasMaster) {
    return StartupStep.scenarioDisk;
  } else if (progress.diskCount === 0) {
    return StartupStep.characterDisk;
  } else if (!progress.everPlayed) {
    return StartupStep.play;
  } else {
    return StartupStep.done;
  }
}
