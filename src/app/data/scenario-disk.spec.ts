import { describe, expect, it } from 'vitest';

import type { IDriveActivity } from './block-cache-model';
import { NO_ACTIVITY } from './block-cache-model';
import { BLOCK_SIZE } from './dsk/dsk-image';
import { Zone, character } from './layout/wiz-types';
import { ScenarioDisk } from './scenario-disk';
import { SCENARIO_BLOCKS, SCENARIO_FIRST_BLOCK, buildScenarioDisk } from './scenario-fixture';

type Character = ReturnType<typeof character.read>;


function scenarioBytes(): Uint8Array {
  const disk: Uint8Array = buildScenarioDisk('A TEST SCENARIO');
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;

  return disk.slice(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE));
}


function aScenario(): ScenarioDisk {
  return new ScenarioDisk(scenarioBytes());
}


describe('clearing a record before writing a new one over it', (): void => {
  // A character built from nothing starts with FILLCHAR over the whole record, so the slot they
  // land in loses every trace of whoever was there before - the spare bits included.
  function slotWithEverythingSet(): ScenarioDisk {
    const scenario: ScenarioDisk = aScenario();
    const occupant: Character = scenario.read(Zone.character, 0, character);

    occupant.name = 'GANDALF';
    occupant.spellsKnown = occupant.spellsKnown.map((): number => 1);
    scenario.write(Zone.character, 0, character, occupant);

    return scenario;
  }

  it('leaves no spell behind for the next character to inherit', (): void => {
    const scenario: ScenarioDisk = slotWithEverythingSet();

    scenario.fillchar(Zone.character, 0, character);

    expect(scenario.read(Zone.character, 0, character).spellsKnown).not.toContain(1);
  });

  it('leaves no name behind', (): void => {
    const scenario: ScenarioDisk = slotWithEverythingSet();

    scenario.fillchar(Zone.character, 0, character);

    expect(scenario.read(Zone.character, 0, character).name).toBe('');
  });

  it('leaves the record after it alone', (): void => {
    const scenario: ScenarioDisk = slotWithEverythingSet();
    const neighbour: Character = scenario.read(Zone.character, 1, character);

    neighbour.name = 'FRODO';
    scenario.write(Zone.character, 1, character, neighbour);
    scenario.fillchar(Zone.character, 0, character);

    expect(scenario.read(Zone.character, 1, character).name).toBe('FRODO');
  });

  it('marks the disk as changed', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.fillchar(Zone.character, 0, character);

    expect(scenario.changed).toBe(true);
  });
});


describe('a record that lies outside the scenario', (): void => {
  // A store past the end of a typed array is quietly dropped, so a save would report success
  // having written nothing. The original wrote over whatever followed on the floppy; neither is
  // any good, but only one of them is silent.
  it('refuses to be written', (): void => {
    const scenario: ScenarioDisk = aScenario();
    const record: Character = scenario.read(Zone.character, 0, character);

    expect((): void => scenario.write(Zone.character, 9999, character, record)).toThrow(RangeError);
  });

  it('refuses to be read', (): void => {
    expect((): unknown => aScenario().read(Zone.character, 9999, character)).toThrow(RangeError);
  });

  it('says which record it was', (): void => {
    expect((): unknown => aScenario().read(Zone.character, 9999, character)).toThrow(/9999/);
  });
});


describe('reading a raw block', (): void => {
  it('hands back a copy, so writing to it is not writing to the disk', (): void => {
    const scenario: ScenarioDisk = aScenario();
    const before: string = scenario.read(Zone.toc, 0, character).name;

    scenario.readBlock(0).fill(0xFF);

    expect(scenario.read(Zone.toc, 0, character).name).toBe(before);
  });
});


describe('saying when a write has landed', (): void => {
  // The original's block cache held a dirty pair until something else needed the buffer, and the
  // game is dotted with reads it does not want, placed exactly where the write had to be on the
  // floppy first. INITGAME clears CACHEWRI without flushing, so a pair still dirty when the game
  // restarts is lost outright - which is why "eventually" is not good enough here either.
  function watched(): { scenario: ScenarioDisk; writes: number } {
    const scenario: ScenarioDisk = aScenario();
    const counter: { scenario: ScenarioDisk; writes: number } = { scenario, writes: 0 };

    scenario.onChanged = (): void => {
      counter.writes = counter.writes + 1;
    };

    return counter;
  }

  it('says so when a record is written', (): void => {
    const watcher: { scenario: ScenarioDisk; writes: number } = watched();

    watcher.scenario.write(Zone.character, 0, character,
                           watcher.scenario.read(Zone.character, 0, character));

    expect(watcher.writes).toBe(1);
  });

  it('says so when a record is cleared', (): void => {
    const watcher: { scenario: ScenarioDisk; writes: number } = watched();

    watcher.scenario.fillchar(Zone.character, 0, character);

    expect(watcher.writes).toBe(1);
  });

  it('says so every time, not just the first', (): void => {
    const watcher: { scenario: ScenarioDisk; writes: number } = watched();
    const who: Character = watcher.scenario.read(Zone.character, 0, character);

    watcher.scenario.write(Zone.character, 0, character, who);
    watcher.scenario.write(Zone.character, 1, character, who);

    expect(watcher.writes).toBe(2);
  });

  it('says nothing once nobody is listening', (): void => {
    const watcher: { scenario: ScenarioDisk; writes: number } = watched();

    watcher.scenario.onChanged = null;
    watcher.scenario.fillchar(Zone.character, 0, character);

    expect(watcher.writes).toBe(0);
  });

  it('still marks the disk as changed for whoever asks later', (): void => {
    const watcher: { scenario: ScenarioDisk; writes: number } = watched();

    watcher.scenario.onChanged = null;
    watcher.scenario.fillchar(Zone.character, 0, character);

    expect(watcher.scenario.changed).toBe(true);
  });

  it('reads without saying anything, there being nothing to save', (): void => {
    const watcher: { scenario: ScenarioDisk; writes: number } = watched();

    watcher.scenario.read(Zone.character, 0, character);

    expect(watcher.writes).toBe(0);
  });
});


describe('saying when the drive would have moved', (): void => {
  it('reads a record off the disk the first time its pair is wanted', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.read(Zone.character, 0, character);

    expect(scenario.lastActivity.read).toBe(true);
  });

  it('spins the drive up for that first read', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.read(Zone.character, 0, character);

    expect(scenario.lastActivity.spinUp).toBe(true);
  });

  it('moves nothing for the next record in the same pair', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.read(Zone.character, 0, character);
    scenario.read(Zone.character, 1, character);

    expect(scenario.lastActivity).toEqual(NO_ACTIVITY);
  });

  it('reads again for a record in the next pair', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.read(Zone.character, 0, character);
    scenario.read(Zone.character, 4, character);

    expect(scenario.lastActivity.read).toBe(true);
  });

  it('writes a dirty pair out when a read of another pair evicts it', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.write(Zone.character, 0, character, scenario.read(Zone.character, 0, character));
    scenario.read(Zone.character, 4, character);

    expect(scenario.lastActivity.wrote).toBe(true);
  });

  it('loses a dirty pair to a raw block read, which went past the cache without writing it', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.write(Zone.character, 0, character, scenario.read(Zone.character, 0, character));
    scenario.readBlock(1);

    expect(scenario.lastActivity.wrote).toBe(false);
  });

  it('records nothing of a read that was refused', (): void => {
    const scenario: ScenarioDisk = aScenario();

    scenario.read(Zone.character, 0, character);

    const before: IDriveActivity = scenario.lastActivity;

    expect((): void => { scenario.read(Zone.character, 100000, character); }).toThrow(RangeError);
    expect(scenario.lastActivity).toBe(before);
  });
});
