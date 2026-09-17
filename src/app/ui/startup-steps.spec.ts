import { describe, expect, it } from 'vitest';

import type { IStartupProgress } from './startup-steps';
import { StartupStep, currentStep } from './startup-steps';


function progress(overrides: Partial<IStartupProgress> = {}): IStartupProgress {
  return { hasMaster: true, diskCount: 1, everPlayed: true, ...overrides };
}


describe('currentStep', (): void => {
  it('asks for a scenario disk when nothing has been imported', (): void => {
    expect(currentStep(progress({ hasMaster: false, diskCount: 0, everPlayed: false })))
      .toBe(StartupStep.scenarioDisk);
  });

  it('still asks for a scenario disk when a save disk survives a forgotten master', (): void => {
    // Save disks are whole copies and belong to no master, so this pair really can happen.
    expect(currentStep(progress({ hasMaster: false }))).toBe(StartupStep.scenarioDisk);
  });

  it('asks for a character disk once the master is in hand', (): void => {
    expect(currentStep(progress({ diskCount: 0, everPlayed: false }))).toBe(StartupStep.characterDisk);
  });

  it('asks them to play when a disk has been made but never used', (): void => {
    expect(currentStep(progress({ everPlayed: false }))).toBe(StartupStep.play);
  });

  it('has nothing left to say once they have played', (): void => {
    expect(currentStep(progress())).toBe(StartupStep.done);
  });
});
