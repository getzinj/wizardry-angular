import { describe, expect, it } from 'vitest';

import { BLOCK_SIZE, DiskImage } from './dsk/dsk-image';
import { buildDiskImage, toVolumeName } from './dsk/dsk-writer';
import { findFile, readDirectory } from './dsk/ucsd-directory';
import type { IVolumeDirectory } from './dsk/ucsd-directory';
import type { IExportedDisk } from './save-disk-file';
import { exportSaveDisk } from './save-disk-file';
import type { ISaveDisk } from './save-disks';
import type { ScenarioImportResult } from './scenario-import';
import { importScenarioDisk } from './scenario-import';
import { MESSAGE_BLOCKS, SCENARIO_BLOCKS, SCENARIO_FIRST_BLOCK, buildScenarioDisk } from './scenario-fixture';


/** The scenario out of a made-up disk, as the importer would have lifted it. */
function scenarioBytes(): Uint8Array {
  const disk: Uint8Array = buildScenarioDisk('A TEST SCENARIO');
  const start: number = SCENARIO_FIRST_BLOCK * BLOCK_SIZE;

  return disk.slice(start, start + (SCENARIO_BLOCKS * BLOCK_SIZE));
}


function aSaveDisk(name: string = 'DISK 1', withMessages: boolean = true): ISaveDisk {
  const messages: Uint8Array = new Uint8Array(MESSAGE_BLOCKS * BLOCK_SIZE).fill(0xAB);

  return {
    id: 'test',
    name,
    gameName: 'A TEST SCENARIO',
    createdAt: 1,
    playedAt: 2,
    scenarioData: scenarioBytes(),
    scenarioMessages: withMessages ? messages : null,
  };
}


describe('buildDiskImage', (): void => {
  it('writes a disk this app can read back', (): void => {
    const image: Uint8Array = buildDiskImage('WSTEST', [{ name: 'SCENARIO.DATA', bytes: scenarioBytes() }]);

    expect(readDirectory(DiskImage.withOrder(image, 'dos'))).not.toBeNull();
  });

  it('names the volume it was given', (): void => {
    const image: Uint8Array = buildDiskImage('WSTEST', [{ name: 'SCENARIO.DATA', bytes: scenarioBytes() }]);
    const directory: IVolumeDirectory = readDirectory(DiskImage.withOrder(image, 'dos')) as IVolumeDirectory;

    expect(directory.volumeName).toBe('WSTEST');
  });

  it('gives back the bytes it was given, unchanged', (): void => {
    const scenario: Uint8Array = scenarioBytes();
    const image: Uint8Array = buildDiskImage('WSTEST', [{ name: 'SCENARIO.DATA', bytes: scenario }]);
    const disk: DiskImage = DiskImage.withOrder(image, 'dos');
    const directory: IVolumeDirectory = readDirectory(disk) as IVolumeDirectory;
    const entry = findFile(directory, 'SCENARIO.DATA')!;

    expect([...disk.readBlocks(entry.firstBlock, entry.blockCount)]).toEqual([...scenario]);
  });

  it('lays a second file after the first rather than over it', (): void => {
    const image: Uint8Array = buildDiskImage('WSTEST', [
      { name: 'SCENARIO.DATA', bytes: scenarioBytes() },
      { name: 'SCENARIO.MESGS', bytes: new Uint8Array(BLOCK_SIZE).fill(7) },
    ]);
    const directory: IVolumeDirectory = readDirectory(DiskImage.withOrder(image, 'dos')) as IVolumeDirectory;

    expect(findFile(directory, 'SCENARIO.MESGS')!.firstBlock)
      .toBe(findFile(directory, 'SCENARIO.DATA')!.firstBlock + SCENARIO_BLOCKS);
  });

  it('refuses a file too big for the disk', (): void => {
    expect((): Uint8Array => buildDiskImage('WSTEST', [{ name: 'BIG', bytes: new Uint8Array(200_000) }]))
      .toThrow(/does not fit/);
  });
});


describe('toVolumeName', (): void => {
  it('puts a name into the upper case a volume name uses', (): void => {
    expect(toVolumeName('trebor')).toBe('TREBOR');
  });

  it('drops what a volume name cannot hold', (): void => {
    expect(toVolumeName('DISK 1')).toBe('DISK1');
  });

  it('trims to the seven characters a volume name allows', (): void => {
    expect(toVolumeName('ABCDEFGHIJ')).toBe('ABCDEFG');
  });

  it('falls back when nothing usable is left', (): void => {
    expect(toVolumeName('!!!')).toBe('WIZSAVE');
  });
});


describe('exporting and importing a save disk', (): void => {
  it('produces a disk image this app accepts', (): void => {
    const result: ScenarioImportResult = importScenarioDisk(exportSaveDisk(aSaveDisk()).bytes);

    expect(result.ok).toBe(true);
  });

  it('brings the scenario back byte for byte', (): void => {
    const disk: ISaveDisk = aSaveDisk();
    const result: ScenarioImportResult = importScenarioDisk(exportSaveDisk(disk).bytes);

    expect(result.ok && [...result.files.scenarioData]).toEqual([...disk.scenarioData]);
  });

  it('brings the messages back with it', (): void => {
    const disk: ISaveDisk = aSaveDisk();
    const result: ScenarioImportResult = importScenarioDisk(exportSaveDisk(disk).bytes);

    expect(result.ok && [...(result.files.scenarioMessages as Uint8Array)]).toEqual([...(disk.scenarioMessages as Uint8Array)]);
  });

  it('exports a disk that never had messages', (): void => {
    const result: ScenarioImportResult = importScenarioDisk(exportSaveDisk(aSaveDisk('DISK 1', false)).bytes);

    expect(result.ok && result.files.scenarioMessages).toBeNull();
  });

  it('keeps the scenario name', (): void => {
    const result: ScenarioImportResult = importScenarioDisk(exportSaveDisk(aSaveDisk()).bytes);

    expect(result.ok && result.files.summary.gameName).toBe('A TEST SCENARIO');
  });

  it('names the file after the disk', (): void => {
    expect(exportSaveDisk(aSaveDisk('DISK 1')).fileName).toBe('DISK-1.dsk');
  });

  it('names a file safely when the disk name would not make one', (): void => {
    expect(exportSaveDisk(aSaveDisk('///')).fileName).toBe('wizardry-save.dsk');
  });

  it('writes a disk of the size a real one is', (): void => {
    const exported: IExportedDisk = exportSaveDisk(aSaveDisk());

    expect(exported.bytes.length).toBe(143360);
  });
});
