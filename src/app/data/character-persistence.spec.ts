import { describe, expect, it } from 'vitest';

import { BLOCK_SIZE } from './dsk/dsk-image';
import { Zone, character } from './layout/wiz-types';
import { exportSaveDisk } from './save-disk-file';
import type { ISaveDisk, NewDiskResult } from './save-disks';
import { InMemorySaveDiskStore, SaveDiskLibrary } from './save-disks';
import { ScenarioDisk } from './scenario-disk';
import type { ScenarioImportResult } from './scenario-import';
import { importScenarioDisk } from './scenario-import';
import { SCENARIO_BLOCKS, SCENARIO_FIRST_BLOCK, buildScenarioDisk } from './scenario-fixture';

// The whole point of writing records: a character made in one sitting is still there in the next.
// These follow one along the real path - onto the disk in the drive, into storage, out to a file,
// and back in again - rather than testing each hop on its own.

type Character = ReturnType<typeof character.read>;


function masterScenario(): Uint8Array {
  const disk: Uint8Array = buildScenarioDisk('A TEST SCENARIO');
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;

  return disk.slice(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE));
}


async function aSaveDisk(): Promise<{ library: SaveDiskLibrary; disk: ISaveDisk }> {
  const library: SaveDiskLibrary = new SaveDiskLibrary(new InMemorySaveDiskStore());
  const result: NewDiskResult = await library.createFromScenario(masterScenario(), null, 'A TEST SCENARIO', 'DISK 1');

  if (result.ok) {
    return { library, disk: result.disk };
  } else {
    throw new Error(result.message);
  }
}


function withName(scenario: ScenarioDisk, index: number, name: string): Character {
  const before: Character = scenario.read(Zone.character, index, character);
  const edited: Character = { ...before, name, level: 4, hitPoints: 19, inMaze: true };

  scenario.write(Zone.character, index, character, edited);

  return edited;
}


describe('a character written to the disk in the drive', (): void => {
  it('reads back from that disk', async (): Promise<void> => {
    const { disk } = await aSaveDisk();
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);

    withName(scenario, 0, 'FRODO');

    expect(scenario.read(Zone.character, 0, character).name).toBe('FRODO');
  });

  it('marks the disk as worth saving', async (): Promise<void> => {
    const { disk } = await aSaveDisk();
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);

    withName(scenario, 0, 'FRODO');

    expect(scenario.changed).toBe(true);
  });

  it('is not marked as worth saving before anything is written', async (): Promise<void> => {
    const { disk } = await aSaveDisk();

    expect(new ScenarioDisk(disk.scenarioData).changed).toBe(false);
  });

  it('survives being put away and picked up again', async (): Promise<void> => {
    const { library, disk } = await aSaveDisk();
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);

    withName(scenario, 0, 'FRODO');
    await library.save(disk, scenario.contents);

    const reopened: ISaveDisk = (await library.read(disk.id)) as ISaveDisk;

    expect(new ScenarioDisk(reopened.scenarioData).read(Zone.character, 0, character).name).toBe('FRODO');
  });

  it('survives a trip out to a file and back', async (): Promise<void> => {
    const { library, disk } = await aSaveDisk();
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);

    withName(scenario, 0, 'SAMWISE');

    const saved: ISaveDisk = await library.save(disk, scenario.contents);
    const result: ScenarioImportResult = importScenarioDisk(exportSaveDisk(saved).bytes);

    expect(result.ok && new ScenarioDisk(result.files.scenarioData).read(Zone.character, 0, character).name)
      .toBe('SAMWISE');
  });

  it('keeps everything else about the character', async (): Promise<void> => {
    const { disk } = await aSaveDisk();
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);
    const written: Character = withName(scenario, 0, 'MERRY');

    expect(scenario.read(Zone.character, 0, character)).toEqual(written);
  });
});


describe('the roster', (): void => {
  it('keeps its characters apart', async (): Promise<void> => {
    const { disk } = await aSaveDisk();
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);

    withName(scenario, 0, 'FRODO');
    withName(scenario, 1, 'SAMWISE');

    expect(scenario.read(Zone.character, 0, character).name).toBe('FRODO');
  });

  it('does not disturb a neighbour when one is written', async (): Promise<void> => {
    const { disk } = await aSaveDisk();
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);

    withName(scenario, 1, 'SAMWISE');
    withName(scenario, 0, 'FRODO');

    expect(scenario.read(Zone.character, 1, character).name).toBe('SAMWISE');
  });

  it('leaves one save disk alone when another is written', async (): Promise<void> => {
    const { library, disk } = await aSaveDisk();
    const second: NewDiskResult = await library.createFromScenario(masterScenario(), null, 'A TEST SCENARIO', 'DISK 2');
    const scenario: ScenarioDisk = new ScenarioDisk(disk.scenarioData);

    withName(scenario, 0, 'FRODO');
    await library.save(disk, scenario.contents);

    expect(second.ok && new ScenarioDisk(second.disk.scenarioData).read(Zone.character, 0, character).name).toBe('');
  });
});
